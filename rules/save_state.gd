class_name RulesSave
extends RefCounted
## Portable v4 JSON envelope, with the same strict checks as the H5 rules.
const Config: GDScript = preload("res://rules/config.gd")
const RC: GDScript = preload("res://rules/run_config.gd")
const Types: GDScript = preload("res://rules/types.gd")
static var last_error: String = ""
static var _number_cache: Dictionary = {}
const ACTIVE_PHASES: Array = ["relic", "battle", "loot", "doors", "shop"]
const MAX_SAFE_INTEGER: int = 9007199254740991

static func object(value: Variant) -> bool:
	return value is Dictionary

static func number(value: Variant, minimum: float = 0.0) -> bool:
	return (value is int or value is float) and is_finite(float(value)) and value >= minimum

static func integer(value: Variant, minimum: float = 0.0) -> bool:
	return number(value, minimum) and value <= MAX_SAFE_INTEGER and floor(float(value)) == float(value)

static func tool(value: Variant) -> bool:
	return value is String and Config.TOOL_TYPES.has(value)

static func relic(value: Variant) -> bool:
	return value is String and RC.RELICS.has(value)

static func _includes(values: Array, value: Variant) -> bool:
	for item: Variant in values:
		if item == value: return true
	return false

static func _unique(value: Array) -> bool:
	var seen: Array = []
	for item: Variant in value:
		if _includes(seen, item): return false
		seen.append(item)
	return true

static func relic_list(value: Variant) -> bool:
	if not value is Array or not _unique(value): return false
	for item: Variant in value:
		if not relic(item): return false
	return true

static func numbers(value: Variant, length: int = -1) -> bool:
	if not value is Array or (length >= 0 and value.size() != length): return false
	for item: Variant in value:
		if not number(item): return false
	return true

static func card(value: Variant, row: bool = false) -> bool:
	if not object(value) or not integer(value.get("id"), 1) or not integer(value.get("v")) or value.v > 7: return false
	if not value.has("type"): return true
	return tool(value.type) and ((row and value.type in ["mirror", "shadow"]) or value.v == Config.TOOLS[value.type].v)

static func row_entry(value: Variant) -> bool:
	if not card(value, true): return false
	for key: String in ["cm", "m", "m2"]:
		if not number(value.get(key), 1): return false
	for key: String in ["b", "dmg", "rainbow", "hammer", "damage"]:
		if not number(value.get(key)): return false
	if value.get("k") not in ["plain", "same", "shun", "white"] or not numbers(value.get("gemValues"), 3): return false
	if not value.get("grown") is Array: return false
	for index: Variant in value.grown:
		if not integer(index) or index >= 3: return false
	if not typeof_boolean(value.get("rb")) or not value.get("effects") is Array: return false
	for effect: Variant in value.effects:
		if not object(effect) or not effect.get("id") is String or not effect.get("text") is String: return false
	return true

