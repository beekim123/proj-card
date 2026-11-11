class_name RulesCore
extends RefCounted
## Pure deterministic port of h5/src/rules/index.ts. State is JSON-compatible.
const C = preload("res://rules/config.gd")
const T = preload("res://rules/types.gd")
const E = preload("res://rules/effects.gd")
const RC = preload("res://rules/run_config.gd")
const CONFIG: Dictionary = C.CONFIG
const GEMS: Array = C.GEMS
const FORMS: Array = C.FORMS
const FORM_KEYS: Array = C.FORM_KEYS
const CARD_NAMES: Dictionary = C.CARD_NAMES
const REACTION_NAMES: Dictionary = C.REACTION_NAMES
const TOOLS: Dictionary = C.TOOLS
const TOOL_TYPES: Array = C.TOOL_TYPES
static var last_error: String = ""
static var EFFECTS: Dictionary = E.EFFECTS

static func growth_thresholds(source: Dictionary) -> Array:
	return E.growth_thresholds(source)

static func assert_mask(value: Variant) -> bool:
	if not _integer(value) or value < 0 or value > 7:
		last_error = "宝石位必须是 0–7 的整数"; return false
	return true

static func assert_options(opts: Dictionary) -> bool:
	if not _integer(opts.get("hand")) or not CONFIG.handLimits.has(int(opts.hand)):
		last_error = "手牌上限必须是 6、7 或 8"; return false
	if not opts.get("hint") is bool or not opts.get("grow") is bool or (opts.has("tools") and not opts.tools is bool):
		last_error = "提示、成长与额外牌设置必须是布尔值"; return false
	return true

static func _integer(value: Variant) -> bool:
	return (value is int or value is float) and is_finite(float(value)) and floor(float(value)) == float(value)

static func js_round(value: float) -> float:
	if not is_finite(value) or value == 0: return value
	var lower: float = floor(value)
	var result: float = lower+1.0 if value-lower >= 0.5 else lower
	return T.signed_zero(true) if result == 0 and value < 0 else result

static func _u32(value: Variant) -> int:
	if not is_finite(float(value)): return 0
	return int(fmod(float(value),4294967296.0)) & 0xffffffff

static func next_random(state: Dictionary) -> float:
	var stream: T.StatefulRandomSource = T.StatefulRandomSource.new(state)
	return stream.next_value()

static func random_from_state(state: Dictionary) -> T.StatefulRandomSource:
	return T.StatefulRandomSource.new(state)

static func seeded_rng(seed: Variant) -> T.StatefulRandomSource:
	return random_from_state({"rngState":_u32(seed)})

static func _random_value(source: Variant) -> float:
	var value: Variant = null
	if source is Dictionary: value = next_random(source)
	elif source is Callable: value = source.call()
	elif source is T.StatefulRandomSource: value = source.next_value()
	if not (value is int or value is float) or not is_finite(float(value)) or value < 0 or value >= 1:
		last_error = "随机函数必须返回 [0, 1) 范围内的数"; return -1.0
	return float(value)

static func initial_random_state(source: Variant) -> int:
	if source is int or source is float:
		if not is_finite(float(source)): last_error = "随机种子必须是有限数字"; return -1
		return _u32(source)
	if source is Dictionary and source.has("rngState"): return _u32(source.rngState)
	if source is T.StatefulRandomSource: return _u32(source.get_state())
	var value: float = _random_value(source)
	return _u32(floor(value*4294967296.0)) if value >= 0 else -1

static func shuffle(items: Array, rng: Variant) -> Array:
	for i: int in range(items.size()-1,0,-1):
		var random: float = _random_value(rng)
		if random < 0: return items
		var j: int = int(floor(random*(i+1)))
		var temporary: Variant = items[i]; items[i] = items[j]; items[j] = temporary
	return items

