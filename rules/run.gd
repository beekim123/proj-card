class_name RulesRun
extends RefCounted
## Pure, mutable adventure commands; no clock, storage, UI or global RNG.
const Core: GDScript = preload("res://rules/index.gd")
const Config: GDScript = preload("res://rules/config.gd")
const RC: GDScript = preload("res://rules/run_config.gd")
const RunTypes: GDScript = preload("res://rules/run_types.gd")
const Progression: GDScript = preload("res://rules/progression.gd")
const Effects: GDScript = preload("res://rules/effects.gd")
static var last_error: String = ""

static func _fail(message: String) -> void:
	last_error = message

static func _integer(value: Variant) -> bool:
	return (value is int or value is float) and is_finite(float(value)) and floor(float(value)) == float(value)

static func _includes(values: Array, value: Variant) -> bool:
	for item: Variant in values:
		if item == value: return true
	return false

static func copy_stats(stats: Dictionary) -> Dictionary:
	return stats.duplicate(true)

static func clone_run(state: Dictionary) -> Dictionary:
	return state.duplicate(true)

static func make_monster(key: String, fight: int, hp_scale: Variant = null) -> Dictionary:
	var scale: float = float((1.0 if RC.is_current() else RC.RUN.hpScale) if hp_scale == null else hp_scale)
	var config: Dictionary = RC.RUN.fights[fight - 1]
	var result: Dictionary = {"key": key, "hp": config.hp * scale, "maxHp": config.hp * scale,
		"countdown": config.countdown, "maxCountdown": config.countdown,
		"broken": false, "turnStartHp": config.hp * scale, "overkill": 0,
		"rule": RC.MONSTERS[key].rule, "layer": 1, "wind": 0, "maxWind": 0, "woundDown": false}
	if key == "dragon":
		var position: int = fight - 1
		for act: Dictionary in RC.RUN.acts:
			if position < act.rooms.size():
				result.layerRules = act.get("dragonRules",["hug","bite","bell"]).duplicate(); break
			position -= act.rooms.size()
	return result

static func create_run(seed: Variant, options: Dictionary = {}) -> Dictionary:
	last_error = ""
	Core.set("last_error", "")
	var scale: float = float(RC.RUN.hpScale)
	if RC.is_current():
		var tier: Variant = options.get("tier",0)
		var unlocked: Variant = options.get("unlockedTier",0)
		var tuning: Variant = options.get("tuningScale",1)
		var multiplier: float = Progression.tier_multiplier(tier)
		if multiplier < 0 or not _integer(unlocked) or unlocked < 0 or unlocked > 5 or tier > unlocked or not (tuning is int or tuning is float) or not is_finite(float(tuning)) or tuning <= 0:
			_fail("难度未解锁或倍率无效"); return {}
		scale = multiplier*float(tuning)
		if not is_finite(scale) or not is_finite(scale*25000000.0) or scale <= 0: _fail("血量倍率无效"); return {}
	var game: Dictionary = Core.create_game(seed, {"hand": RC.RUN.handStart, "grow": true, "tools": false})
	if not Core.last_error.is_empty():
		_fail(Core.last_error); return {}
	var rng: Variant = Core.random_from_state(game)
	var monsters: Array = []
	for act: Dictionary in RC.RUN.acts:
		for config: Dictionary in act.rooms:
			if config.has("monster"): monsters.append(config.monster)
			elif monsters.size() >= 6: monsters.append(act.normalMonsters[0])
			else: monsters.append(act.normalMonsters[int(floor(rng.next_value() * act.normalMonsters.size()))])
	var state: Dictionary = {
		"act": 1, "room": 1, "doors": [], "pendingReward": "card", "previousNormal": monsters[0],
		"hpScale": scale, "shopsVisited": 0, "nextCardId": Core.create_deck().size() + 1,
		"cards": Core.create_deck(), "hearts": RC.RUN.hearts, "maxHearts": RC.RUN.hearts, "handLimit": RC.RUN.handStart,
		"relicOptions": Core.shuffle(_starting_pool(options), rng).slice(0, RC.RUN.relicOptions), "relic": null, "relics": [],
		"fight": 1, "monsters": monsters, "monster": make_monster(monsters[0], 1,scale), "game": game,
		"phase": "relic", "loot": [], "hist": [], "result": null,
		"stats": {"turns": 0, "bestTurn": 0, "bestFight": 1, "maxOverkill": 0, "totalDamage": 0, "fights": []},
	}
	if not RC.RUN.legacy:
		state.runId = str(options.get("runId","")); state.contentVersion = RC.RUN.contentVersion
		state.relicPurpose = "initial"; state.startingRelics = _starting_pool(options)
	if RC.is_current():
		state.difficulty = {"tier":int(options.get("tier",0)),"tuningScale":options.get("tuningScale",1)}
		state.guardUsedThisAct = false
	Effects.apply_lifecycle(state, "fightStart")
	return state

