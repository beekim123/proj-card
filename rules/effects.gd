class_name RulesEffects
extends RefCounted
const C = preload("res://rules/config.gd")
const RC = preload("res://rules/run_config.gd")
static var last_error: String = ""
## Data and executable hooks share the same public registry as the source port.
static var EFFECTS: Dictionary = _registry()

static func _registry() -> Dictionary:
	var result: Dictionary = {}
	for source: Dictionary in [C.TOOLS,RC.RELICS,RC.RULES]:
		for id: String in source:
			var definition: Dictionary = source[id].duplicate(true)
			definition.id = id; definition.hooks = {}; result[id] = definition
	for id: String in ["hourglass","whistle","hammer","lens","stone","bag","potion"]: result[id].repeatable = true
	result.combat = {"id":"combat","name":"一仗","text":"回合结束结算，打赢精英心回满。","hooks":{}}
	var hooks: Dictionary = {"palette":["mask","reaction","chain"],"potion":["afterCard"],"diamond":["gemValues"],"red":["gemValues"],"green":["gemValues"],"blue":["gemValues"],"shun":["reactionMultiplier"],"same4":["reactionMultiplier"],"duck":["finalDamage"],"picky":["gemValues"],"hourglass":["afterCard"],"seal":["afterCard"],"shadow":["mask","reaction"],"whistle":["afterCard"],"start2":["prepare"],"twice":["prepare"],"mirror":["mask"],"hammer":["hammer"],"lens":["afterCard"],"stone":["afterCard"],"bag":["afterCard"],"bite":["afterMonster"],"hug":["gemValues"],"wind":["afterMonster"],"bell":["afterMonster"],"layers":["afterLayer"],"same":["multiplier"],"once":["reaction"],"white":["reactionMultiplier"],"rainbow":["rainbowNeed","rainbow"],"grow":["growthThresholds","afterGrowth"]}
	for id: String in hooks:
		for hook: String in hooks[id]:
			result[id].hooks[hook] = func(context: Dictionary) -> void: _apply_effect(id,hook,context)
	var lifecycle: Dictionary = {"start2":["turnStart"],"slow":["fightStart"],"first2":["fightStart"],"wind":["fightStart","turnStart"],"layers":["fightStart"],"heart":["runStart"],"combat":["turnEnd","fightWon"]}
	for id: String in lifecycle:
		result[id].lifecycle = {}
		for hook: String in lifecycle[id]:
			result[id].lifecycle[hook] = func(run: Dictionary) -> void: _apply_lifecycle_one(id,hook,run)
	result.layers.ruleFor = func(monster: Dictionary) -> String: return monster.layerRules[int(monster.layer)-1]
	var ordered: Dictionary = {}
	for id: String in ["hourglass","seal","shadow","whistle","start2","slow","first2","twice","mirror","hammer","lens","stone","bag","bite","hug","wind","bell","layers","same","once","white","rainbow","heart","grow","combat","palette","potion","diamond","red","green","blue","shun","same4","duck","picky","six"]: ordered[id] = result[id]
	return ordered

static func mark_effect(context: Dictionary, id: String, text: String) -> void:
	for effect: Dictionary in context.entry.effects:
		if effect.id == id and effect.text == text: return
	context.entry.effects.append({"id":id,"text":text})

static func _live_monster(c: Dictionary) -> bool:
	return c.has("monster") and not c.monster.is_empty() and not c.get("monsterWasBroken",false) and not c.monster.broken

static func _carries(c: Dictionary, index: int) -> bool:
	return (int(c.entry.v) & (1 << index)) != 0

static func monster_layer(monster: Dictionary) -> int:
	return 1 if monster.hp > monster.maxHp * 2.0 / 3.0 else (2 if monster.hp > monster.maxHp / 3.0 else 3)

static func active_relics(game: Dictionary) -> Array:
	var result: Array = []
	var source: Array = game.relics if game.has("relics") else ([game.relic] if game.get("relic","") else [])
	for id: String in source:
		if not result.has(id): result.append(id)
	return result

static func active_monster_rule(monster: Dictionary) -> Variant:
	if monster.get("broken",false) or monster.get("sealed",false): return null
	var callback: Variant = EFFECTS.get(monster.get("rule"),{}).get("ruleFor")
	return callback.call(monster) if callback is Callable else monster.get("rule")

static func effect_ids(state: Dictionary, card: Dictionary, monster: Dictionary = {}) -> Array:
	var ids: Array = [card.type] if card.has("type") else []
	ids.append_array(active_relics(state))
	if not monster.is_empty():
		var rule: Variant = active_monster_rule(monster)
		if rule != null: ids.append(rule)
		if not monster.broken and (not monster.get("sealed",false) or EFFECTS.get(monster.get("rule"),{}).has("ruleFor")) and monster.get("rule") != null: ids.append(monster.rule)
	var result: Array = []
	for id: String in ids:
		if not result.has(id): result.append(id)
	return result