static func create_deck(tools: bool = false) -> Array:
	var cards: Array = []
	for spec: Dictionary in CONFIG.deck:
		for _i: int in range(spec.count): cards.append({"id":cards.size()+1,"v":spec.v})
	if tools:
		for type: String in RC.RUN.toolPool: cards.append(create_tool_card(type,cards.size()+1))
	return cards

static func create_tool_card(type: String, id: Variant) -> Dictionary:
	if not TOOL_TYPES.has(type): last_error = "未知的额外牌类型"; return {}
	return {"id":id,"v":TOOLS[type].v,"type":type}

static func copy_card(card: Dictionary) -> Dictionary:
	return create_tool_card(card.type,card.id) if card.get("type","") else {"id":card.id,"v":card.v}

static func copy_row(entry: Dictionary) -> Dictionary:
	return entry.duplicate(true)

static func _copy_cards(cards: Array) -> Array:
	var result: Array = []
	for card: Dictionary in cards: result.append(copy_card(card))
	return result

static func snapshot(state: Dictionary) -> Dictionary:
	var rows: Array = []
	for entry: Dictionary in state.row: rows.append(copy_row(entry))
	var result: Dictionary = {
		"deck":_copy_cards(state.deck),"discard":_copy_cards(state.discard),"hand":_copy_cards(state.hand),"row":rows,
		"m":state.m,"turnDmg":state.turnDmg,"total":state.total,"turn":state.turn,"best":state.best,"last":state.last,
		"chain":state.chain.duplicate(),"chainIdx":state.chainIdx.duplicate(),"rainbow":state.rainbow,
		"xp":state.xp.duplicate(),"opts":state.opts.duplicate(),"rngState":state.rngState,"onceUsed":state.onceUsed,
	}
	if state.get("relic",""): result.relic = state.relic
	if state.has("relics"): result.relics = state.relics.duplicate()
	return result

static func clone_game(state: Dictionary) -> Dictionary:
	var result: Dictionary = snapshot(state)
	result.hist = []
	for history: Dictionary in state.hist: result.hist.append(snapshot(history))
	return result

static func draw_cards(state: Dictionary, count: Variant) -> Array:
	if not _integer(count) or count < 0: last_error = "摸牌数必须是非负整数"; return []
	var drawn: Array = []
	for _i: int in range(int(count)):
		if state.hand.size() >= RC.RUN.handHardMax: break
		if state.deck.is_empty():
			if state.discard.is_empty(): break
			state.deck = shuffle(_copy_cards(state.discard),random_from_state(state)); state.discard = []
		var card: Dictionary = state.deck.pop_back()
		state.hand.append(card); drawn.append(card)
	return drawn

static func draw_tool_cards(state: Dictionary, count: Variant) -> Array:
	var drawn: Array = []
	var n: int = 0
	while n < count and state.hand.size() < RC.RUN.handHardMax:
		var index: int = state.deck.size()-1
		while index >= 0 and not state.deck[index].get("type",""): index -= 1
		if index < 0: break
		var card: Dictionary = state.deck.pop_at(index)
		state.hand.append(card); drawn.append(card); n += 1
	return drawn

static func refill_hand(state: Dictionary) -> void:
	draw_cards(state,max(0,state.opts.hand-state.hand.size()))

static func create_game(rng: Variant, options: Dictionary = {}) -> Dictionary:
	var opts: Dictionary = {"hint":true,"hand":CONFIG.defaultHandLimit,"grow":true}
	opts.merge(options,true)
	if not assert_options(opts): return {}
	var random_state: int = initial_random_state(rng)
	if random_state < 0: return {}
	var state: Dictionary = {
		"deck":create_deck(bool(opts.get("tools",false))),"discard":[],"hand":[],"row":[],
		"m":CONFIG.multiplierStart,"turnDmg":0,"total":0,"turn":1,"best":0,"last":0,
		"chain":[],"chainIdx":[],"rainbow":false,"xp":[0,0,0],"opts":opts,"hist":[],
		"rngState":random_state,"onceUsed":false,
	}
	shuffle(state.deck,random_from_state(state)); refill_hand(state)
	return state

