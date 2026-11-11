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
	return result()
func result() -> Dictionary: return {"passed":passed,"failed":failures.size(),"failures":failures}