static func choose_relic(state: Dictionary, option_index: Variant) -> Dictionary:
	last_error = ""
	if state.phase != "relic":
		_fail("当前不在选宝物阶段"); return state
	if not _integer(option_index) or option_index < 0 or option_index >= state.relicOptions.size():
		_fail("宝物索引超出范围"); return state
	var initial: bool = state.get("relicPurpose", "initial" if state.relics.is_empty() else "elite") == "initial"
	acquire_relic(state, state.relicOptions[int(option_index)])
	state.relicOptions = []
	if initial:
		state.phase = "battle"
		Effects.apply_lifecycle(state, "fightStart")
		Effects.apply_lifecycle(state, "turnStart")
	elif room_config(state).get("afterRelic", "next_fight") == "act_choice": state.phase = "act_choice"
	else: next_fight(state)
	clear_undo(state)
	return state

static func acquire_relic(state: Dictionary, relic: String) -> void:
	if state.relics.has(relic): return
	if RC.is_current() and (not RC.RUN.relicPool.has(relic) or state.relics.size() >= 6): _fail("普通宝物无效或已达6件上限"); return
	state.relics.append(relic)
	if state.relic == null: state.relic = relic
	state.game.relic = state.relic
	state.game.relics = state.relics.duplicate()
	Effects.apply_lifecycle_for(relic, "runStart", state)

static func require_battle(state: Dictionary) -> bool:
	if state.phase != "battle":
		_fail("当前不在打仗阶段"); return false
	return true

static func require_loot(state: Dictionary) -> bool:
	if state.phase != "loot":
		_fail("当前不在战利品阶段"); return false
	return true

static func play_run_card(state: Dictionary, hand_index: Variant) -> Dictionary:
	last_error = ""
	var allowed: Dictionary = can_play_run_card(state)
	if not allowed.ok: _fail(allowed.reason); return {}
	# Let Core own its exact hand-index diagnostic and leave adventure history alone.
	var before: Dictionary = {"monster": state.monster.duplicate(true), "stats": copy_stats(state.stats)}
	if not RC.RUN.legacy: before.hearts = state.hearts
	if RC.is_current(): before.guardUsedThisAct = state.guardUsedThisAct
	Core.set("last_error", "")
	var entry: Dictionary = Core.play_card(state.game, hand_index, state.monster)
	if not Core.last_error.is_empty():
		_fail(Core.last_error); return {}
	state.hist.append(before)
	state.hearts = min(state.maxHearts, state.hearts + int(entry.get("heal",0)))
	if state.monster.broken:
		state.monster.overkill = float(state.game.turnDmg) / float(state.monster.turnStartHp)
		state.stats.maxOverkill = max(state.stats.maxOverkill, state.monster.overkill)
	state.stats.totalDamage = state.game.total
	if state.game.turnDmg > state.stats.bestTurn:
		state.stats.bestTurn = state.game.turnDmg
		state.stats.bestFight = state.fight
	return entry

static func undo_run(state: Dictionary) -> bool:
	last_error = ""
	if state.phase != "battle" or state.hist.is_empty(): return false
	var previous: Dictionary = state.hist.back()
	if not Core.undo(state.game):
		_fail("冒险撤回记录与出牌记录不一致"); return false
	state.hist.pop_back()
	state.monster = previous.monster.duplicate(true)
	state.stats = copy_stats(previous.stats)
	if previous.has("hearts"): state.hearts = previous.hearts
	if previous.has("guardUsedThisAct"): state.guardUsedThisAct = previous.guardUsedThisAct
	return true