static func gem_form(state: Dictionary, index: Variant) -> int:
	if not _integer(index) or index < 0 or index >= GEMS.size(): last_error = "宝石索引必须是 0、1 或 2"; return 0
	if not state.opts.grow: return 0
	var count: float = state.xp[int(index)]
	var thresholds: Array = E.growth_thresholds(state)
	return 2 if count >= thresholds[2] else (1 if count >= thresholds[1] else 0)

static func gem_value(state: Dictionary, index: Variant) -> float:
	return 300.0 if RC.is_current() and gem_form(state,index) == 2 and E.active_relics(state).has("shine") else float(CONFIG.gemValue[gem_form(state,index)])

static func base_value(state: Dictionary, value: Variant) -> float:
	if not assert_mask(value): return 0.0
	var sum: float = 0.0
	for index: int in range(GEMS.size()):
		if int(value) & int(GEMS[index].bit): sum += gem_value(state,index)
	return sum

static func reaction(previous: Variant, current: Variant) -> String:
	if not assert_mask(current): return "plain"
	if previous == null: return "plain"
	if not assert_mask(previous): return "plain"
	var x: int = int(previous) ^ int(current)
	var different: int = (x&1)+((x>>1)&1)+((x>>2)&1)
	return "same" if different == 0 else ("shun" if different == 1 else ("white" if different == 3 else "plain"))

static func next_chain(state: Dictionary, value: Variant, kind: String) -> Dictionary:
	var chromatic: bool = CONFIG.rainbowColors.has(int(value))
	var keep: bool = kind == "shun" or (RC.is_current() and kind == "white" and E.active_relics(state).has("link"))
	var colors: Array = state.chain.duplicate() if keep else []
	if chromatic and not colors.has(value): colors.append(value)
	var indices: Array = state.chainIdx.duplicate() if keep else []
	indices.append(state.row.size())
	return {"colors":colors,"indices":indices}

static func resolved_mask(state: Dictionary, card: Dictionary) -> int:
	if not assert_mask(card.v): return 0
	if card.get("type","") and not TOOL_TYPES.has(card.type): last_error = "未知的额外牌类型"; return 0
	var entry: Dictionary = card.duplicate(); entry.effects = []
	var context: Dictionary = {"state":state,"card":card,"entry":entry}
	E.apply_effects([card.type] if card.get("type","") else [],"mask",context)
	return int(context.entry.v)

