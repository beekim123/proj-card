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
	var corrupt: Dictionary = active.duplicate(true); corrupt.difficulty.extra = 1
	check(S.encode_run_save(corrupt) == null,"difficulty unknown key rejected")
	corrupt = active.duplicate(true); corrupt.hpScale = 2
	check(S.encode_run_save(corrupt) == null,"derived scale mismatch rejected")
	check(S.decode_run_save('{"version":7}').reason == "unsupported","v7 preserved")
	return result()
func result() -> Dictionary: return {"passed":passed,"failed":failures.size(),"failures":failures}