static func apply_effects(ids: Array, hook: String, c: Dictionary) -> void:
	for id: String in ids:
		var callback: Variant = EFFECTS.get(id,{}).get("hooks",{}).get(hook)
		if callback is Callable: callback.call(c)

static func _apply_effect(id: String, hook: String, c: Dictionary) -> void:
	match id + ":" + hook:
		"palette:mask":
			c.entry.v = c.state.row[-1].v if not c.state.row.is_empty() else 0
		"palette:reaction":
			c.reactionLocked = true
			if not c.state.row.is_empty(): c.entry.k = "shun"; mark_effect(c,id,C.TOOLS[id].name)
		"palette:chain":
			if not c.state.row.is_empty():
				for color: int in C.CONFIG.rainbowColors:
					var present: bool = false
					for previous: Variant in c.chain.colors:
						if int(previous) == color: present = true; break
					if not present: c.chain.colors.append(color); break
		"potion:afterCard":
			c.entry.spent = true; c.entry.heal = c.times; mark_effect(c,id,C.TOOLS[id].name)
		"diamond:gemValues":
			for i: int in range(3): c.entry.gemValues[i] *= 2
			mark_effect(c,id,C.TOOLS[id].name)
		"red:gemValues", "green:gemValues", "blue:gemValues":
			c.entry.gemValues[["red","green","blue"].find(id)] *= 2
			mark_effect(c,id,RC.RELICS[id].name)
		"shun:reactionMultiplier", "same4:reactionMultiplier":
			if c.entry.k == ("shun" if id == "shun" else "same"):
				c.entry.cm = 3 if id == "shun" else 4; mark_effect(c,id,RC.RELICS[id].name)
		"duck:finalDamage":
			if _live_monster(c) and (c.state.row.size()+1)%2 == 0:
				c.entry.damage = 0; mark_effect(c,id,RC.RULES[id].name)
		"picky:gemValues":
			if _live_monster(c) and int(c.entry.v) in [1,2,4]:
				c.entry.gemValues = [0,0,0]; mark_effect(c,id,RC.RULES[id].name)
		"hourglass:afterCard":
			if _live_monster(c): c.monster.countdown += C.TOOLS.hourglass.countdown*c.times; mark_effect(c,id,C.TOOLS[id].name)
		"seal:afterCard":
			if c.has("monster") and not c.monster.is_empty(): c.monster.sealed = true
			mark_effect(c,id,C.TOOLS[id].name)
		"shadow:mask":
			c.entry.v = c.state.row[-1].v if not c.state.row.is_empty() else 0; mark_effect(c,id,C.TOOLS[id].name)
		"shadow:reaction":
			c.entry.k = c.state.row[-1].k if not c.state.row.is_empty() else "plain"; c.reactionLocked = true
		"whistle:afterCard": c.drawTool += C.TOOLS.whistle.drawTool*c.times; mark_effect(c,id,C.TOOLS[id].name)
		"start2:prepare":
			if c.state.row.is_empty(): mark_effect(c,id,RC.RELICS[id].name)
		"twice:prepare":
			if c.card.has("type"):
				var found: bool = false
				for card: Dictionary in c.state.row:
					if card.has("type"): found = true; break
				if not found: c.times = RC.RELICS.twice.times; mark_effect(c,id,RC.RELICS[id].name)
		"mirror:mask": c.entry.v = 7-int(c.state.row[-1].v) if not c.state.row.is_empty() else C.TOOLS.mirror.v; mark_effect(c,id,C.TOOLS[id].name)
		"hammer:hammer": c.entry.hammer = (c.state.turnDmg+c.entry.dmg+c.entry.rainbow)*(pow(C.TOOLS.hammer.turnMultiplier,c.times)-1); mark_effect(c,id,C.TOOLS[id].name)
		"lens:afterCard": c.entry.m2 *= pow(C.TOOLS.lens.multiplier,c.times); mark_effect(c,id,C.TOOLS[id].name)
		"stone:afterCard":
			for i: int in range(c.xp.size()): c.xp[i] += C.TOOLS.stone.xp*c.times
			mark_effect(c,id,C.TOOLS[id].name)
		"bag:afterCard": c.draw += C.TOOLS.bag.draw*c.times; mark_effect(c,id,C.TOOLS[id].name)
		"bite:afterMonster":
			if _live_monster(c) and _carries(c,RC.RULES.bite.gem): c.monster.countdown = max(0,c.monster.countdown+RC.RULES.bite.countdown); mark_effect(c,id,RC.RULES[id].name)
		"hug:gemValues":
			if _live_monster(c) and _carries(c,RC.RULES.hug.gem): c.entry.gemValues[RC.RULES.hug.gem] = 0; mark_effect(c,id,RC.RULES[id].name)
		"wind:afterMonster":
			if _live_monster(c) and not c.monster.woundDown and c.monster.wind > 0 and _carries(c,RC.RULES.wind.gem):
				c.monster.wind -= 1; mark_effect(c,id,"松发条")
				if c.monster.wind == 0: c.monster.countdown = c.monster.maxCountdown; c.monster.woundDown = true; mark_effect(c,id,"发条松完")
		"bell:afterMonster":
			if _live_monster(c) and c.entry.k == "white": c.monster.countdown = max(0,c.monster.countdown+RC.RULES.bell.countdown); mark_effect(c,id,RC.RULES[id].name)
		"layers:afterLayer":
			if c.has("monster") and not c.monster.is_empty() and not c.get("monsterWasBroken",false):
				var layer: int = monster_layer(c.monster)
				if layer != c.monster.layer: c.monster.layer = layer; mark_effect(c,id,"换规矩")
		"same:multiplier":
			if c.entry.k == "same": c.entry.m2 = c.state.m*C.CONFIG.multiplierDouble; mark_effect(c,id,RC.RELICS[id].name)
		"once:reaction":
			if not c.get("reactionLocked",false) and not c.state.row.is_empty() and c.entry.k == "plain" and not c.onceUsed: c.entry.k = "shun"; c.onceUsed = true; mark_effect(c,id,RC.RELICS[id].name)
		"white:reactionMultiplier":
			if c.entry.k == "white": c.entry.cm = RC.RELICS.white.whiteMultiplier; mark_effect(c,id,RC.RELICS[id].name)
		"rainbow:rainbowNeed": c.need = RC.RELICS.rainbow.rainbowColors
		"rainbow:rainbow":
			if c.entry.rb: mark_effect(c,id,RC.RELICS[id].name)
		"grow:growthThresholds": c.thresholds = RC.RELICS.grow.formAt.duplicate()
		"grow:afterGrowth":
			if not c.entry.grown.is_empty(): mark_effect(c,id,RC.RELICS[id].name)