static func clear_undo(state: Dictionary) -> void:
	state.hist = []
	state.game.hist = []

static func record_fight(state: Dictionary, won: bool) -> void:
	var earlier_damage: float = 0
	for fight: Dictionary in state.stats.fights: earlier_damage += fight.damage
	state.stats.fights.append({"fight": state.fight, "monster": state.monster.key, "won": won, "turns": state.game.turn,
		"damage": state.stats.totalDamage - earlier_damage, "overkill": state.monster.overkill if state.monster.broken else 0})

static func settle(state: Dictionary, outcome: String, reason: String) -> void:
	state.phase = outcome
	state.loot = []
	clear_undo(state)
	var extra_cards: Array = []
	for card: Dictionary in state.cards:
		if card.has("type"): extra_cards.append(Core.copy_card(card))
	state.result = {"outcome": outcome, "reason": reason, "fight": state.fight, "monster": state.monster.key,
		"totalTurns": state.stats.turns, "bestTurn": state.stats.bestTurn, "bestFight": state.stats.bestFight,
		"maxOverkill": state.stats.maxOverkill, "totalDamage": state.stats.totalDamage,
		"gemForms": [Core.gem_form(state.game, 0), Core.gem_form(state.game, 1), Core.gem_form(state.game, 2)],
		"extraCards": extra_cards, "newRecords": {"farthest": false, "bestTurn": false, "maxOverkill": false}, "recordsApplied": false}

static func end_run_turn(state: Dictionary) -> Dictionary:
	last_error = ""
	if not require_battle(state): return state
	state.stats.turns += 1
	state.game.last = state.game.turnDmg
	state.game.best = max(state.game.best, state.game.turnDmg)
	clear_undo(state)
	consume_potions(state)
	if state.monster.broken:
		record_fight(state, true)
		if state.fight == RC.RUN.fights.size() and not room_config(state).get("relic",false):
			if RC.is_current(): Effects.apply_lifecycle(state,"fightWon")
			settle(state, "victory", "boss"); return state
		Effects.apply_lifecycle(state, "fightWon")
		var config: Dictionary = RC.RUN.fights[state.fight - 1]
		state.handLimit = min(RC.RUN.handMax, state.handLimit + config.get("handUp", 0))
		var count: int = RC.RUN.lootBonusCount if state.monster.overkill >= RC.RUN.lootBonusOverkill else RC.RUN.lootCount
		if config.get("relic", false):
			var options: Array = []
			for id: String in RC.RUN.relicPool:
				if not state.relics.has(id): options.append(id)
			state.relicOptions = Core.shuffle(options, Core.random_from_state(state.game)).slice(0, RC.RUN.relicOptions)
			state.phase = "relic"
			if not RC.RUN.legacy: state.relicPurpose = "boss" if config.type == "boss" else "elite"
		elif state.pendingReward == "shop":
			state.phase = "shop"; state.shopsVisited += 1
		elif state.pendingReward == "heal":
			state.hearts = min(state.maxHearts, state.hearts + RC.RUN.healDoor); next_fight(state)
		else:
			var options: Array = []
			for type: String in RC.RUN.toolPool:
				if tool_count(state, type) < RC.RUN.toolCap: options.append(type)
			state.loot = Core.shuffle(options, Core.random_from_state(state.game)).slice(0, count)
			state.phase = "loot"
		return state
	if RC.is_current() and current_rule(state) == "regrow":
		var restored: float = floor(maxf(0.0,state.monster.turnStartHp-state.monster.hp)/2.0)
		state.monster.hp = minf(minf(state.monster.maxHp,state.monster.turnStartHp),state.monster.hp+restored)
	Effects.apply_lifecycle(state, "turnEnd")
	if state.hearts == 0:
		record_fight(state, false)
		for card: Dictionary in state.game.row: state.game.discard.append(Core.copy_card(card))
		state.game.row = []; state.game.chain = []; state.game.chainIdx = []; state.game.rainbow = false
		settle(state, "defeat", "hearts"); return state
	state.monster.sealed = false
	var previous_turn: int = state.game.turn
	Core.end_turn(state.game)
	state.game.turn = previous_turn + 1
	state.monster.turnStartHp = state.monster.hp
	Effects.apply_lifecycle(state, "turnStart")
	return state