static func game(value: Variant, cards: Array, history: bool) -> bool:
	if not object(value) or not typeof_boolean(value.get("onceUsed")): return false
	if value.has("relic") and not relic(value.relic): return false
	if value.has("relics") and not relic_list(value.relics): return false
	var all: Array = []
	for key: String in ["deck", "discard", "hand"]:
		if not value.get(key) is Array: return false
		for item: Variant in value[key]:
			if not card(item): return false
			all.append(item)
	if value.hand.size() > RC.RUN.handHardMax or not value.get("row") is Array: return false
	for item: Variant in value.row:
		if not row_entry(item): return false
		all.append(item)
	if all.size() != cards.size(): return false
	var ids: Array = []
	var canonical: Dictionary = {}
	for item: Dictionary in cards: canonical[int(item.id)] = item
	for item: Dictionary in all:
		if _includes(ids, item.id): return false
		ids.append(item.id)
		if not canonical.has(int(item.id)): return false
		var original: Dictionary = canonical[int(item.id)]
		if original.get("type") != item.get("type") or (item.get("type") not in ["mirror", "shadow"] and original.v != item.v): return false
	if not integer(value.get("rngState")) or value.rngState > 4294967295 or not number(value.get("m"), 1): return false
	if not integer(value.get("turn"), 1) or not typeof_boolean(value.get("rainbow")): return false
	for key: String in ["turnDmg", "total", "best", "last"]:
		if not number(value.get(key)): return false
	if not numbers(value.get("xp"), 3): return false
	for item: Variant in value.xp:
		if not integer(item): return false
	if not value.get("chain") is Array or not value.get("chainIdx") is Array: return false
	for item: Variant in value.chain:
		if not integer(item) or not _includes(Config.CONFIG.rainbowColors, item): return false
	for item: Variant in value.chainIdx:
		if not integer(item) or item >= value.row.size(): return false
	if not object(value.get("opts")) or not typeof_boolean(value.opts.get("hint")) or not typeof_boolean(value.opts.get("grow")): return false
	if not _includes(Config.CONFIG.handLimits, value.opts.get("hand")): return false
	if value.opts.has("tools") and not typeof_boolean(value.opts.tools): return false
	if history:
		if not value.get("hist") is Array: return false
		for item: Variant in value.hist:
			if not game(item, cards, false): return false
	return true

static func typeof_boolean(value: Variant) -> bool:
	return value is bool

static func monster(value: Variant) -> bool:
	if not object(value) or not RC.MONSTERS.has(value.get("key")): return false
	var definition: Dictionary = RC.MONSTERS[value.key]
	if value.get("rule") != definition.rule: return false
	if not number(value.get("hp")) or not number(value.get("maxHp"), 1) or value.hp > value.maxHp: return false
	if not integer(value.get("countdown")) or not integer(value.get("maxCountdown"), 1): return false
	if value.has("sealed") and not typeof_boolean(value.sealed): return false
	if not typeof_boolean(value.get("broken")) or value.broken != (value.hp == 0): return false
	if not number(value.get("turnStartHp"), 1) or not number(value.get("overkill")): return false
	if not integer(value.get("layer"), 1) or value.layer > 3: return false
	if not integer(value.get("wind")) or not integer(value.get("maxWind")) or value.wind > value.maxWind: return false
	if not typeof_boolean(value.get("woundDown")): return false
	if value.rule == "wind":
		return value.maxWind == RC.MONSTERS.soldier.wind and _includes([RC.MONSTERS.soldier.countdown, RC.MONSTERS.soldier.countdown + RC.RELICS.slow.countdown], value.maxCountdown) and value.woundDown == (value.wind == 0)
	return value.wind == 0 and value.maxWind == 0 and value.woundDown == false

static func stats(value: Variant) -> bool:
	if not object(value) or not integer(value.get("turns")) or not number(value.get("bestTurn")): return false
	if not integer(value.get("bestFight"), 1) or value.bestFight > RC.RUN.fights.size() or not number(value.get("maxOverkill")): return false
	if not number(value.get("totalDamage")) or not value.get("fights") is Array: return false
	for entry: Variant in value.fights:
		if not object(entry) or not integer(entry.get("fight"), 1) or entry.fight > RC.RUN.fights.size(): return false
		if not RC.MONSTERS.has(entry.get("monster")) or not typeof_boolean(entry.get("won")): return false
		if not integer(entry.get("turns"), 1) or not number(entry.get("damage")) or not number(entry.get("overkill")): return false
	return true

