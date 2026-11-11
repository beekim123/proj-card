extends RefCounted
const R: GDScript = preload("res://rules/run.gd")
const RC: GDScript = preload("res://rules/run_config.gd")
const S: GDScript = preload("res://rules/save_state.gd")
const P: GDScript = preload("res://scripts/app/persistence.gd")
const H: GDScript = preload("res://tests/test_batch_three_helpers.gd")
const G: GDScript = preload("res://tests/test_golden.gd")
var passed: int = 0
var failures: Array[String] = []
func check(ok: bool, label: String) -> void:
	if ok: passed += 1
	else: failures.append(label)
func run() -> Dictionary:
	var root: String = ProjectSettings.globalize_path("res://artifacts/batch-3/save-"+str(Time.get_ticks_usec()))
	var store: RefCounted = P.new(root)
	var records: Dictionary = store.load_records()
	check(records.has("fullWins") and records.has("bestClearedTier"),"records progression fields")
	var active: Dictionary = R.create_run(1979,{"runId":"batch3-active"})
	var raw: Variant = S.encode_run_save(active)
	check(raw is String and S.parse_json_exact(raw).version == 6,"current writes v6")
	if not failures.is_empty(): return result()
	var decoded: Dictionary = S.decode_run_save(raw)
	check(decoded.state != null and G.first_difference(decoded.state,active).is_empty(),"current restore exact")
	var won: Dictionary = H.full_victory(); var duplicate: Dictionary = won.duplicate(true)
	check(store.record_result(won,records),"atomic first victory")
	check(records.fullWins == 1 and records.bestClearedTier == 0 and records.wins == 1 and records.played == 1,"full victory counters")
	check(won.result.get("firstBigGem") == true and won.result.get("newUnlockedTiers") == [1,2],"first trophy and unlock receipt")
	var once: Dictionary = store.load_records().duplicate(true)
	check(store.record_result(duplicate,records) and store.load_records() == once,"runId receipt deduplicates cloned victory")
	for stage: String in ["open","write","rename"]:
		var failing: RefCounted = P.new(root+"-"+stage); var before: Dictionary = failing.load_records(); var candidate: Dictionary = H.full_victory(2)
		failing.failure_stage = stage; var snapshot: Dictionary = before.duplicate(true)
		check(not failing.record_result(candidate,before) and before == snapshot and not candidate.result.recordsApplied,"IO atomic "+stage)
		check(failing.record_result(candidate,before) and before.fullWins == 1,"IO retry once "+stage)
	var manifest: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://tests/fixtures/body-batch-3/manifest.json"))
	for label: String in manifest.fixtures:
		var old_raw: String = FileAccess.get_file_as_string("res://tests/fixtures/body-batch-3/v5-"+label+".json")
		var old: Dictionary = S.parse_json_exact(old_raw).state
		var migrated: Dictionary = S.decode_run_save(old_raw)
		check(migrated.get("state") is Dictionary,label+" v5 migrates")
		if not migrated.get("state") is Dictionary: continue
		check(migrated.state.monsters.size() == 18 and migrated.state.contentVersion == "body-batch-3",label+" adds future act")
		check(G.first_difference(old.game,migrated.state.game).is_empty() and old.runId == migrated.state.runId and old.relicOptions == migrated.state.relicOptions,label+" RNG cards history candidates identity preserved")
		check(migrated.state.difficulty.tier == 0 and migrated.state.difficulty.tuningScale == old.hpScale and not migrated.state.guardUsedThisAct,label+" migration fields")
		check(S.encode_run_save(migrated.state) != null,label+" migrated v6 encodes")
	var rainbow: Dictionary = R.create_run(17,{"runId":"rbheal-real-save"}); R.choose_relic(rainbow,0)
	R.acquire_relic(rainbow,"rbheal"); R.acquire_relic(rainbow,"twice")
	preload("res://tests/test_batch_two_run.gd").new().deal(rainbow,[3,2,6,4,5,"potion"])
	rainbow.hearts = 1
	for i: int in range(5): R.play_run_card(rainbow,0)
	var before_rainbow: Dictionary = rainbow.duplicate(true)
	var entry: Dictionary = R.play_run_card(rainbow,0)
	check(entry.get("rbHeal",false) and entry.heal == 3 and rainbow.hearts == rainbow.maxHearts,"twice potion plus new rainbow heals 2+1")
	var rainbow_raw: Variant = S.encode_run_save(rainbow)
	check(rainbow_raw != null,"rbHeal current row and history encode")
	if rainbow_raw != null:
		var restored: Dictionary = S.decode_run_save(rainbow_raw).state
		check(R.undo_run(restored) and G.first_difference(restored,before_rainbow).is_empty(),"rbHeal load undo exact")
		R.play_run_card(restored,0); check(G.first_difference(restored,rainbow).is_empty(),"rbHeal replay exact without duplicate healing")
		check(store.save_run(restored),"rbHeal real file save")
	var old_mode: Dictionary = RC.RUN; RC.use_batch_two()
	check(S.decode_run_save('{"version":6}').reason == "unsupported","frozen v6 future preserved")
	RC.set("RUN",old_mode)
	for source: String in ["relic","battle","loot","doors","shop"]:
		var v4_path: String = "res://tests/fixtures/body-batch-2/v4-"+source+".json"
		if not FileAccess.file_exists(v4_path): continue
		var migration_store: RefCounted = P.new(root+"-v4-"+source)
		var old_text: String = FileAccess.get_file_as_string(v4_path)
		migration_store._write_raw("gemcard.run",old_text)
		var loaded: Dictionary = migration_store.load_run()
		check(loaded.get("state") != null and loaded.state.contentVersion == "body-batch-3",source+" v4 filesystem migration")
	var tier_store: RefCounted = P.new(root+"-tier-resume")
	var high_tier: Dictionary = R.create_run(4,{"runId":"unlocked-earlier","tier":5,"unlockedTier":5})
	check(tier_store.save_run(high_tier) and tier_store.load_run().state.difficulty.tier == 5,"legal active tier survives lower current unlock")
	var original_v5: String = FileAccess.get_file_as_string("res://tests/fixtures/body-batch-3/v5-act2-choice.json")
	for stage: String in ["open","write","rename","migration"]:
		var migration_store: RefCounted = P.new(root+"-v5-"+stage); migration_store._write_raw("gemcard.run",original_v5); migration_store.failure_stage = stage
		check(migration_store.load_run().reason == "migration_failed" and FileAccess.get_file_as_string(migration_store.directory+"gemcard.run.json") == original_v5,"v5 migration failure preserves original "+stage)
		var migrated: Dictionary = migration_store.load_run()
		check(migrated.state != null and migrated.state.runId == S.parse_json_exact(original_v5).state.runId,"v5 retry preserves runId "+stage)
	var legacy_records_store: RefCounted = P.new(root+"-records-v2")
	old_mode = RC.RUN; RC.use_batch_two()
	var old_records: Dictionary = R.create_records(); old_records.played = 4; old_records.wins = 2; old_records.farthest = 12
	check(legacy_records_store.save_records(old_records),"write authentic v2 records fixture")
	RC.set("RUN",old_mode)
	var migrated_records: Dictionary = legacy_records_store.load_records()
	check(migrated_records.wins == 2 and migrated_records.farthest == 12 and migrated_records.fullWins == 0 and migrated_records.bestClearedTier == -1,"old wins never grants trophy or unlock")
	legacy_records_store._write_raw("gemcard.records",'{"version":4}')
	legacy_records_store.load_records()
	check(not legacy_records_store.last_error.is_empty() and not legacy_records_store.save_records(R.create_records()) and FileAccess.get_file_as_string(legacy_records_store.directory+"gemcard.records.json") == '{"version":4}',"future records preserved without overwrite")
	var frontier: Dictionary = R.create_run(41,{"runId":"frontier"}); R.choose_relic(frontier,0)
	R.debug_set_monster_hp(frontier,0); check(R.cleared_fights(frontier) == 0,"broken but uncommitted fight not yet cleared")
	R.debug_jump_act_room(frontier,3,3); R.debug_set_monster_hp(frontier,0); R.end_run_turn(frontier); R.abandon_run(frontier)
	check(R.cleared_fights(frontier) == 15,"abandon elite reward counts won fight15")
	frontier = S.decode_run_save(original_v5).state; R.abandon_run(frontier)
	check(R.cleared_fights(frontier) == 12,"abandon act2 choice counts won fight12")
	var delete_store: RefCounted = P.new(root+"-delete")
	var ending: Dictionary = R.create_run(7,{"runId":"delete-once"}); R.choose_relic(ending,0); R.debug_jump_act_room(ending,3,6)
	delete_store.save_run(ending); R.debug_set_monster_hp(ending,0); R.end_run_turn(ending)
	var deletion_records: Dictionary = delete_store.load_records(); delete_store.failure_stage = "delete"
	check(delete_store.record_result(ending,deletion_records) and deletion_records.fullWins == 1,"successful atomic record survives delete failure")
	check(P.new(delete_store.directory).load_run().state == null and delete_store.load_records().fullWins == 1,"restart receipt clears settled old run without double trophy")
	var later: Dictionary = H.full_victory(1); later.runId = "late-old"
	var newest: Dictionary = R.create_run(99,{"runId":"newest"}); delete_store.save_run(newest)
	check(delete_store.record_result(later,deletion_records) and delete_store.load_run().state.runId == "newest","late old settlement cannot clear newest run")
	var guarded: Dictionary = R.create_run(15,{"runId":"guard-saved"}); R.choose_relic(guarded,0); R.acquire_relic(guarded,"guard")
	guarded.monster.countdown = 1; R.end_run_turn(guarded); R.play_run_card(guarded,0)
	var guarded_raw: Variant = S.encode_run_save(guarded)
	check(guarded.guardUsedThisAct and guarded_raw != null,"used guard and paired history save")
	if guarded_raw != null:
		var restored: Dictionary = S.decode_run_save(guarded_raw).state
		R.undo_run(restored); check(restored.guardUsedThisAct,"undo cannot regenerate spent guard")
	var capped: Dictionary = R.create_run(18,{"runId":"cap-history"}); R.choose_relic(capped,0); R.debug_jump_act_room(capped,3,6)
	preload("res://tests/test_batch_two_run.gd").new().deal(capped,[1,2])
	R.debug_set_monster_hp(capped,capped.monster.maxHp/3.0+1000); capped.game.m = 64
	var uncapped: Dictionary = capped.duplicate(true); R.play_run_card(capped,0)
	var cap_raw: Variant = S.encode_run_save(capped)
	check(cap_raw != null and capped.game.row[0].m == 64 and capped.game.m <= 32,"cap crossing history accepts legitimate prior64")
	if cap_raw != null:
		var restored: Dictionary = S.decode_run_save(cap_raw).state
		check(R.undo_run(restored) and G.first_difference(restored,uncapped).is_empty(),"cap crossing load undo exact")
	var corrupt: Dictionary = active.duplicate(true); corrupt.difficulty.extra = 1
	check(S.encode_run_save(corrupt) == null,"difficulty unknown key rejected")
	corrupt = active.duplicate(true); corrupt.hpScale = 2
	check(S.encode_run_save(corrupt) == null,"derived scale mismatch rejected")
	check(S.decode_run_save('{"version":7}').reason == "unsupported","v7 preserved")
	return result()
func result() -> Dictionary: return {"passed":passed,"failed":failures.size(),"failures":failures}