static func reset_battle_cards(state: Dictionary) -> void:
	var previous: Dictionary = state.game
	var deck: Array = []
	for card: Dictionary in state.cards: deck.append(Core.copy_card(card))
	var options: Dictionary = previous.opts.duplicate()
	options.merge({"grow": true, "hand": state.handLimit, "tools": false}, true)
	state.game = {"deck": deck, "hand": [], "row": [], "discard": [], "m": Config.CONFIG.multiplierStart,
		"turnDmg": 0, "total": previous.total, "turn": 1, "best": previous.best, "last": 0,
		"chain": [], "chainIdx": [], "rainbow": false, "xp": previous.xp.duplicate(), "opts": options,
		"rngState": previous.rngState, "hist": [], "onceUsed": false, "relics": state.relics.duplicate()}
	if state.relic != null: state.game.relic = state.relic
	Core.shuffle(state.game.deck, Core.random_from_state(state.game))
	Core.refill_hand(state.game)
	clear_undo(state)

static func start_battle(state: Dictionary, monster: String) -> void:
	state.monsters[state.fight - 1] = monster
	state.monster = make_monster(monster, state.fight, state.hpScale)
	if room_config(state).type in ["normal", "doors"]: state.previousNormal = monster
	Effects.apply_lifecycle(state, "fightStart"); Effects.apply_lifecycle(state, "turnStart")
	state.phase = "battle"; state.doors = []; state.loot = []; clear_undo(state)

static func room_config(state: Dictionary) -> Dictionary:
	return RC.RUN.acts[state.act - 1].rooms[state.room - 1]

static func next_fight(state: Dictionary) -> void:
	state.fight += 1; state.room += 1
	if state.room > RC.RUN.acts[state.act - 1].rooms.size():
		state.act += 1; state.room = 1; state.previousNormal = null
		if RC.is_current(): Effects.apply_lifecycle(state,"actStart")
	reset_battle_cards(state); state.loot = []
	var act: Dictionary = RC.RUN.acts[state.act - 1]
	var config: Dictionary = room_config(state)
	if config.type == "doors":
		var rng: Variant = Core.random_from_state(state.game)
		var normals: Array = []
		for key: String in act.normalMonsters:
			if key != state.previousNormal: normals.append(key)
		var monsters: Array = Core.shuffle(normals, rng).slice(0, 2)
		var rewards: Array = []
		for reward: String in RC.RUN.doorRewards:
			if reward != "heal" or state.hearts < state.maxHearts: rewards.append(reward)
		Core.shuffle(rewards, rng)
		state.doors = []
		for index: int in range(monsters.size()):
			state.doors.append({"monster": monsters[index], "rule": RC.MONSTERS[monsters[index]].rule, "reward": rewards[index]})
		state.phase = "doors"
	else:
		state.pendingReward = "card"
		var key: String = config.get("monster", "")
		if key.is_empty(): key = act.normalMonsters[int(floor(Core.random_from_state(state.game).next_value() * act.normalMonsters.size()))]
		start_battle(state, key)

static func door_options(state: Dictionary) -> Array:
	return state.doors.duplicate(true)

static func choose_door(state: Dictionary, index: Variant) -> Dictionary:
	last_error = ""
	if state.phase != "doors":
		_fail("当前不在挑门阶段"); return state
	if not _integer(index) or index < 0 or index >= state.doors.size():
		_fail("门索引超出范围"); return state
	var door: Dictionary = state.doors[int(index)]
	state.pendingReward = door.reward
	start_battle(state, door.monster)
	return state

static func can_double_tool(state: Dictionary, card: Dictionary) -> bool:
	if not card.get("type", "") or not state.relics.has("twice"): return false
	for entry: Dictionary in state.game.row:
		if entry.get("type", ""): return false
	return Effects.EFFECTS.get(card.type, {}).get("repeatable", false)