static func apply_lifecycle_for(id: String, hook: String, run: Dictionary) -> void:
	var callback: Variant = EFFECTS.get(id,{}).get("lifecycle",{}).get(hook)
	if callback is Callable: callback.call(run)

static func _apply_lifecycle_one(id: String, hook: String, run: Dictionary) -> void:
	match id + ":" + hook:
		"start2:turnStart": run.game.m = RC.RELICS.start2.startMultiplier
		"slow:fightStart": run.monster.maxCountdown += RC.RELICS.slow.countdown; run.monster.countdown = run.monster.maxCountdown
		"first2:fightStart":
			var core: GDScript = load("res://rules/index.gd")
			core.draw_cards(run.game,RC.RELICS.first2.draw)
		"wind:fightStart": run.monster.wind = RC.MONSTERS.soldier.wind; run.monster.maxWind = RC.MONSTERS.soldier.wind; run.monster.countdown = RC.MONSTERS.soldier.countdown; run.monster.maxCountdown = RC.MONSTERS.soldier.countdown
		"wind:turnStart":
			if run.monster.woundDown: run.monster.wind = run.monster.maxWind; run.monster.woundDown = false
		"layers:fightStart": run.monster.layer = monster_layer(run.monster)
		"heart:runStart": run.maxHearts += RC.RELICS.heart.hearts; run.hearts = min(run.maxHearts,run.hearts+RC.RELICS.heart.hearts)
		"combat:turnEnd":
			run.monster.countdown -= 1
			if run.monster.countdown <= 0: run.hearts = max(0,run.hearts-1); run.monster.countdown = run.monster.maxCountdown
		"combat:fightWon":
			if RC.RUN.fights[int(run.fight)-1].get("healFull",false): run.hearts = run.maxHearts

static func apply_lifecycle(run: Dictionary, hook: String) -> void:
	var ids: Array = ["combat"]+([run.monster.rule] if run.monster.get("rule") != null else [])+run.relics
	var seen: Array = []
	for id: String in ids:
		if not seen.has(id): seen.append(id); apply_lifecycle_for(id,hook,run)

static func growth_thresholds(source: Dictionary) -> Array:
	var state: Dictionary = source.game if source.has("game") else source
	var c: Dictionary = {"thresholds":C.CONFIG.formAt.duplicate()}
	apply_effects(active_relics(state),"growthThresholds",c)
	return c.thresholds

static func rainbow_need(state: Dictionary) -> int:
	var c: Dictionary = {"need":C.CONFIG.rainbowColors.size()}
	apply_effects(active_relics(state),"rainbowNeed",c)
	return int(c.need)
