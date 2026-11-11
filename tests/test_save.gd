class_name TestSave
extends RefCounted
## Structural save tests mirror h5/src/rules/save-state.test.ts.
const R: GDScript = preload("res://rules/run.gd")
const S: GDScript = preload("res://rules/save_state.gd")
const C: GDScript = preload("res://rules/index.gd")
var passed: int = 0
var failed: int = 0
var names: Array[String] = []
var failures: Array[String] = []

func _check(name: String, condition: bool) -> void:
	names.append(name)
	if condition: passed += 1
	else:
		failed += 1
		failures.append(name)

func _equal(actual: Variant, expected: Variant) -> bool:
	if actual is Dictionary and expected is Dictionary:
		if actual.size() != expected.size(): return false
		for key: Variant in actual:
			if not expected.has(key) or not _equal(actual[key], expected[key]): return false
		return true
	if actual is Array and expected is Array:
		if actual.size() != expected.size(): return false
		for index: int in range(actual.size()):
			if not _equal(actual[index], expected[index]): return false
		return true
	if (actual is int or actual is float) and (expected is int or expected is float): return actual == expected
	return typeof(actual) == typeof(expected) and actual == expected

func _battle(seed: int = 123) -> Dictionary:
	var state: Dictionary = R.create_run(seed)
	R.choose_relic(state, 0)
	return state

func _raw(state: Dictionary, version: int = 4) -> String:
	return JSON.stringify({"version": version, "state": state})

func _round_trip(state: Dictionary) -> Dictionary:
	var raw: Variant = S.encode_run_save(state)
	if raw == null: return {}
	var loaded: Dictionary = S.decode_run_save(raw)
	if loaded.reason != "ok": return {}
	return loaded.state

func _win(state: Dictionary) -> void:
	state.monster.hp = 1
	state.monster.turnStartHp = 1
	while not state.monster.broken and not state.game.hand.is_empty(): R.play_run_card(state, 0)
	R.end_run_turn(state)

func _continue(state: Dictionary) -> void:
	match state.phase:
		"relic": R.choose_relic(state, 0)
		"doors":
			var index: int = 0
			for i: int in range(state.doors.size()):
				if state.doors[i].reward == "shop": index = i
			R.choose_door(state, index)
		"loot": R.choose_loot(state, 0)
		"shop": R.shop_copy(state, state.cards[0].id)
		"battle":
			if state.monster.broken or state.game.hand.is_empty(): R.end_run_turn(state)
			else: R.play_run_card(state, 0)

func _checkpoints() -> Array:
	var state: Dictionary = _battle(808)
	_win(state)
	R.choose_loot(state, 0)
	var doors: Dictionary = state.duplicate(true)
	var shop_index: int = -1
	for i: int in range(state.doors.size()):
		if state.doors[i].reward == "shop": shop_index = i
	if shop_index < 0: return []
	R.choose_door(state, shop_index)
	_win(state)
	var shop: Dictionary = state.duplicate(true)
	R.shop_copy(state, state.cards[0].id)
	_win(state)
	var elite: Dictionary = state.duplicate(true)
	R.choose_relic(state, 0)
	R.choose_door(state, 0)
	R.debug_give_relic(state, "twice")
	while state.game.hand.size() > 8: state.game.deck.push_front(state.game.hand.pop_back())
	for type: String in ["seal", "hourglass", "shadow", "whistle"]:
		var card: Dictionary = C.create_tool_card(type, state.nextCardId)
		state.nextCardId += 1
		state.cards.append(card.duplicate(true))
		state.game.hand.append(card.duplicate(true))
	R.play_run_card(state, state.game.hand.size() - 4)
	R.play_run_card(state, state.game.hand.size() - 3)
	return [doors, shop, elite, state]