static func tool_count(state: Dictionary, type: String) -> int:
	var count: int = 0
	for card: Dictionary in state.cards:
		if card.get("type") == type: count += 1
	return count

static func can_copy_card(state: Dictionary, card_id: Variant) -> bool:
	for card: Dictionary in state.cards:
		if card.id == card_id: return not card.get("type", "") or tool_count(state, card.type) < RC.RUN.toolCap
	return false

static func shop_state(state: Dictionary) -> Dictionary:
	var max_drop: int = max(0, min(RC.RUN.shop.dropMax, state.cards.size() - RC.RUN.shop.minDeck))
	var can_copy: bool = false
	for card: Dictionary in state.cards:
		if can_copy_card(state, card.id): can_copy = true; break
	return {"canDrop": max_drop > 0, "maxDrop": max_drop, "canCopy": can_copy, "minDeck": RC.RUN.shop.minDeck}

static func require_shop(state: Dictionary) -> bool:
	if state.phase != "shop":
		_fail("当前不在工坊"); return false
	return true

static func shop_drop(state: Dictionary, card_ids: Array) -> Dictionary:
	last_error = ""
	if not require_shop(state): return state
	var seen: Array = []
	var valid: bool = not card_ids.is_empty() and card_ids.size() <= shop_state(state).maxDrop
	for id: Variant in card_ids:
		if _includes(seen, id): valid = false
		seen.append(id)
		var found: bool = false
		for card: Dictionary in state.cards:
			if card.id == id: found = true; break
		if not found: valid = false
	if not valid:
		_fail("扔牌数量或牌不合法"); return state
	var cards: Array = []
	for card: Dictionary in state.cards:
		if not _includes(card_ids, card.id): cards.append(card)
	state.cards = cards
	next_fight(state)
	return state

static func shop_copy(state: Dictionary, card_id: Variant) -> Dictionary:
	last_error = ""
	if not require_shop(state): return state
	if not can_copy_card(state, card_id):
		_fail("这种牌已经带满 2 张，不能再抄"); return state
	for card: Dictionary in state.cards:
		if card.id == card_id:
			var copy: Dictionary = Core.copy_card(card)
			copy.id = next_identity(state); state.cards.append(copy); break
	next_fight(state)
	return state

static func shop_skip(state: Dictionary) -> Dictionary:
	last_error = ""
	if require_shop(state): next_fight(state)
	return state

static func next_identity(state: Dictionary) -> int:
	var id: int = state.nextCardId
	for card: Dictionary in state.cards: id = max(id, card.id + 1)
	state.nextCardId = id + 1
	return id

static func choose_loot(state: Dictionary, option_index: Variant) -> Dictionary:
	last_error = ""
	if not require_loot(state): return state
	if not _integer(option_index) or option_index < 0 or option_index >= state.loot.size():
		_fail("战利品索引超出范围"); return state
	state.cards.append(Core.create_tool_card(state.loot[int(option_index)], next_identity(state)))
	next_fight(state)
	return state

static func skip_loot(state: Dictionary) -> Dictionary:
	last_error = ""
	if require_loot(state): next_fight(state)
	return state

static func abandon_run(state: Dictionary) -> Dictionary:
	last_error = ""
	if state.phase in RunTypes.TERMINAL_PHASES:
		if not RC.RUN.legacy: _fail("这局已经结束")
		return state
	if state.phase == "battle": state.stats.turns += 1; record_fight(state, false)
	settle(state, "defeat", "abandoned")
	return state

static func create_records() -> Dictionary:
	var value: Dictionary = {"played": 0, "wins": 0, "farthest": 0, "bestTurn": 0, "maxOverkill": 0}
	if not RC.RUN.legacy: value.retreats = 0
	if RC.is_current(): value.fullWins = 0; value.bestClearedTier = -1
	return value

