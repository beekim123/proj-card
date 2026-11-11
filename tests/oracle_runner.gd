class_name OracleRunner
extends RefCounted
## Executes the original H5 named cases against native GDScript. Each captured
## call restores its real input, invokes production code, and compares both the
## complete mutated arguments and return value (or exact error diagnostic).
const LegacyProjection = preload("res://tests/legacy_projection.gd")
const Core: GDScript = preload("res://rules/index.gd")
const Run: GDScript = preload("res://rules/run.gd")
const Save: GDScript = preload("res://rules/save_state.gd")
const Effects: GDScript = preload("res://rules/effects.gd")
const RC: GDScript = preload("res://rules/run_config.gd")
var _table: Array = []
var _decode_error: String = ""

func _undefined(value: Variant) -> bool:
	return value is Dictionary and value.get("$undefined", false) == true

func _decode(value: Variant) -> Variant:
	if value is Array:
		var result: Array = []
		for item: Variant in value: result.append(_decode(item))
		return result
	if value is Dictionary:
		if value.has("$float64"): return str(value["$float64"]).hex_decode().decode_double(0)
		if value.has("$ref"):
			var index: int = int(value["$ref"])
			if index < 0 or index >= _table.size():
				_decode_error = "Invalid oracle table reference %s" % index; return null
			return _decode(_table[index])
		if value.has("$undefined"): return null
		if value.has("$number"):
			match value["$number"]:
				"NaN": return NAN
				"Infinity": return INF
				"-Infinity": return -INF
		if value.has("$rng"): return Core.seeded_rng(int(value["$rng"]))
		if value.has("$function"):
			if value["$function"] == "() => 1": return func() -> float: return 1.0
			_decode_error = "Unsupported oracle function: " + str(value["$function"]); return null
		if value.has("$jsonString"): return JSON.stringify(_decode(value["$jsonString"]), "", false, true)
		var result: Dictionary = {}
		for key: Variant in value:
			if not _undefined(value[key]): result[key] = _decode(value[key])
		return result
	return value

func _difference(actual: Variant, expected: Variant, path: String = "$") -> String:
	if actual is Object and actual.has_method("get_state"):
		if expected is Object and expected.has_method("get_state"):
			return _difference(actual.get_state(), expected.get_state(), path + ".rngState")
	if actual is Callable and expected is Callable: return ""
	if actual is Dictionary and expected is Dictionary:
		for key: Variant in expected:
			if not actual.has(key): return path + "." + str(key) + " missing"
			var difference: String = _difference(actual[key], expected[key], path + "." + str(key))
			if not difference.is_empty(): return difference
		for key: Variant in actual:
			if not expected.has(key): return path + "." + str(key) + " unexpected"
		return ""
	if actual is Array and expected is Array:
		if actual.size() != expected.size(): return "%s.length: %s != %s" % [path, actual.size(), expected.size()]
		for index: int in range(actual.size()):
			var difference: String = _difference(actual[index], expected[index], path + "[%s]" % index)
			if not difference.is_empty(): return difference
		return ""
	if (actual is int or actual is float) and (expected is int or expected is float):
		if actual == expected or (is_nan(float(actual)) and is_nan(float(expected))): return ""
	elif actual is String and expected is String:
		if actual == expected: return ""
		# JSON envelope key order is immaterial; both strings must still parse.
		var actual_json: JSON = JSON.new()
		var expected_json: JSON = JSON.new()
		if actual_json.parse(actual) == OK and expected_json.parse(expected) == OK:
			return _difference(LegacyProjection.strip(Save.parse_json_exact(actual)), Save.parse_json_exact(expected), path + "(JSON)")
	elif typeof(actual) == typeof(expected) and actual == expected: return ""
	return "%s: %s != %s" % [path, str(actual).left(180), str(expected).left(180)]

func _snake_case(name: String) -> String:
	return name.to_snake_case()

func _module(name: String, function: String) -> GDScript:
	if name == "save-state": return Save
	if name == "run": return Run
	if name == "effects": return Effects
	if Core.has_method(function): return Core
	if Run.has_method(function): return Run
	if Save.has_method(function): return Save
	if Effects.has_method(function): return Effects
	return Core

func _call(record: Dictionary) -> String:
	_decode_error = ""
	var args: Array = _decode(record.argsBefore)
	LegacyProjection.hydrate(args)
	var expected_args: Array = _decode(record.argsAfter)
	var expected: Variant = _decode(record.get("result", {"$undefined": true}))
	if not _decode_error.is_empty(): return _decode_error
	var function: String = _snake_case(record.function)
	var module: GDScript = _module(record.module, function)
	if not module.has_method(function): return "Missing native method: %s.%s" % [record.module, function]
	module.set("last_error", "")
	var previous_scale: Variant = RC.RUN.hpScale
	if function == "create_run" and expected is Dictionary: RC.RUN.hpScale = expected.get("hpScale", previous_scale)
	var actual: Variant = module.callv(function, args)
	RC.RUN.hpScale = previous_scale
	if record.has("error"):
		if module.get("last_error") != record.error.message:
			return "error: %s != %s" % [str(module.get("last_error")), record.error.message]
	else:
		if not str(module.get("last_error")).is_empty(): return "unexpected error: " + str(module.get("last_error"))
		var result_difference: String = _difference(LegacyProjection.strip(actual), expected, "$.result")
		if not result_difference.is_empty(): return result_difference
	return _difference(LegacyProjection.strip(args), expected_args, "$.argsAfter")

func run_files(files: Array) -> Dictionary:
	var passed: int = 0
	var failed: int = 0
	var names: Array[String] = []
	var failures: Array[String] = []
	var calls: int = 0
	var index_file: FileAccess = FileAccess.open("res://tests/oracle-cases.json", FileAccess.READ)
	if index_file == null:
		return {"passed": 0, "failed": 1, "names": ["H5 oracle fixture exists"], "failures": ["Missing tests/oracle-cases.json"], "oracle_calls": 0}
	var index_data: Variant = JSON.parse_string(index_file.get_as_text())
	if not index_data is Dictionary or not index_data.get("cases") is Array:
		return {"passed": 0, "failed": 1, "names": ["H5 oracle fixture valid"], "failures": ["Malformed tests/oracle-cases.json"], "oracle_calls": 0}
	for summary: Dictionary in index_data.cases:
		if not files.has(summary.file): continue
		names.append(summary.name)
		if names.size()%25 == 1: print("Oracle progress: ",names.size()," cases, ",calls," calls; ",summary.file)
		var fixture_file: FileAccess = FileAccess.open("res://" + summary.path, FileAccess.READ)
		var failure: String = ""
		if fixture_file == null: failure = "Missing " + summary.path
		else:
			var fixture: Variant = JSON.parse_string(fixture_file.get_as_text())
			if not fixture is Dictionary or not fixture.get("table") is Array or not fixture.get("calls") is Array: failure = "Malformed " + summary.path
			else:
				_table = fixture.table
				for position: int in range(fixture.calls.size()):
					var difference: String = _call(fixture.calls[position])
					calls += 1
					if not difference.is_empty():
						failure = "call %s %s: %s" % [position, fixture.calls[position].function, difference]
						break
				_table = []
		if failure.is_empty(): passed += 1
		else:
			failed += 1; failures.append(summary.file + " :: " + summary.name + " :: " + failure)
	if names.is_empty():
		failed += 1; failures.append("No H5 cases matched " + str(files))
	return {"passed": passed, "failed": failed, "names": names, "failures": failures, "oracle_calls": calls}
