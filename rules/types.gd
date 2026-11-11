class_name RulesTypes
extends RefCounted
## Runtime states remain plain Dictionaries with the original camelCase JSON keys.
## Card/RowEntry/GameSnapshot/GameState correspond directly to types.ts interfaces.
static var last_error: String = ""
const _BIG_BASE: int = 1 << 26
const _BIG_MASK: int = _BIG_BASE-1
const _INFINITY_BITS: int = 0x7ff0000000000000

## Godot's built_in_strtod can be one ULP from the correctly rounded JS value.
## Compare the original decimal rational with exact binary midpoints instead of
## accepting an epsilon. Limbs are 26 bits so every multiplication fits int64.
static func parse_json_number(token: String) -> float:
	var raw: String = token.to_lower()
	var negative: bool = raw.begins_with("-")
	if negative: raw = raw.substr(1)
	var pieces: PackedStringArray = raw.split("e")
	var exponent: int = 0
	if pieces.size() > 1:
		var exponent_text: String = pieces[1].trim_prefix("+")
		if exponent_text.trim_prefix("-").length() > 6: exponent = -1000000 if exponent_text.begins_with("-") else 1000000
		else: exponent = exponent_text.to_int()
	var coefficient: String = pieces[0]
	var dot: int = coefficient.find(".")
	if dot >= 0: exponent -= coefficient.length()-dot-1; coefficient = coefficient.replace(".","")
	while coefficient.begins_with("0"): coefficient = coefficient.substr(1)
	if coefficient.is_empty(): return signed_zero(negative)
	while coefficient.ends_with("0"): coefficient = coefficient.left(-1); exponent += 1
	var magnitude: int = coefficient.length()+exponent-1
	if magnitude > 308: return -INF if negative else INF
	if magnitude < -324: return signed_zero(negative)
	var numerator: Array = _big_decimal(coefficient)
	var five_power: Array = [1]
	if exponent >= 0:
		for _i: int in range(exponent): numerator = _big_small(numerator,5)
	else:
		for _i: int in range(-exponent): five_power = _big_small(five_power,5)
	var context: Dictionary = {"numerator":numerator,"five":five_power,"exponent":exponent}
	var approximation: float = raw.to_float()
	var bytes: PackedByteArray = PackedByteArray(); bytes.resize(8); bytes.encode_double(0,approximation)
	var bits: int = bytes.decode_u64(0)
	if bits >= _INFINITY_BITS: bits = _INFINITY_BITS-1
	var settled: bool = false
	for _attempt: int in range(8):
		if bits > 0:
			var lower: int = _compare_midpoint(context,bits-1,bits)
			if lower < 0 or (lower == 0 and (bits&1) != 0): bits -= 1; continue
		if bits < _INFINITY_BITS:
			var upper: int = _compare_midpoint(context,bits,bits+1)
			if upper > 0 or (upper == 0 and (bits&1) != 0): bits += 1; continue
		settled = true; break
	if not settled:
		# An unusually inaccurate platform approximation still gets exact rounding.
		var lo: int = 0
		var hi: int = _INFINITY_BITS
		while lo < hi:
			var mid: int = lo+((hi-lo)>>1)
			var comparison: int = _compare_midpoint(context,mid,mid+1)
			if comparison > 0 or (comparison == 0 and (mid&1) != 0): lo = mid+1
			else: hi = mid
		bits = lo
	bytes.encode_u64(0,bits)
	var result: float = bytes.decode_double(0)
	return -result if negative else result

static func signed_zero(negative: bool = false) -> float:
	# Build the bits: Godot's constant pool can merge literal +0.0 and -0.0.
	var bytes: PackedByteArray = PackedByteArray(); bytes.resize(8)
	bytes.fill(0)
	if negative: bytes[7] = 128
	return bytes.decode_double(0)

static func _big_decimal(digits: String) -> Array:
	var result: Array = [0]
	for i: int in range(digits.length()):
		result = _big_small(result,10)
		var carry: int = digits.unicode_at(i)-48
		var index: int = 0
		while carry > 0:
			if index == result.size(): result.append(0)
			var value: int = int(result[index])+carry
			result[index] = value&_BIG_MASK; carry = value>>26; index += 1
	return result