static func update_records(records: Dictionary, state: Dictionary) -> Dictionary:
	last_error = ""
	var result: Variant = state.result
	if result == null:
		_fail("尚未结算，不能更新纪录"); return records
	if result.recordsApplied: return records
	var reached: int = RC.RUN.fights.size() + 1 if result.outcome == "victory" else int(result.fight)
	if not RC.RUN.legacy:
		reached = int(result.fight) if result.outcome in ["retreat","victory"] else int(result.fight)-1
		if result.outcome == "retreat": records.retreats = int(records.get("retreats",0))+1
	if RC.is_current(): reached = cleared_fights(state)
	result.newRecords = {"farthest": reached > records.farthest, "bestTurn": result.bestTurn > records.bestTurn, "maxOverkill": result.maxOverkill > records.maxOverkill}
	records.played += 1
	if result.outcome == "victory": records.wins += 1
	records.farthest = max(records.farthest, reached)
	records.bestTurn = max(records.bestTurn, result.bestTurn)
	records.maxOverkill = max(records.maxOverkill, result.maxOverkill)
	result.recordsApplied = true
	return records

static func _hand_index(state: Dictionary, card: Dictionary) -> int:
	for index: int in range(state.game.hand.size()):
		if state.game.hand[index].id == card.id: return index
	return -1

static func preview_run_card(state: Dictionary, card: Dictionary) -> Variant:
	if not can_play_run_card(state).ok: return null
	var index: int = _hand_index(state, card)
	if index < 0: return null
	return play_run_card(clone_run(state), index)

static func displayed_rule(state: Dictionary) -> Variant:
	if state.monster.get("rule") == "layers": return state.monster.layerRules[state.monster.layer - 1]
	return state.monster.get("rule")

static func rule_sealed(state: Dictionary) -> bool:
	return bool(state.monster.get("sealed", false))

static func current_rule(state: Dictionary) -> Variant:
	return Effects.active_monster_rule(state.monster)

static func card_warnings(state: Dictionary, card: Dictionary) -> Dictionary:
	if not can_play_run_card(state).ok: return {"attack":false,"unwind":false,"blocked":true}
	if state.phase != "battle" or state.monster.broken: return {"attack": false, "unwind": false}
	var index: int = _hand_index(state, card)
	if index < 0: return {"attack": false, "unwind": false}
	var copy: Dictionary = clone_run(state)
	var entry: Dictionary = play_run_card(copy, index)
	return {"attack": not copy.monster.broken and state.monster.countdown - 1 > 0 and copy.monster.countdown - 1 <= 0,
		"unwind": current_rule(state) == "wind" and state.monster.maxWind > 0 and state.monster.wind > 0 and not state.monster.woundDown and (int(entry.v) & 4) != 0}

static func preview_countdown(state: Dictionary, card: Dictionary) -> Variant:
	if not can_play_run_card(state).ok: return state.monster.countdown
	var index: int = _hand_index(state, card)
	if index < 0: return state.monster.countdown
	var copy: Dictionary = clone_run(state)
	play_run_card(copy, index)
	return copy.monster.countdown

static func best_hint_card(source: Dictionary) -> Variant:
	var state: Variant = source if source.has("game") else null
	var game: Dictionary = state.game if state != null else source
	var rank: Dictionary = {"plain": 0, "same": 1, "shun": 2, "white": 3}
	var best: Variant = null
	for card: Dictionary in game.hand:
		if state != null and card_warnings(state, card).attack: continue
		var entry: Variant = preview_run_card(state, card) if state != null else Core.preview_card(game, card)
		if entry == null or not rank.get(entry.k, 0): continue
		if best == null or rank[entry.k] > rank[best.k] or (rank[entry.k] == rank[best.k] and (entry.m2 > best.m2 or (entry.m2 == best.m2 and entry.damage > best.damage))): best = entry
	return best.id if best != null else null

static func rainbow_status(source: Dictionary) -> Dictionary:
	var game: Dictionary = source.game if source.has("game") else source
	var need: int = Effects.rainbow_need(game)
	var lit: Array = []
	for value: int in Config.CONFIG.rainbowColors:
		if game.rainbow or _includes(game.chain, value): lit.append(value)
	var chromatic: Array = []
	var available: Array = game.chain.duplicate()
	for card: Dictionary in game.hand:
		if card.get("type") not in Config.RESOLVED_MASK_TOOLS and _includes(Config.CONFIG.rainbowColors, card.v):
			chromatic.append(card)
			if not _includes(available, card.v): available.append(card.v)
	var available_count: int = 0
	for value: int in Config.CONFIG.rainbowColors:
		if _includes(available, value): available_count += 1
	var ready: bool = not game.rainbow and available_count >= need
	var ready_ids: Array = []
	if ready:
		for card: Dictionary in chromatic:
			if not _includes(game.chain, card.v): ready_ids.append(card.id)
	return {"need": need, "lit": lit, "ready": ready, "readyIds": ready_ids}