static func evaluate_card(state: Dictionary, original: Dictionary, monster: Variant = null) -> Dictionary:
	if not assert_mask(original.v): return {}
	if original.get("type","") and not TOOL_TYPES.has(original.type): last_error = "未知的额外牌类型"; return {}
	var entry: Dictionary = original.duplicate()
	entry.merge({"v":original.v,"k":"plain","cm":1,"b":0,"m":state.m,"m2":state.m,"dmg":0,"rainbow":0,"hammer":0,"damage":0,
		"gemValues":[gem_value(state,0),gem_value(state,1),gem_value(state,2)],"grown":[],"rb":false,"effects":[]},true)
	var context: Dictionary = {"state":state,"card":original,"entry":entry,"xp":state.xp.duplicate(),"thresholds":CONFIG.formAt.duplicate(),"need":CONFIG.rainbowColors.size(),"draw":0,"drawTool":0,"times":1,"onceUsed":state.onceUsed}
	if monster is Dictionary and not monster.is_empty(): context.monster = monster.duplicate(); context.monsterWasBroken = monster.broken
	var ids: Array = E.effect_ids(state,original,monster if monster is Dictionary else {})
	E.apply_effects(ids,"prepare",context); E.apply_effects(ids,"mask",context)
	entry.k = reaction(state.row[-1].v if not state.row.is_empty() else null,entry.v)
	E.apply_effects(ids,"reaction",context); E.apply_effects(ids,"gemValues",context)
	for index: int in range(GEMS.size()):
		if int(entry.v) & int(GEMS[index].bit): entry.b += entry.gemValues[index]
	entry.cm = CONFIG.reactionMultiplier[entry.k]
	E.apply_effects(ids,"reactionMultiplier",context)
	entry.dmg = entry.b*entry.m*entry.cm
	entry.m2 = entry.m*CONFIG.multiplierDouble if entry.k in ["shun","white"] else entry.m+CONFIG.multiplierIncrement
	E.apply_effects(ids,"multiplier",context); E.apply_effects(ids,"rainbowNeed",context)
	context.chain = next_chain(state,entry.v,entry.k)
	E.apply_effects(ids,"chain",context)
	var chain: Dictionary = context.chain
	entry.rb = not state.rainbow and chain.colors.size() >= context.need
	entry.rainbow = (state.turnDmg+entry.dmg)*(CONFIG.rainbowMultiplier-1) if entry.rb else 0
	E.apply_effects(ids,"rainbow",context); E.apply_effects(ids,"hammer",context)
	entry.damage = entry.dmg+entry.rainbow+entry.hammer
	E.apply_effects(ids,"finalDamage",context)
	if context.has("monster"):
		context.monster.hp = max(0,context.monster.hp-entry.damage)
		context.monster.broken = context.monster.hp == 0
	E.apply_effects(ids,"afterMonster",context); E.apply_effects(ids,"growthThresholds",context)
	for index: int in range(GEMS.size()):
		if int(entry.v) & int(GEMS[index].bit): context.xp[index] += 1
	E.apply_effects(ids,"afterCard",context)
	var free: int = RC.RUN.handHardMax-max(0,state.hand.size()-1)
	var requested: int = context.draw+context.drawTool
	var tool_count: int = 0
	for card: Dictionary in state.deck:
		if card.get("type",""): tool_count += 1
	if requested > free: entry.effects.append({"id":"handFull","text":"手里拿不下了"})
	elif context.drawTool > tool_count: entry.effects.append({"id":"whistleEmpty","text":"牌堆里没有额外牌"})
	for index: int in range(GEMS.size()):
		var before: int = gem_form(state,index)
		if state.opts.grow and before < 2 and context.xp[index] >= context.thresholds[before+1]: entry.grown.append(index)
	E.apply_effects(ids,"afterGrowth",context); E.apply_effects(ids,"afterLayer",context)
	if RC.is_current() and (ids.has("cap") or (context.has("monster") and E.active_monster_rule(context.monster) == "cap")):
		entry.m2 = minf(entry.m2,32)
	return context

static func preview_card(state: Dictionary, card_or_mask: Variant) -> Dictionary:
	var card: Dictionary = card_or_mask if card_or_mask is Dictionary else {"id":-1,"v":card_or_mask}
	var context: Dictionary = evaluate_card(state,card)
	return context.get("entry",{})

static func play_card(state: Dictionary, hand_index: Variant, monster: Variant = null) -> Dictionary:
	if not _integer(hand_index) or hand_index < 0 or hand_index >= state.hand.size(): last_error = "手牌索引超出范围"; return {}
	var context: Dictionary = evaluate_card(state,state.hand[int(hand_index)],monster)
	if context.is_empty(): return {}
	var entry: Dictionary = context.entry
	var chain: Dictionary = context.chain
	state.hist.append(snapshot(state)); state.hand.remove_at(int(hand_index)); state.row.append(entry)
	state.m = entry.m2; state.turnDmg += entry.damage; state.total += entry.damage
	state.chain = chain.colors; state.chainIdx = chain.indices
	if entry.rb:
		state.rainbow = true
		for index: Variant in state.chainIdx: state.row[int(index)].rb = true
	state.xp = context.xp; state.onceUsed = context.onceUsed
	if monster is Dictionary and context.has("monster"): monster.merge(context.monster,true)
	draw_cards(state,context.draw); draw_tool_cards(state,context.drawTool)
	return entry