static func is_active_run_state(value: Variant) -> bool:
	if not object(value) or value.get("phase") not in ACTIVE_PHASES or not value.get("cards") is Array: return false
	var cards: Array = value.cards
	var card_ids: Array = []
	for item: Variant in cards:
		if not card(item): return false
		card_ids.append(item.id)
	if cards.size() < RC.RUN.shop.minDeck or not _unique(card_ids): return false
	if not integer(value.get("maxHearts"), RC.RUN.hearts) or value.maxHearts > RC.RUN.hearts + RC.RELICS.heart.hearts: return false
	if not integer(value.get("hearts"), 1) or value.hearts > value.maxHearts or not _includes([RC.RUN.handStart, RC.RUN.handMax], value.get("handLimit")): return false
	if not integer(value.get("fight"), 1) or value.fight > RC.RUN.fights.size() or not monster(value.get("monster")): return false
	if not game(value.get("game"), cards, true) or not stats(value.get("stats")) or not value.has("result") or value.result != null: return false
	if not relic_list(value.get("relics")): return false
	if not value.get("relicOptions") is Array or not _unique(value.relicOptions): return false
	var owned: Array = value.relics
	for option: Variant in value.relicOptions:
		if not relic(option) or owned.has(option): return false
	if value.maxHearts != RC.RUN.hearts + (RC.RELICS.heart.hearts if owned.has("heart") else 0): return false
	if value.phase == "relic" and value.relicOptions.size() != min(RC.RUN.relicOptions, RC.RELICS.size() - owned.size()): return false
	if value.phase != "relic" and not value.relicOptions.is_empty(): return false
	if owned.is_empty():
		if value.phase != "relic" or not value.has("relic") or value.relic != null or value.game.has("relic"): return false
		if value.game.has("relics") and not value.game.relics.is_empty(): return false
		if value.fight != 1 or value.hearts != RC.RUN.hearts or not value.game.row.is_empty() or value.game.onceUsed != false: return false
	elif not relic(value.get("relic")) or value.game.get("relic") != value.relic or not owned.has(value.relic) or value.game.get("relics") != owned: return false
	if not integer(value.get("act"), 1) or value.act > RC.RUN.acts.size() or not integer(value.get("room"), 1): return false
	var act: Dictionary = RC.RUN.acts[int(value.act) - 1]
	if value.room > act.rooms.size(): return false
	var previous_rooms: int = 0
	for index: int in range(int(value.act) - 1): previous_rooms += RC.RUN.acts[index].rooms.size()
	if value.fight != previous_rooms + value.room: return false
	if not number(value.get("hpScale")) or value.hpScale <= 0 or not integer(value.get("shopsVisited")) or not integer(value.get("nextCardId"), 1): return false
	if not RC.RUN.doorRewards.has(value.get("pendingReward")): return false
	if not value.has("previousNormal") or (value.previousNormal != null and not act.normalMonsters.has(value.previousNormal)): return false
	if not value.get("doors") is Array: return false
	var door_monsters: Array = []
	var door_rewards: Array = []
	for door: Variant in value.doors:
		if not object(door) or not act.normalMonsters.has(door.get("monster")): return false
		if door.get("rule") != RC.MONSTERS[door.monster].rule or not RC.RUN.doorRewards.has(door.get("reward")): return false
		door_monsters.append(door.monster); door_rewards.append(door.reward)
	if value.phase == "doors":
		if act.rooms[int(value.room) - 1].type != "doors" or value.doors.size() != 2 or not _unique(door_monsters) or not _unique(door_rewards): return false
		if door_monsters.has(value.previousNormal) or (value.hearts == value.maxHearts and door_rewards.has("heal")): return false
	if not value.get("monsters") is Array or value.monsters.size() != RC.RUN.fights.size(): return false
	for item: Variant in value.monsters:
		if not item is String or not RC.MONSTERS.has(item): return false
	if not value.get("loot") is Array or not _unique(value.loot): return false
	for item: Variant in value.loot:
		if not tool(item): return false
	if value.phase == "loot" and (not value.monster.broken or value.fight == RC.RUN.fights.size() or value.loot.size() > RC.RUN.lootBonusCount): return false
	if value.phase != "loot" and not value.loot.is_empty(): return false
	if value.phase != "doors" and value.monster.key != value.monsters[int(value.fight) - 1]: return false
	if not value.get("hist") is Array or value.hist.size() != value.game.hist.size(): return false
	if value.phase != "battle" and not value.hist.is_empty(): return false
	var selected_relic: Variant = value.game.get("relic")
	var selected_relics: Variant = value.game.get("relics")
	for snapshot: Dictionary in value.game.hist:
		if snapshot.get("relic") != selected_relic or snapshot.get("relics") != selected_relics: return false
	for entry: Variant in value.hist:
		if not object(entry) or not monster(entry.get("monster")) or not stats(entry.get("stats")): return false
	return true