static func debug_give_relic(state: Dictionary, relic: String) -> void:
	last_error = ""
	if not RC.RELIC_IDS.has(relic): _fail("未知的宝物"); return
	if state.phase == "relic":
		if state.relicOptions.is_empty(): state.relicOptions.append(relic)
		else: state.relicOptions[0] = relic
		choose_relic(state, 0); return
	acquire_relic(state, relic); clear_undo(state)

static func debug_enter_shop(state: Dictionary) -> void:
	last_error = ""
	state.phase = "shop"; state.loot = []; state.doors = []; state.relicOptions = []; state.shopsVisited += 1; clear_undo(state)

static func debug_set_sealed(state: Dictionary, sealed: bool) -> void:
	last_error = ""; state.monster.sealed = sealed; clear_undo(state)

static func debug_jump_room(state: Dictionary, room: Variant) -> void:
	last_error = ""
	if not _integer(room) or room < 1 or room > RC.RUN.fights.size(): _fail("房间超出范围"); return
	var act: int = 1
	var local: int = int(room)
	while local > RC.RUN.acts[act - 1].rooms.size(): local -= RC.RUN.acts[act - 1].rooms.size(); act += 1
	state.act = act; state.room = local - 1; state.fight = room - 1; state.relicOptions = []
	next_fight(state)

static func debug_set_doors(state: Dictionary, doors: Array) -> void:
	last_error = ""
	var valid: bool = doors.size() == 2
	for door: Dictionary in doors:
		if not RC.RUN.acts[state.act - 1].normalMonsters.has(door.monster) or not RC.RUN.doorRewards.has(door.reward): valid = false
	if not valid: _fail("门不合法"); return
	state.doors = []
	for door: Dictionary in doors:
		var copy: Dictionary = door.duplicate(true)
		copy.rule = RC.MONSTERS[door.monster].rule; state.doors.append(copy)
	state.phase = "doors"; state.loot = []; clear_undo(state)

static func debug_give_tool(state: Dictionary, type: String, ignore_cap: bool = false) -> void:
	last_error = ""
	if not Config.TOOL_TYPES.has(type) or (not ignore_cap and tool_count(state, type) >= RC.RUN.toolCap): _fail("这种牌已经带满 2 张"); return
	var card: Dictionary = Core.create_tool_card(type, next_identity(state))
	state.cards.append(card); state.game.deck.append(Core.copy_card(card)); clear_undo(state)

static func debug_fill_hand(state: Dictionary, count: Variant) -> void:
	last_error = ""
	if not _integer(count) or count < 0 or count > RC.RUN.handHardMax: _fail("手牌最多 12 张"); return
	while state.game.hand.size() > count: state.game.deck.append(state.game.hand.pop_back())
	Core.draw_cards(state.game, count - state.game.hand.size()); clear_undo(state)

static func debug_set_monster_hp(state: Dictionary, hp: Variant) -> void:
	last_error = ""
	if not (hp is int or hp is float) or not is_finite(float(hp)) or hp < 0 or hp > state.monster.maxHp: _fail("怪物血量超出范围"); return
	state.monster.hp = hp
	if hp > 0: state.monster.turnStartHp = hp
	state.monster.broken = hp == 0
	if RC.MONSTERS[state.monster.key].rule == "layers": state.monster.layer = Effects.monster_layer(state.monster)
	clear_undo(state)

static func debug_set_countdown(state: Dictionary, countdown: Variant) -> void:
	last_error = ""
	if not _integer(countdown) or countdown < 0: _fail("倒计时必须在0与满值之间"); return
	state.monster.countdown = countdown; clear_undo(state)

