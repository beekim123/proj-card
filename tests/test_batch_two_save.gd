extends RefCounted
const R: GDScript = preload("res://rules/run.gd")
const S: GDScript = preload("res://rules/save_state.gd")
const RC: GDScript = preload("res://rules/run_config.gd")
const P: GDScript = preload("res://scripts/app/persistence.gd")
const RunSuite: GDScript = preload("res://tests/test_batch_two_run.gd")
var failures: Array[String] = []
var passed: int = 0
func check(ok: bool, label: String) -> void:
	if ok: passed += 1
	else: failures.append(label); printerr("FAIL: ",label)
func roundtrip(s: Dictionary, label: String) -> void:
	var raw: Variant = S.encode_run_save(s)
	check(raw is String,label+" encoded")
	if not raw is String: return
	check(S.parse_json_exact(raw).version == 5,label+" version5")
	var restored: Dictionary = S.decode_run_save(raw)
	check(restored.reason == "ok" and same(restored.state,s),label+" exact roundtrip")
func fresh(id: String) -> Dictionary:
	return R.create_run(1979,{"runId":id})
func run() -> Dictionary:
	var s: Dictionary = fresh("save-test")
	var raw: Variant = S.encode_run_save(s)
	check(raw is String and S.parse_json_exact(raw).version == 5,"v5 save contract")
	if not failures.is_empty(): return result()
	roundtrip(s,"initial"); R.choose_relic(s,0); roundtrip(s,"battle")
	var helper: RefCounted = RunSuite.new()
	helper.deal(s,[1,"palette","potion"]); s.hearts = 1
	R.play_run_card(s,0); R.play_run_card(s,0); R.play_run_card(s,0)
	roundtrip(s,"resolved palette and spent potion row")
	var palette_run: Dictionary = fresh("palette-resume"); R.choose_relic(palette_run,0)
	helper.deal(palette_run,[1,"palette","palette"])
	R.play_run_card(palette_run,0); R.play_run_card(palette_run,0)
	var palette_restored: Dictionary = S.decode_run_save(S.encode_run_save(palette_run)).state
	R.play_run_card(palette_run,0); R.play_run_card(palette_restored,0)
	check(same(palette_run,palette_restored),"palette numeric masks survive JSON and next play")
	var decoded: Dictionary = S.decode_run_save(S.encode_run_save(s))
	if decoded.state == null: return result()
	var recovered: Dictionary = decoded.state
	check(R.undo_run(s) and R.undo_run(recovered) and same(recovered,s),"restore potion undo hearts RNG")
	helper.win(s); roundtrip(s,"loot"); R.choose_loot(s,0); roundtrip(s,"doors")
	R.choose_door(s,0); R.debug_jump_act_room(s,1,6); helper.win(s); roundtrip(s,"boss relic")
	R.choose_relic(s,0); roundtrip(s,"act choice")
	var exit_restored: Dictionary = S.decode_run_save(S.encode_run_save(s)).state
	var exit_original: Dictionary = s.duplicate(true)
	R.choose_act_exit(exit_restored,"retreat"); R.choose_act_exit(exit_original,"retreat")
	check(same(exit_original,exit_restored),"restored retreat reason is canonical integer act")
	R.choose_act_exit(s,"continue"); roundtrip(s,"second act")
	for change: String in ["thirdAct","rules","monsters","purpose","runId","content","phase"]:
		var bad: Dictionary = s.duplicate(true)
		match change:
			"thirdAct": bad.act = 3
			"rules": bad.monster.rule = "unknown"
			"monsters": bad.monsters[8] = "clock"
			"purpose": bad.relicPurpose = "unknown"
			"runId": bad.runId = ""
			"content": bad.contentVersion = "unknown"
			"phase": bad.phase = "ascension"
		check(S.encode_run_save(bad) == null,"reject " + change)
	for phase: String in ["relic","battle","loot","doors","shop"]:
		var original: String = FileAccess.get_file_as_string("res://tests/fixtures/body-batch-2/v4-"+phase+".json")
		var migrated: Dictionary = S.decode_run_save(original)
		check(migrated.reason == "ok" and migrated.get("migrated",false),"v4 migrate " + phase)
		if migrated.state != null:
			var previous: Dictionary = S.parse_json_exact(original).state
			check(same(migrated.state.game,previous.game) and migrated.state.monsters.size() == 12 and migrated.state.game.rngState == previous.game.rngState,"v4 preserve game and RNG " + phase)
	var small: Dictionary = fresh("small-potion"); R.choose_relic(small,0)
	helper.deal(small,["potion"])
	small.cards = [small.game.hand[0].duplicate(true)]
	for card: Dictionary in small.game.deck.slice(0,18): small.cards.append(card.duplicate(true))
	small.game.deck = small.cards.slice(1).duplicate(true)
	R.play_run_card(small,0); R.end_run_turn(small)
	check(small.cards.size() == 18 and R.tool_count(small,"potion") == 0,"consumed potion permits deck below twenty")
	roundtrip(small,"eighteen card post consumption deck")
	check(not R.shop_state(small).canDrop,"workshop cannot drop below twenty")
	migration_storage_cases()
	storage_cases()
	return result()