static func encode_run_save(state: Dictionary) -> Variant:
	last_error = ""
	if state.get("phase") not in ACTIVE_PHASES: return null
	if not is_active_run_state(state):
		last_error = "不能保存不完整的一局"
		return null
	return JSON.stringify({"version": 4, "state": state}, "", false, true)

static func _contains_marker(value: Variant, marker: String) -> bool:
	if value is String: return value.contains(marker)
	if value is Array:
		for item: Variant in value:
			if _contains_marker(item, marker): return true
	elif value is Dictionary:
		for key: Variant in value:
			if str(key).contains(marker) or _contains_marker(value[key], marker): return true
	return false

static func _restore_exact_numbers(value: Variant, marker: String, numbers_by_marker: Dictionary) -> Variant:
	if value is String and value.begins_with(marker) and numbers_by_marker.has(value): return numbers_by_marker[value]
	if value is Array:
		for index: int in range(value.size()): value[index] = _restore_exact_numbers(value[index], marker, numbers_by_marker)
	elif value is Dictionary:
		for key: Variant in value: value[key] = _restore_exact_numbers(value[key], marker, numbers_by_marker)
	return value

static func parse_json_exact(raw: String) -> Variant:
	# Godot's JSON and String.to_float both differ from ECMAScript by one ULP on
	# ordinary decimals (for example 1.9333333333333333). Validate JSON normally,
	# then quote numeric tokens and restore correctly rounded binary64 values.
	# The second parse also preserves JSON's last-key-wins duplicate-key behavior.
	var parser: JSON = JSON.new()
	if parser.parse(raw) != OK: return null
	var marker: String = "__gemcard_exact_number__"
	while raw.contains(marker) or _contains_marker(parser.data, marker): marker += "_"
	var chunks: PackedStringArray = PackedStringArray()
	var numbers_by_marker: Dictionary = {}
	var position: int = 0
	var last_end: int = 0
	var inside_string: bool = false
	while position < raw.length():
		var character: String = raw.substr(position, 1)
		if inside_string:
			if character == "\\": position += 2; continue
			if character == '"': inside_string = false
			position += 1; continue
		if character == '"': inside_string = true; position += 1; continue
		if character == "-" or (character >= "0" and character <= "9"):
			var start: int = position
			position += 1
			while position < raw.length() and raw.substr(position, 1) in ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "e", "E", "+", "-"]: position += 1
			var token: String = raw.substr(start, position - start)
			if token == "-0" or token.contains(".") or token.contains("e") or token.contains("E") or token.length() > 15:
				var name: String = marker + str(numbers_by_marker.size())
				if not _number_cache.has(token):
					if _number_cache.size() >= 4096: _number_cache.clear()
					_number_cache[token] = Types.parse_json_number(token)
				numbers_by_marker[name] = _number_cache[token]
				chunks.append(raw.substr(last_end, start - last_end))
				chunks.append('"' + name + '"')
				last_end = position
			continue
		position += 1
	if numbers_by_marker.is_empty(): return parser.data
	chunks.append(raw.substr(last_end))
	if parser.parse("".join(chunks)) != OK: return null
	return _restore_exact_numbers(parser.data, marker, numbers_by_marker)

static func decode_run_save(raw: Variant) -> Dictionary:
	last_error = ""
	if raw == null: return {"state": null, "clear": false, "reason": "empty"}
	if raw is String:
		var envelope: Variant = parse_json_exact(raw)
		if object(envelope) and integer(envelope.get("version")) and envelope.version < 4:
			return {"state": null, "clear": true, "reason": "outdated"}
		if object(envelope) and envelope.get("version") == 4 and is_active_run_state(envelope.get("state")):
			return {"state": envelope.state, "clear": false, "reason": "ok"}
	return {"state": null, "clear": true, "reason": "invalid"}
