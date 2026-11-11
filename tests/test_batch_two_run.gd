extends RefCounted
const R: GDScript = preload("res://rules/run.gd")
const C = preload("res://rules/index.gd")
const RC = preload("res://rules/run_config.gd")
var failures: Array[String] = []
var passed: int = 0
func check(ok: bool, label: String) -> void:
	if ok: passed += 1
	else: failures.append(label)
func win(s: Dictionary) -> void:
	R.debug_set_monster_hp(s,1)
	while not s.monster.broken and not s.game.hand.is_empty(): R.play_run_card(s,0)
	R.end_run_turn(s)
func run() -> Dictionary:
	check(RC.RUN.acts.size() == 2 and RC.RUN.fights.size() == 12,"two acts twelve fights")
	for method: String in ["choose_act_exit","can_play_run_card","debug_jump_act_room"]: check(R.has_method(method),method)
	if not failures.is_empty(): return result()
	var s: Dictionary = R.create_run(42,{"runId":"test-two-acts"})
	check(s.monsters.size() == 12 and s.monsters.slice(6) == ["box","box","lock","box","box","dragon"],"unentered act placeholders")
	check(s.relicPurpose == "initial","initial purpose")
	for id: String in s.relicOptions: check(RC.INITIAL_COLLECTION.has(id),"initial pool "+id)
	R.choose_relic(s,0)
	R.debug_jump_act_room(s,1,3); win(s)
	check(s.phase == "relic" and s.relicPurpose == "elite" and s.handLimit == 8 and s.hearts == s.maxHearts,"first elite reward lifecycle")
	R.choose_relic(s,0)
	R.debug_jump_act_room(s,1,6)
	check(s.monster.layerRules == ["hug","bite","bell"],"hall dragon rules")
	win(s); check(s.phase == "relic" and s.relicPurpose == "boss","boss before choice")
	R.choose_relic(s,0); check(s.phase == "act_choice" and s.hist.is_empty(),"act choice after reward")
	var before: Dictionary = s.duplicate(true)
	R.choose_act_exit(s,"invalid"); check(s == before and not R.last_error.is_empty(),"invalid exit immutable")
	var home: Dictionary = s.duplicate(true)
	R.choose_act_exit(home,"retreat")
	check(home.phase == "retreat" and home.result.outcome == "retreat" and home.result.reason == "act1","act1 retreat")
	before = home.duplicate(true); R.abandon_run(home); R.choose_act_exit(home,"continue"); R.play_run_card(home,0)
	check(home == before,"terminal commands immutable")
	var cards: Array = s.cards.duplicate(true); var xp: Array = s.game.xp.duplicate()
	R.choose_act_exit(s,"continue")
	check(s.act == 2 and s.room == 1 and s.fight == 7 and s.cards == cards and s.game.xp == xp,"cross act preserves inventory and growth")
	R.debug_jump_act_room(s,2,3); win(s)
	check(s.handLimit == 8 and s.phase == "relic","second elite no hand increase")
	R.choose_relic(s,0); R.debug_jump_act_room(s,2,6)
	check(s.monster.layerRules == ["picky","duck","six"],"corridor dragon rules")
	win(s); R.choose_relic(s,0)
	check(s.phase == "act_choice" and s.relics.size() == 5,"two act five relics")
	before = s.duplicate(true); R.choose_act_exit(s,"continue")
	check(s == before and not R.last_error.is_empty(),"third act rejected")
	R.choose_act_exit(s,"retreat")
	check(s.result.reason == "act2" and s.result.outcome == "retreat","act2 retreat")
	command_edges()
	remaining_edges()
	return result()
func deal(s: Dictionary, sequence: Array) -> void:
	var pool: Array = s.cards.duplicate(true)
	for value: Variant in sequence:
		if value is String and R.tool_count(s,value) == 0:
			R.debug_give_tool(s,value); pool = s.cards.duplicate(true)
	s.game.hand = []; s.game.deck = []; s.game.discard = []; s.game.row = []
	for value: Variant in sequence:
		for index: int in range(pool.size()):
			var card: Dictionary = pool[index]
			if (value is String and card.get("type") == value) or (value is int and not card.has("type") and card.v == value):
				s.game.hand.append(pool.pop_at(index)); break
	s.game.deck = pool; s.game.hist = []; s.hist = []