static func end_turn(state: Dictionary, _rng: Variant = null) -> Dictionary:
	state.last = state.turnDmg; state.best = max(state.best,state.turnDmg)
	if not state.row.is_empty(): state.turn += 1
	for entry: Dictionary in state.row:
		if not entry.get("spent",false): state.discard.append(copy_card(entry))
	state.row = []
	state.m = CONFIG.multiplierStart; state.turnDmg = 0; state.chain = []; state.chainIdx = []; state.rainbow = false; state.onceUsed = false; state.hist = []
	refill_hand(state)
	return state

static func undo(state: Dictionary) -> bool:
	if state.hist.is_empty(): return false
	var previous: Dictionary = state.hist.pop_back()
	state.merge(snapshot(previous),true)
	return true

static func set_hand_limit(state: Dictionary, limit: Variant, _rng: Variant = null) -> Dictionary:
	var opts: Dictionary = state.opts.duplicate(); opts.hand = limit
	if not assert_options(opts): return state
	var previous_limit: int = state.opts.hand
	state.opts.hand = limit
	if limit > previous_limit: refill_hand(state)
	return state

static func update_settings(state: Dictionary, options: Dictionary, _rng: Variant = null) -> Dictionary:
	var next: Dictionary = state.opts.duplicate(); next.merge(options,true)
	if not assert_options(next): return state
	if bool(next.get("tools",false)) != bool(state.opts.get("tools",false)):
		state.merge(create_game(state.rngState,next),true); return state
	var previous_limit: int = state.opts.hand
	state.opts = next
	if next.hand > previous_limit: refill_hand(state)
	return state

static func reset_growth(state: Dictionary) -> Dictionary:
	state.xp = [0,0,0]
	return state

static func make_debug_game(sequence: Array, rng: Variant, options: Dictionary = {}) -> Dictionary:
	var opts: Dictionary = options.duplicate()
	if not opts.has("tools"):
		opts.tools = false
		for value: Variant in sequence:
			if value is String: opts.tools = true; break
	var state: Dictionary = create_game(rng,opts)
	if state.is_empty(): return {}
	var pool: Array = state.deck+state.hand
	var hand: Array = []
	for value: Variant in sequence:
		if not value is String and not assert_mask(value): return {}
		var index: int = -1
		for i: int in range(pool.size()):
			var card: Dictionary = pool[i]
			if (value is String and card.get("type","") == value) or (not value is String and not card.get("type","") and card.v == value): index = i; break
		if index < 0:
			var name: String = TOOLS.get(value,{}).get("name","undefined") if value is String else CARD_NAMES[int(value)]
			last_error = "发牌序列超出牌组中的%s数量" % name; return {}
		hand.append(pool.pop_at(index))
	state.hand = hand; state.deck = pool
	return state

static func _log10_floor(value: float) -> int:
	# Correct decimal powers without depending on platform log rounding.
	var exponent: int = int(floor(log(value)/log(10.0)))
	while value < pow(10.0,exponent): exponent -= 1
	while value >= pow(10.0,exponent+1): exponent += 1
	return exponent

static func _commas(value: float) -> String:
	var digits: String = str(int(value))
	var result: String = ""
	for i: int in range(digits.length()):
		if i > 0 and (digits.length()-i)%3 == 0: result += ","
		result += digits[i]
	return result

static func format_number(value: Variant) -> String:
	if not (value is float or value is int) or not is_finite(float(value)): last_error = "只能格式化有限数字"; return ""
	var sign_text: String = "-" if value < 0 else ""
	var n: float = js_round(abs(float(value)))
	for unit: Array in [[1e16,"京"],[1e12,"兆"],[1e8,"亿"],[1e4,"万"]]:
		var threshold: float = unit[0]
		if n < threshold: continue
		var part: float = n/threshold
		var decimals: int = max(0,3-_log10_floor(part))
		var step: float = pow(10.0,max(0,_log10_floor(n)-3))
		var rounded: float = js_round(n/step)*step
		var fixed: String = ("%."+str(decimals)+"f") % (rounded/threshold)
		if fixed.contains("."):
			while fixed.ends_with("0"): fixed = fixed.left(-1)
			if fixed.ends_with("."): fixed = fixed.left(-1)
		return sign_text+fixed+str(unit[1])
	return sign_text+_commas(n)