static func _big_integer(value: int) -> Array:
	var result: Array = []
	while value > 0: result.append(value&_BIG_MASK); value >>= 26
	return result if not result.is_empty() else [0]

static func _big_small(source: Array, factor: int) -> Array:
	var result: Array = []
	var carry: int = 0
	for limb: int in source:
		var value: int = limb*factor+carry
		result.append(value&_BIG_MASK); carry = value>>26
	if carry > 0: result.append(carry)
	return result

static func _big_multiply(a: Array, b: Array) -> Array:
	var result: Array = []
	result.resize(a.size()+b.size()); result.fill(0)
	for i: int in range(a.size()):
		var carry: int = 0
		for j: int in range(b.size()):
			var value: int = int(result[i+j])+int(a[i])*int(b[j])+carry
			result[i+j] = value&_BIG_MASK; carry = value>>26
		result[i+b.size()] += carry
	while result.size() > 1 and result[-1] == 0: result.pop_back()
	return result

static func _big_shift(source: Array, count: int) -> Array:
	var result: Array = []
	var whole: int = int(floor(float(count)/26.0))
	var part: int = count%26
	result.resize(whole); result.fill(0)
	var carry: int = 0
	for limb: int in source:
		var value: int = (limb<<part)+carry
		result.append(value&_BIG_MASK); carry = value>>26
	if carry > 0: result.append(carry)
	while result.size() > 1 and result[-1] == 0: result.pop_back()
	return result

static func _big_compare(a: Array, b: Array) -> int:
	if a.size() != b.size(): return -1 if a.size() < b.size() else 1
	for i: int in range(a.size()-1,-1,-1):
		if a[i] != b[i]: return -1 if a[i] < b[i] else 1
	return 0

static func _float_parts(bits: int) -> Dictionary:
	var exponent: int = (bits>>52)&0x7ff
	var mantissa: int = bits&0xfffffffffffff
	if exponent == 0: return {"mantissa":mantissa,"exponent":-1074}
	return {"mantissa":mantissa|(1<<52),"exponent":exponent-1075}

static func _compare_midpoint(context: Dictionary, lower: int, upper: int) -> int:
	var a: Dictionary = _float_parts(lower)
	var b: Dictionary = _float_parts(upper)
	var binary_exponent: int = min(a.exponent,b.exponent)
	var mantissa: int = (int(a.mantissa)<<(int(a.exponent)-binary_exponent))+(int(b.mantissa)<<(int(b.exponent)-binary_exponent))
	binary_exponent -= 1
	var left: Array = context.numerator
	var right: Array = _big_integer(mantissa)
	var left_exponent: int = max(0,context.exponent)
	if context.exponent < 0:
		right = _big_multiply(right,context.five)
		binary_exponent -= int(context.exponent)
	var difference: int = left_exponent-binary_exponent
	if difference > 0: left = _big_shift(left,difference)
	elif difference < 0: right = _big_shift(right,-difference)
	return _big_compare(left,right)

class StatefulRandomSource extends RefCounted:
	var state: Dictionary = {"rngState":0}
	func _init(source: Dictionary = {"rngState":0}) -> void:
		state = source
	func next_value() -> float:
		state.rngState = (int(state.rngState) + 0x6d2b79f5) & 0xffffffff
		var value: int = state.rngState
		var mixed: int = _imul(value ^ (value >> 15), value | 1)
		mixed = (mixed ^ ((mixed + _imul(mixed ^ (mixed >> 7), mixed | 61)) & 0xffffffff)) & 0xffffffff
		return float((mixed ^ (mixed >> 14)) & 0xffffffff) / 4294967296.0
	func get_state() -> int:
		return int(state.rngState)
	func set_state(value: Variant) -> void:
		state.rngState = (int(fmod(float(value),4294967296.0)) & 0xffffffff) if is_finite(float(value)) else 0
	static func _imul(a: int, b: int) -> int:
		# Partial products stay inside signed int64, unlike full u32 multiplication.
		return (((a & 65535) * (b & 65535)) + ((((a >> 16) * (b & 65535) + (a & 65535) * (b >> 16)) & 65535) << 16)) & 0xffffffff