func command_edges() -> void:
	var s: Dictionary = R.create_run(99,{"runId":"command-edges"}); R.choose_relic(s,0)
	R.debug_jump_act_room(s,2,3); deal(s,[1,1,1,1,1,2,"seal"])
	for i: int in range(6): R.play_run_card(s,0)
	var before: Dictionary = s.duplicate(true)
	check(not R.can_play_run_card(s).ok,"six command gate")
	check(R.preview_run_card(s,s.game.hand[0]) == null and R.best_hint_card(s) == null,"six preview and hint blocked")
	check(R.card_warnings(s,s.game.hand[0]) == {"attack":false,"unwind":false,"blocked":true},"six warnings blocked")
	check(R.preview_countdown(s,s.game.hand[0]) == s.monster.countdown,"six countdown safe")
	check(R.play_run_card(s,0).is_empty() and s == before,"seventh seal rejected with exact state/RNG")
	check(R.undo_run(s),"six undo")
	R.play_run_card(s,1)
	check(s.monster.sealed and R.can_play_run_card(s).ok and not R.play_run_card(s,0).is_empty(),"sixth seal allows seventh")
	R.debug_jump_act_room(s,2,3); deal(s,[1,1,1,1,1,2,2])
	for i: int in range(6): R.play_run_card(s,0)
	R.debug_set_monster_hp(s,0)
	check(R.can_play_run_card(s).ok and not R.play_run_card(s,0).is_empty(),"broken lock no limit")
	R.debug_jump_act_room(s,2,6)
	for sample: Array in [[2000001,"picky"],[2000000,"duck"],[1000001,"duck"],[1000000,"six"]]:
		R.debug_set_monster_hp(s,sample[0]); check(R.current_rule(s) == sample[1],"dragon boundary " + str(sample[0]))
	R.debug_jump_act_room(s,1,1); R.debug_give_relic(s,"twice"); deal(s,["potion","shadow"]); s.hearts = 1
	before = s.duplicate(true); var count: int = s.cards.size()
	R.play_run_card(s,0)
	check(s.hearts == 3 and s.cards.size() == count and s.game.row[0].spent,"potion double heal keeps conservation before commit")
	check(R.undo_run(s) and s == before,"potion undo exact hearts inventory RNG")
	R.play_run_card(s,0); var hearts: int = s.hearts; R.play_run_card(s,0)
	check(s.hearts == hearts,"potion shadow no healing")
	R.end_run_turn(s)
	check(s.cards.size() == count-1 and R.tool_count(s,"potion") == 0,"potion consumed once and frees cap")
	for pile: String in ["hand","deck","discard","row"]:
		check(s.game[pile].all(func(card: Dictionary) -> bool: return card.get("type") != "potion"),"no spent potion in " + pile)
	R.debug_jump_act_room(s,1,1); deal(s,["potion"]); s.hearts = s.maxHearts
	R.play_run_card(s,0); check(s.hearts == s.maxHearts,"full hearts potion allowed")
	R.debug_set_monster_hp(s,0); count = s.cards.size(); R.end_run_turn(s)
	check(s.cards.size() == count-1,"potion consumed on battle win")
func remaining_edges() -> void:
	var s: Dictionary = R.create_run(6789,{"runId":"remaining-edges"})
	var before: Dictionary = s.duplicate(true)
	R.choose_relic(s,-1); check(s == before,"invalid starting relic index immutable")
	R.play_run_card(s,0); check(s == before,"play outside battle immutable")
	R.choose_relic(s,0)
	for tool: String in ["palette","potion","diamond"]:
		R.debug_give_tool(s,tool); R.debug_give_tool(s,tool)
		before = s.duplicate(true); R.debug_give_tool(s,tool)
		check(R.tool_count(s,tool) == 2 and s == before,"new tool exact two cap " + tool)
		for card: Dictionary in s.cards:
			if card.get("type") == tool: check(not R.can_copy_card(s,card.id),"cannot copy third " + tool); break
	R.debug_jump_act_room(s,1,1); deal(s,["potion"]); s.hearts = 1
	R.debug_set_monster_hp(s,1); before = s.duplicate(true)
	R.play_run_card(s,0)
	check(s.hearts == 2 and s.monster.broken,"single potion heals one on killing card")
	check(R.undo_run(s) and s == before,"killing potion undo restores hearts and monster")
	R.play_run_card(s,0); var count: int = s.cards.size(); R.end_run_turn(s)
	check(s.cards.size() == count-1,"killing potion committed exactly once")
	R.debug_jump_act_room(s,2,6); deal(s,["diamond","seal",1,1,1,1,1,1])
	s.game.m = 4000
	R.play_run_card(s,0)
	check(not s.monster.broken and s.monster.hp <= 1000000 and R.current_rule(s) == "six","single diamond crosses two dragon layers")
	R.play_run_card(s,0)
	check(R.rule_sealed(s),"corridor dragon seal after layer crossing")
	for i: int in range(5): R.play_run_card(s,0)
	check(s.game.row.size() == 7,"sealed corridor dragon permits seventh card")
	for method: String in ["choose_loot","choose_door","shop_copy"]:
		before = s.duplicate(true); R.callv(method,[s,-1])
		check(s == before and not R.last_error.is_empty(),"wrong phase and invalid index " + method)
func result() -> Dictionary:
	return {"passed":passed,"failed":failures.size(),"failures":failures}