static func format_full(value: Variant) -> String:
	if not (value is float or value is int) or not is_finite(float(value)): last_error = "只能格式化有限数字"; return ""
	if abs(float(value)) >= 1e12: return format_number(value)
	var n: float = js_round(abs(float(value)))
	return ("-" if value < 0 and n != 0 else "")+_commas(n)

static func _format(value: Variant, formatter: Variant) -> String:
	return formatter.call(value) if formatter is Callable and formatter.is_valid() else format_number(value)

static func _has_effect(entry: Dictionary, id: String) -> bool:
	for effect: Dictionary in entry.effects:
		if effect.id == id: return true
	return false

static func format_formula(entry: Dictionary, preview: bool = false, formatter: Variant = null) -> String:
	var pieces: Array[String] = []
	for index: int in range(GEMS.size()):
		if int(entry.v) & int(GEMS[index].bit): pieces.append(GEMS[index].shortName+" "+_format(entry.gemValues[index],formatter)+("（抱红）" if index == 0 and _has_effect(entry,"hug") else ""))
	if _has_effect(entry,"duck"):
		return ("预计 " if preview else "")+"缩头：本张最终伤害 0，倍率、成长和其他效果照常"
	var base: String = _format(entry.b,formatter)
	var composition: String = base
	if pieces.size() > 1: composition = " + ".join(pieces)+" = "+base
	elif (entry.get("type","") or _has_effect(entry,"hug")) and pieces.size() == 1: composition = pieces[0]
	var reaction_term: String = "" if entry.k == "plain" else " × "+REACTION_NAMES[entry.k]+" "+_format(entry.cm,formatter)+("（断一次不算）" if _has_effect(entry,"once") else "")
	var rainbow_term: String = "　彩虹！这回合 ×%s　+%s" % [CONFIG.rainbowMultiplier,_format(entry.rainbow,formatter)] if entry.rainbow > 0 else ""
	var type: String = entry.get("type","")
	var name: String = TOOLS[type].name if type else CARD_NAMES[int(entry.v)]
	if type == "mirror": name = TOOLS.mirror.name if entry.k == "plain" and entry.v == 0 else TOOLS.mirror.name+"（变成"+("没宝石" if entry.v == 0 else CARD_NAMES[int(entry.v)])+"）"
	var effect: String = ""
	match type:
		"bag": effect = "　摸 %s 张" % TOOLS.bag.draw
		"lens": effect = "　倍率再 ×%s → %s" % [TOOLS.lens.multiplier,_format(entry.m2,formatter)]
		"hammer": effect = "　锤子！这回合 ×%s　+%s" % [TOOLS.hammer.turnMultiplier,_format(entry.hammer,formatter)]
		"stone": effect = "　三颗宝石各 +%s 次" % TOOLS.stone.xp
	return ("预计 " if preview else "")+name+"："+composition+" × 倍率 "+_format(entry.m,formatter)+reaction_term+" = "+_format(entry.dmg,formatter)+rainbow_term+effect

static func format_card_hint(entry: Dictionary) -> String:
	var name: String = "" if entry.k == "plain" else REACTION_NAMES[entry.k]
	var effect: String = ""
	match entry.get("type",""):
		"bag": effect = "摸 %s" % TOOLS.bag.draw
		"lens": effect = "倍率 ×%s" % TOOLS.lens.multiplier
		"hammer": effect = "这回合 ×%s" % TOOLS.hammer.turnMultiplier
		"stone": effect = "宝石 +%s" % TOOLS.stone.xp
	var result: Array[String] = []
	if not name.is_empty(): result.append(name)
	if not effect.is_empty(): result.append(effect)
	return " · ".join(result)