func run() -> Dictionary:
	passed = 0; failed = 0; names.clear(); failures.clear()
	var state: Dictionary = _battle()
	R.play_run_card(state, 0); R.play_run_card(state, 0)
	var restored: Dictionary = _round_trip(state)
	var ok: bool = _equal(restored, state)
	if not restored.is_empty():
		ok = R.undo_run(restored) and R.undo_run(state) and _equal(restored, state) and ok
		R.play_run_card(state, 0); R.play_run_card(restored, 0)
		ok = _equal(restored, state) and ok
	_check("完整v4活跃状态往返，包括可继续撤回与RNG状态", ok)
	state = _battle(1); restored = _round_trip(state)
	var hand_size: int = state.game.hand.size()
	if not restored.is_empty(): restored.game.hand.pop_back()
	_check("读取产生独立对象，不与原状态共享数组", not restored.is_empty() and state.game.hand.size() == hand_size)
	state = _battle(321); _win(state); restored = _round_trip(state)
	ok = _equal(restored, state)
	if not restored.is_empty():
		R.choose_loot(state, 0); R.choose_loot(restored, 0)
		ok = ok and _equal(state, restored) and S.is_active_run_state(state)
	_check("战利品和选牌后的随机流不因读档改变", ok)
	state = _battle(2)
	var mirror: Dictionary = C.create_tool_card("mirror", 31)
	state.cards.append(mirror.duplicate(true)); state.game.hand.append(mirror.duplicate(true))
	var mask: int = state.game.hand[0].v
	R.play_run_card(state, 0); R.play_run_card(state, state.game.hand.size() - 1)
	_check("桌面镜子可保留有效宝石位，牌组镜子仍为空白", state.game.row.back().v == 7 - mask and _equal(_round_trip(state), state))
	_check("空存档不要求清除", S.decode_run_save(null) == {"state": null, "clear": false, "reason": "empty"})
	for raw: String in ["", "broken JSON", "null", "[]", '{"version":4,"state":{}}']:
		_check("损坏或版本不符返回清除指令：%s" % raw, S.decode_run_save(raw) == {"state": null, "clear": true, "reason": "invalid"})
	state = _battle(); state.game.hand[0] = state.game.hand[1].duplicate(true)
	ok = S.decode_run_save(_raw(state)).clear
	state = _battle(); state.game.deck.pop_back()
	_check("重复或丢失卡牌身份拒绝，不能载入破坏守恒的状态", ok and S.decode_run_save(_raw(state)).clear)
	state = _battle(); state.game.rngState = -1
	ok = S.decode_run_save(_raw(state)).clear
	state.game.rngState = 4294967296
	_check("随机数必须为32位可保存整数", ok and S.decode_run_save(_raw(state)).clear)
	state = _battle(4); R.play_run_card(state, 0); state.hist.pop_back()
	_check("损坏或不成对的撤回记录拒绝", S.decode_run_save(_raw(state)).clear)
	state = _battle(7); state.game.total = INF
	_check("非有限数值不可保存，不让JSON把它静默变为null", S.encode_run_save(state) == null and S.last_error == "不能保存不完整的一局")
	state = _battle(10); R.abandon_run(state)
	_check("终局不保存，意外残留的终局档要求清除", S.encode_run_save(state) == null and S.decode_run_save(_raw(state)).clear)
	state = R.create_run(42); restored = _round_trip(state)
	ok = _equal(state, restored)
	if not restored.is_empty():
		R.choose_relic(state, 1); R.choose_relic(restored, 1)
	_check("round-trips relic choices before the first battle", ok and _equal(state, restored))
	for version: int in range(4):
		_check("distinguishes outdated version %d from corruption" % version, S.decode_run_save(_raw({}, version)) == {"state": null, "clear": true, "reason": "outdated"})
	state = _battle(42); R.play_run_card(state, 0); ok = true
	for change: int in range(5):
		var altered: Dictionary = state.duplicate(true)
		match change:
			0: altered.game.erase("onceUsed")
			1: altered.game.hist[0].erase("onceUsed")
			2: altered.game.row[0].erase("effects")
			3: altered.game.row[0].effects = [{"id": 1, "text": "bad"}]
			4: altered.game.hist[0].relic = "invalid"
		ok = ok and S.decode_run_save(_raw(altered)).reason == "invalid"
	_check("requires once-used and effect records, including undo snapshots", ok)
	state = _battle(); state.maxHearts = 5
	ok = S.decode_run_save(_raw(state)).reason == "invalid"
	state = _battle(); state.game.erase("relic")
	ok = ok and S.decode_run_save(_raw(state)).reason == "invalid"
	state = R.create_run(42); state.relicOptions[1] = state.relicOptions[0]
	_check("validates relic ownership and heart capacity", ok and S.decode_run_save(_raw(state)).reason == "invalid")
	var checkpoints: Array = _checkpoints()
	ok = checkpoints.size() == 4
	if ok:
		ok = checkpoints[0].phase == "doors" and checkpoints[1].phase == "shop" and checkpoints[2].phase == "relic" and checkpoints[3].monster.sealed
		for checkpoint: Dictionary in checkpoints:
			restored = _round_trip(checkpoint)
			ok = ok and _equal(restored, checkpoint)
			if restored.is_empty(): continue
			for step: int in range(30):
				_continue(checkpoint); _continue(restored)
				ok = ok and _equal(checkpoint, restored)
	_check("185/208/212: preserves doors, shop, elite choices and sealed turn for 30 further commands each", ok)
	checkpoints = _checkpoints(); ok = checkpoints.size() == 4
	if ok:
		state = checkpoints[3]; state.monster.countdown = state.monster.maxCountdown + 5
		var shadow_index: int = -1
		for i: int in range(state.game.hand.size()):
			if state.game.hand[i].get("type") == "shadow": shadow_index = i
		R.play_run_card(state, shadow_index); restored = _round_trip(state)
		ok = _equal(state, restored)
		if not restored.is_empty():
			R.undo_run(state); R.undo_run(restored); ok = ok and _equal(state, restored)
	_check("preserves over-full hourglass countdown, shadow masks and both undo stacks", ok)
	checkpoints = _checkpoints(); ok = checkpoints.size() == 4
	if ok:
		state = checkpoints[1]
		R.shop_drop(state, [state.cards[0].id, state.cards[1].id, state.cards[2].id])
		ok = state.cards.size() < 30 and _equal(_round_trip(state), state)
		state.cards = state.cards.slice(0, 19)
		ok = ok and not S.is_active_run_state(state)
	_check("accepts decks reduced below the original 30-card size and rejects below 20", ok)
	checkpoints = _checkpoints(); ok = checkpoints.size() == 4
	if ok:
		state = checkpoints[0]; state.doors[1] = state.doors[0].duplicate(true)
		ok = not S.is_active_run_state(state)
	for change: int in range(4):
		state = _battle()
		match change:
			0: state.act = 0
			1: state.room = 50
			2: state.hpScale = INF
			3: state.monster.sealed = "true"
		ok = ok and S.decode_run_save(_raw(state)).reason == "invalid"
	_check("rejects duplicate doors, malformed new fields and unknown future versions", ok and S.decode_run_save(_raw(_battle(1), 5)).reason == "invalid")
	return {"passed": passed, "failed": failed, "names": names.duplicate(), "failures": failures.duplicate()}