static func debug_set_wind(state: Dictionary, wind: Variant) -> void:
	last_error = ""
	if not _integer(wind) or wind < 0 or wind > state.monster.maxWind: _fail("发条超出范围"); return
	state.monster.wind = wind; state.monster.woundDown = wind == 0 and state.monster.maxWind > 0; clear_undo(state)

static func debug_relic_selection(state: Dictionary) -> void:
	last_error = ""
	var options: Dictionary = {"runId":state.get("runId",""),"startingRelics":state.get("startingRelics",RC.RUN.startPool)}
	if RC.is_current(): options.merge({"tier":state.difficulty.tier,"unlockedTier":5,"tuningScale":state.difficulty.tuningScale})
	state.merge(create_run(state.game.rngState,options), true)

static func format_overkill(value: Variant) -> String:
	last_error = ""
	if not (value is int or value is float) or not is_finite(float(value)) or value < 0: _fail("超杀必须是非负有限数字"); return ""
	var floored: float = floor(float(value) * 10.0) / 10.0 if value < 10 else floor(float(value))
	var text: String = str(int(floored)) if floored == floor(floored) else str(floored)
	return "×" + (text if floored < 10 else Core.format_number(floored))

static func format_monster_hp(hp: Variant, max_hp: Variant) -> String:
	last_error = ""
	if not (hp is int or hp is float) or not (max_hp is int or max_hp is float) or not is_finite(float(hp)) or not is_finite(float(max_hp)) or max_hp <= 0:
		_fail("怪物血量必须是有限数字，满血必须大于 0"); return ""
	return Core.format_number(max(0, hp)) + " / " + Core.format_number(max_hp)

static func _starting_pool(options: Dictionary) -> Array:
	var provided: Variant = options.get("startingRelics", RC.RUN.startPool)
	var result: Array = []
	if provided is Array:
		for id: String in RC.RUN.relicPool:
			if provided.has(id): result.append(id)
	return result if not result.is_empty() else RC.RUN.startPool.duplicate()

static func can_play_run_card(state: Dictionary) -> Dictionary:
	if state.get("phase") != "battle": return {"ok":false,"reason":"当前不在打仗阶段"}
	if current_rule(state) == "six" and state.game.row.size() >= 6:
		return {"ok":false,"reason":"这回合打满6张了"}
	return {"ok":true,"reason":""}

static func consume_potions(state: Dictionary) -> void:
	var spent: Array = []
	for entry: Dictionary in state.game.row:
		if entry.get("spent",false): spent.append(entry.id)
	if spent.is_empty(): return
	state.cards = state.cards.filter(func(card: Dictionary) -> bool: return not spent.has(card.id))
	# Commit only after undo is cleared; remove consumed cards from every pile.
	# The completed row's reaction metadata is cleared with it at turn commit.
	for pile: String in ["deck","discard","hand","row"]:
		state.game[pile] = state.game[pile].filter(func(card: Dictionary) -> bool: return not spent.has(card.id))
	state.game.chain = []; state.game.chainIdx = []; state.game.rainbow = false

static func choose_act_exit(state: Dictionary, choice: String) -> Dictionary:
	last_error = ""
	if state.get("phase") != "act_choice": _fail("当前不在去留阶段"); return state
	if choice not in ["retreat","continue"]: _fail("去留选择无效"); return state
	if choice == "continue" and (not room_config(state).get("canContinue",false) or state.act >= RC.RUN.acts.size()):
		_fail("长廊已过，带着宝物回家吧。"); return state
	if choice == "retreat": settle(state,"retreat","act"+str(int(state.act)))
	else: next_fight(state)
	return state

static func debug_jump_act_room(state: Dictionary, act: int, room: int) -> void:
	last_error = ""
	if act < 1 or act > RC.RUN.acts.size() or room < 1 or room > RC.RUN.acts[act-1].rooms.size():
		_fail("幕或房间超出范围"); return
	var fight: int = room
	for index: int in range(act-1): fight += RC.RUN.acts[index].rooms.size()
	debug_jump_room(state,fight)

static func cleared_fights(state: Dictionary) -> int:
	var reached: int = int(state.fight)-1
	for fight: Dictionary in state.stats.fights:
		if int(fight.fight) == int(state.fight) and fight.won: reached = int(state.fight)
	return clampi(reached,0,18)
