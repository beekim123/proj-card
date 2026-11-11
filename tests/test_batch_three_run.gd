extends RefCounted
const R: GDScript = preload("res://rules/run.gd")
const RC: GDScript = preload("res://rules/run_config.gd")
const H: GDScript = preload("res://tests/test_batch_two_run.gd")
var passed: int = 0
var failures: Array[String] = []
func check(ok: bool, label: String) -> void:
	if ok: passed += 1
	else: failures.append(label)
func run() -> Dictionary:
	var s: Dictionary = R.create_run(1979,{"runId":"b3-run","tier":5,"unlockedTier":5})
	check(s.has("difficulty") and s.has("guardUsedThisAct"),"current run fields")
	check(s.get("contentVersion") == "body-batch-3" and s.hpScale == 6,"current run tier5")
	if not failures.is_empty(): return result()
	for invalid: Variant in [-1,6,1.5,"2"]: check(R.create_run(1979,{"tier":invalid,"unlockedTier":5}).is_empty(),"reject tier "+str(invalid))
	check(R.create_run(1979,{"tier":1}).is_empty(),"locked tier rejected")
	R.choose_relic(s,0); R.debug_jump_act_room(s,2,6); H.new().win(s); R.choose_relic(s,0); R.choose_act_exit(s,"continue")
	check(s.act == 3 and s.room == 1 and s.phase == "battle","act2 continue enters vault")
	R.debug_jump_act_room(s,3,1); s.monster = R.make_monster("tree",13,s.hpScale); s.monsters[12] = "tree"
	s.monster.hp = 600; s.monster.turnStartHp = 1001; s.monster.countdown = 3
	R.end_run_turn(s); check(s.monster.hp == 800 and s.monster.countdown == 2,"regrow odd loss before countdown")
	s.monster.turnStartHp = 1001; s.monster.hp = 600; s.monster.sealed = true
	R.end_run_turn(s); check(s.monster.hp == 600,"sealed regrow suppressed")
	R.acquire_relic(s,"guard"); check(not s.guardUsedThisAct,"guard acquired available")
	s.monster.countdown = 1; var hearts: int = s.hearts; R.end_run_turn(s)
	check(s.hearts == hearts and s.guardUsedThisAct and s.monster.countdown == s.monster.maxCountdown,"guard blocks actual attack resets timer")
	s.monster.countdown = 1; R.end_run_turn(s); check(s.hearts == hearts-1,"guard only once")
	R.debug_jump_act_room(s,3,6); s.hearts = 1; R.debug_set_monster_hp(s,0); R.end_run_turn(s)
	check(s.phase == "victory" and s.relicOptions.is_empty() and s.hearts == s.maxHearts,"third dragon direct victory and full heal")
	var carried: Dictionary = R.create_run(19,{"runId":"guard-cross"}); R.choose_relic(carried,0); R.acquire_relic(carried,"guard")
	carried.guardUsedThisAct = true; R.debug_jump_act_room(carried,2,6); R.debug_set_monster_hp(carried,0); R.end_run_turn(carried); R.choose_relic(carried,0)
	R.choose_act_exit(carried,"continue"); check(not carried.guardUsedThisAct,"natural next act refreshes guard")
	R.start_battle(carried,"tree"); carried.monster.countdown = 2
	var before: Dictionary = carried.duplicate(true); R.preview_run_card(carried,carried.game.hand[0]); R.best_hint_card(carried)
	check(carried == before,"preview and hint leave guard and RNG unchanged")
	R.debug_set_monster_hp(carried,0); R.end_run_turn(carried); check(carried.monster.hp == 0 and carried.phase != "battle","regrow cannot resurrect kill")
	var rainbow: Dictionary = R.create_run(17,{"runId":"duck-rainbow"}); R.choose_relic(rainbow,0); R.acquire_relic(rainbow,"rbheal")
	R.debug_jump_act_room(rainbow,2,1); R.start_battle(rainbow,"box"); H.new().deal(rainbow,[1,3,2,6,4,5,1]); rainbow.hearts = 1
	for i: int in range(5): R.play_run_card(rainbow,0)
	var sixth: Dictionary = R.play_run_card(rainbow,0)
	check(sixth.damage == 0 and sixth.get("rbHeal",false) and rainbow.hearts == 2,"duck zero damage still heals rainbow")
	R.play_run_card(rainbow,0); check(rainbow.hearts == 2,"later highlighted row never heals again")
	var limited: Dictionary = R.create_run(22,{"runId":"max-relics"}); R.choose_relic(limited,0)
	for id: String in RC.RELIC_IDS:
		if limited.relics.size() >= 6: break
		R.acquire_relic(limited,id)
	before = limited.duplicate(true); R.acquire_relic(limited,"biggem")
	check(limited == before,"award medal cannot become ordinary relic")
	for id: String in RC.RELIC_IDS:
		if not limited.relics.has(id): R.acquire_relic(limited,id); break
	check(limited == before,"seventh ordinary relic rejected")
	return result()
func result() -> Dictionary: return {"passed":passed,"failed":failures.size(),"failures":failures}
