class_name TestPersistence
extends RefCounted
const P: GDScript = preload("res://scripts/app/persistence.gd")
const R: GDScript = preload("res://rules/run.gd")
const S: GDScript = preload("res://rules/save_state.gd")
const RunTests: GDScript = preload("res://tests/test_run.gd")
var passed: int = 0
var failed: int = 0
var names: Array[String] = []
var failures: Array[String] = []
var directory: String = ""

func _check(name: String, condition: bool) -> void:
	names.append(name)
	if condition: passed += 1
	else: failed += 1; failures.append(name)

func _same(actual: Variant, expected: Variant) -> bool:
	return RunTests.new().first_difference(actual, expected).is_empty()

func _battle(seed: int = 1979) -> Dictionary:
	var state: Dictionary = R.create_run(seed)
	state.relicOptions[0] = "white"; R.choose_relic(state, 0)
	return state

func _reset() -> void:
	for key: String in ["gemcard.run", "gemcard.records", "gemcard.settings"]:
		for suffix: String in [".json", ".json.tmp"]:
			var path: String = directory.path_join(key + suffix)
			if FileAccess.file_exists(path): DirAccess.remove_absolute(path)

func _write(key: String, raw: String) -> void:
	var file: FileAccess = FileAccess.open(directory.path_join(key + ".json"), FileAccess.WRITE)
	if file != null: file.store_string(raw); file.close()

func run() -> Dictionary:
	passed = 0; failed = 0; names.clear(); failures.clear()
	directory = ProjectSettings.globalize_path("res://artifacts/persistence/native")
	DirAccess.make_dir_recursive_absolute(directory)
	_reset()
	var storage: RefCounted = P.new(directory)
	for hand: int in [6, 7, 8]:
		for volume: int in [1, 2, 3]:
			var settings: Dictionary = P.DEFAULT_SETTINGS.duplicate(true)
			settings.hand = hand; settings.volume = volume; settings.layout = "portrait"; settings.grow = false; settings.hint = false
			_check("settings hand %s volume %s survives real file restore" % [hand, volume], storage.save_settings(settings) and _same(storage.load_settings(), settings))
	var state: Dictionary = _battle()
	R.play_run_card(state, 0)
	var encoded: Variant = S.encode_run_save(state)
	var saved: bool = storage.save_run(state)
	var actual_raw: String = FileAccess.get_file_as_string(directory.path_join("gemcard.run.json"))
	var loaded: Dictionary = storage.load_run()
	_check("battle save file preserves original encode string and complete paired undo state", saved and encoded == actual_raw and loaded.reason == "ok" and _same(loaded.state, state))
	if loaded.state != null:
		var restored: Dictionary = loaded.state
		R.undo_run(restored); R.undo_run(state)
		R.play_run_card(restored, 0); R.play_run_card(state, 0)
		_check("restored battle undo and replay preserve RNG and all state", _same(restored, state))
	else: _check("restored battle undo and replay preserve RNG and all state", false)
	state = _battle(321)
	state.monster.hp = 1; state.monster.turnStartHp = 1
	while not state.monster.broken and not state.game.hand.is_empty(): R.play_run_card(state, 0)
	R.end_run_turn(state)
	saved = storage.save_run(state); loaded = storage.load_run()
	var ok: bool = saved and loaded.reason == "ok" and _same(loaded.state, state)
	if loaded.state != null:
		R.choose_loot(state, 0); R.choose_loot(loaded.state, 0)
		ok = ok and _same(loaded.state, state)
	_check("loot real file restore keeps fixed rewards and the following random stream", ok)
	_reset(); state = _battle(7); storage.save_run(state)
	var before_terminal: String = FileAccess.get_file_as_string(directory.path_join("gemcard.run.json"))
	R.abandon_run(state)
	var records: Dictionary = R.create_records()
	ok = storage.record_result(state, records) and records.played == 1 and state.result.recordsApplied and not FileAccess.file_exists(directory.path_join("gemcard.run.json"))
	ok = storage.record_result(state, records) and records.played == 1 and _same(storage.load_records(), records) and ok
	_check("real file settlement records once and retires only its saved adventure", ok)
	_write("gemcard.run", before_terminal)
	loaded = storage.load_run()
	_check("persisted settlement receipt retires a leftover save without adding another record", loaded.reason == "empty" and loaded.state == null and not FileAccess.file_exists(directory.path_join("gemcard.run.json")) and storage.load_records().played == 1)
	_reset()
	var old: Dictionary = _battle(99)
	storage.save_run(old)
	var newer: Dictionary = _battle(99)
	storage.save_run(newer)
	R.abandon_run(old); records = R.create_records()
	ok = storage.record_result(old, records) and FileAccess.file_exists(directory.path_join("gemcard.run.json"))
	loaded = storage.load_run()
	_check("delayed settlement cannot retire a newer identical deterministic adventure", ok and loaded.reason == "ok" and _same(loaded.state, newer))
	_reset()
	_write("gemcard.run", '{"version":3,"state":{}}')
	_write("gemcard.records", '{"played":10,"wins":3,"farthest":7,"bestTurn":12345,"maxOverkill":10}')
	loaded = storage.load_run()
	_check("outdated run file is removed while existing records remain intact", loaded.reason == "outdated" and loaded.clear and not FileAccess.file_exists(directory.path_join("gemcard.run.json")) and storage.load_records().played == 10)
	_write("gemcard.records", '{"played":1.5,"wins":0,"farthest":1,"bestTurn":0,"maxOverkill":0}')
	_check("fractional record counters are rejected just as H5 records are", _same(storage.load_records(), R.create_records()))
	_reset()
	return {"passed": passed, "failed": failed, "names": names.duplicate(), "failures": failures.duplicate()}