func storage_cases() -> void:
	var directory: String = ProjectSettings.globalize_path("res://artifacts/batch-2/storage-"+str(Time.get_ticks_usec()))
	var storage: RefCounted = P.new(directory)
	var records: Dictionary = storage.load_records()
	check(storage.load_profile().collected == RC.INITIAL_COLLECTION,"initial profile file adapter")
	var s: Dictionary = fresh("receipt-a"); R.choose_relic(s,0)
	R.debug_jump_act_room(s,1,6); RunSuite.new().win(s); R.choose_relic(s,0)
	check(storage.save_run(s),"save act choice to real file")
	R.choose_act_exit(s,"retreat")
	for stage: String in ["open","write","rename"]:
		storage.failure_stage = stage
		check(not storage.record_result(s,records) and not s.result.recordsApplied and records.played == 0,"atomic failure " + stage)
		check(storage.load_profile().collected == RC.INITIAL_COLLECTION,"no false unlock " + stage)
	storage.failure_stage = "delete"
	check(storage.record_result(s,records) and records.played == 1 and records.retreats == 1 and records.wins == 0,"atomic retreat commit")
	var again: Dictionary = s.duplicate(true); again.result.recordsApplied = false
	check(storage.record_result(again,records) and records.played == 1,"same runId idempotent")
	check(storage.load_run().state == null,"receipt survives failed delete restart")
	var other: Dictionary = fresh("receipt-b"); R.choose_relic(other,0); storage.save_run(other); R.abandon_run(other)
	check(storage.record_result(other,records) and records.played == 2,"same seed distinct run IDs")
	var newest: Dictionary = fresh("receipt-new"); check(storage.save_run(newest),"new active save")
	again.result.recordsApplied = false; storage.record_result(again,records)
	check(storage.load_run().state.runId == "receipt-new","late callback does not clear new save")
	var envelope: Variant = S.parse_json_exact(FileAccess.get_file_as_string(directory+"/gemcard.records.json"))
	check(envelope.version == 2 and envelope.settledRunIds.size() == 2,"records profile receipts one envelope")
	storage.save_records(records)
	check(S.parse_json_exact(FileAccess.get_file_as_string(directory+"/gemcard.records.json")).settledRunIds.size() == 2,"save_records retains receipts")
func result() -> Dictionary:
	return {"passed":passed,"failed":failures.size(),"failures":failures}

func same(a: Variant,b: Variant) -> bool:
	return preload("res://tests/test_golden.gd").first_difference(a,b).is_empty()

func write_raw(directory: String, key: String, raw: String) -> void:
	var file: FileAccess = FileAccess.open(directory+"/"+key+".json",FileAccess.WRITE)
	file.store_string(raw); file.close()
func migration_storage_cases() -> void:
	var directory: String = ProjectSettings.globalize_path("res://artifacts/batch-2/migration-"+str(Time.get_ticks_usec()))
	var storage: RefCounted = P.new(directory)
	var original: String = FileAccess.get_file_as_string("res://tests/fixtures/body-batch-2/v4-battle.json")
	write_raw(directory,"gemcard.run",original)
	storage.failure_stage = "migration"
	var failed: Dictionary = storage.load_run()
	check(failed.reason == "migration_failed" and FileAccess.get_file_as_string(directory+"/gemcard.run.json") == original,"migration failure preserves v4 bytes")
	var identity: Dictionary = S.parse_json_exact(FileAccess.get_file_as_string(directory+"/gemcard.run.migration.json"))
	storage = P.new(directory)
	var recovered: Dictionary = storage.load_run()
	check(recovered.reason == "ok" and recovered.state.runId == identity.runId,"migration identity survives adapter restart")
	check(storage.load_run().state.runId == identity.runId,"repeat load same migration identity")
	check(FileAccess.get_file_as_string(directory+"/gemcard.run.v4-"+original.sha256_text().left(16)+".json") == original,"untouched v4 backup")
	var future: String = '{"version":6,"state":{}}'
	write_raw(directory,"gemcard.run",future)
	check(storage.load_run().reason == "unsupported" and not storage.save_run(fresh("future")) and FileAccess.get_file_as_string(directory+"/gemcard.run.json") == future,"unknown future version not overwritten")
	write_raw(directory,"gemcard.records",'{"played":4,"wins":1,"farthest":7,"bestTurn":100,"maxOverkill":2}')
	var records: Dictionary = storage.load_records()
	check(records.farthest == 6 and records.wins == 1 and records.retreats == 0,"legacy farthest7 becomes6 and wins retained")
	for farthest: int in range(1,7):
		write_raw(directory,"gemcard.records",JSON.stringify({"played":4,"wins":0,"farthest":farthest,"bestTurn":100,"maxOverkill":2}))
		check(storage.load_records().farthest == farthest-1,"legacy farthest " + str(farthest))
	write_raw(directory,"gemcard.records","corrupt-profile")
	check(storage.load_profile().is_empty() and not storage.last_error.is_empty(),"corrupt profile is not new profile")
	check(not storage.save_records(R.create_records()) and FileAccess.get_file_as_string(directory+"/gemcard.records.json") == "corrupt-profile","corrupt profile not silently overwritten")
