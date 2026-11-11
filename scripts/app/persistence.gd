class_name GamePersistence
extends RefCounted
## Native filesystem adapter for the H5 save.ts behavior. Rules return the exact
## portable JSON string; this adapter writes and reads that original text.
const Save: GDScript = preload("res://rules/save_state.gd")
const Run: GDScript = preload("res://rules/run.gd")
const DEFAULT_SETTINGS: Dictionary = {"hint": true, "hand": 6, "grow": true, "tools": false, "layout": "auto", "formula": false,
	"sound": true, "volume": 2, "shake": true, "animationSpeed": "normal"}
const UNAVAILABLE: String = "浏览器未允许保存进度，本次游戏仍可继续"
const FAILED_CLEAR: String = "上次的进度读不出来，但浏览器未允许清除存档"
static var _next_generation: int = 1
static var _saved_runs: Array = []
static var _storage_runs: Dictionary = {}
var directory: String = "user://"
var last_error: String = ""

func _init(custom_directory: String = "") -> void:
	if not custom_directory.is_empty(): directory = custom_directory.trim_suffix("/") + "/"
	DirAccess.make_dir_recursive_absolute(directory)

func _read_raw(key: String) -> Variant:
	var path: String = directory + key + ".json"
	var file: FileAccess = FileAccess.open(path, FileAccess.READ)
	if file == null:
		if FileAccess.file_exists(path): last_error = UNAVAILABLE
		return null
	return file.get_as_text()

func _read(key: String) -> Variant:
	var raw: Variant = _read_raw(key)
	return Save.parse_json_exact(raw) if raw != null else null

func _write_raw(key: String, raw: String) -> bool:
	var target: String = directory + key + ".json"
	var file: FileAccess = FileAccess.open(target + ".tmp", FileAccess.WRITE)
	if file == null:
		last_error = UNAVAILABLE; return false
	file.store_string(raw); file.flush(); file.close()
	var result: Error = DirAccess.rename_absolute(target + ".tmp", target)
	if result != OK: last_error = UNAVAILABLE
	return result == OK

func _write(key: String, value: Variant) -> bool:
	return _write_raw(key, JSON.stringify(value, "", false, true))

func _settings_of(value: Variant) -> Dictionary:
	var saved: Dictionary = value if value is Dictionary else {}
	var settings: Dictionary = DEFAULT_SETTINGS.duplicate(true)
	for key: String in ["hint", "grow", "tools", "formula", "sound", "shake"]:
		if saved.get(key) is bool: settings[key] = saved[key]
	if saved.get("hand") == 6 or saved.get("hand") == 7 or saved.get("hand") == 8: settings.hand = int(saved.hand)
	if saved.get("layout") in ["landscape", "portrait"]: settings.layout = saved.layout
	if saved.get("volume") == 1 or saved.get("volume") == 2 or saved.get("volume") == 3: settings.volume = int(saved.volume)
	if saved.get("animationSpeed") == "fast": settings.animationSpeed = "fast"
	return settings

func load_settings() -> Dictionary:
	last_error = ""
	return _settings_of(_read("gemcard.settings"))

func save_settings(settings: Dictionary) -> bool:
	last_error = ""
	return _write("gemcard.settings", _settings_of(settings))

func _is_records(value: Variant) -> bool:
	if not value is Dictionary: return false
	for key: String in ["played", "wins", "farthest"]:
		if not Save.integer(value.get(key)): return false
	for key: String in ["bestTurn", "maxOverkill"]:
		if not Save.number(value.get(key)): return false
	return value.wins <= value.played and value.farthest <= 7

func _copy_records(records: Dictionary) -> Dictionary:
	return {"played": records.played, "wins": records.wins, "farthest": records.farthest, "bestTurn": records.bestTurn, "maxOverkill": records.maxOverkill}

func _read_records() -> Dictionary:
	var value: Variant = _read("gemcard.records")
	var valid: bool = _is_records(value)
	return {"records": _copy_records(value) if valid else Run.create_records(),
		"clearedRun": value.clearedRun if valid and value.get("clearedRun") is String else null}

func _write_records(records: Dictionary, cleared_run: Variant) -> bool:
	if not _is_records(records):
		last_error = "纪录无效"; return false
	var envelope: Dictionary = _copy_records(records)
	if cleared_run != null: envelope.clearedRun = cleared_run
	return _write("gemcard.records", envelope)

func load_records() -> Dictionary:
	last_error = ""
	return _read_records().records

func save_records(records: Dictionary) -> bool:
	last_error = ""
	var receipt: Variant = _read_records().clearedRun
	if not last_error.is_empty(): return false
	return _write_records(records, receipt)

func _saved_identity(state: Dictionary) -> Dictionary:
	for identity: Dictionary in _saved_runs:
		if is_same(identity.state, state): return identity
	return {}

func _remember_save(state: Dictionary, raw: String, loaded: bool = false) -> void:
	var current: Dictionary = _storage_runs.get(directory, {})
	var previous: Dictionary = _saved_identity(state)
	var generation: int = 0
	if not previous.is_empty(): generation = previous.generation
	elif loaded and current.get("raw") == raw: generation = current.generation
	else: generation = _next_generation; _next_generation += 1
	var identity: Dictionary = {"state": state, "raw": raw, "generation": generation}
	if not previous.is_empty(): _saved_runs.erase(previous)
	_saved_runs.append(identity)
	# Older generations cannot own the current save. Bound retained dictionary
	# references rather than keeping every completed adventure alive forever.
	if _saved_runs.size() > 32: _saved_runs.pop_front()
	_storage_runs[directory] = {"raw": raw, "generation": generation}

func load_run() -> Dictionary:
	last_error = ""
	var raw: Variant = _read_raw("gemcard.run")
	if not last_error.is_empty(): return {"state": null, "clear": false, "reason": "empty", "error": UNAVAILABLE}
	var receipt: Variant = _read_records().clearedRun
	if not last_error.is_empty(): return {"state": null, "clear": false, "reason": "empty", "error": UNAVAILABLE}
	if raw != null and raw == receipt:
		clear_run(); return {"state": null, "clear": false, "reason": "empty"}
	var result: Dictionary = Save.decode_run_save(raw)
	if result.state != null and raw != null: _remember_save(result.state, raw, true)
	if result.clear and not clear_run(): result.error = FAILED_CLEAR
	return result

func save_run(state: Dictionary) -> bool:
	last_error = ""
	var raw: Variant = Save.encode_run_save(state)
	if not str(Save.last_error).is_empty(): return false
	if raw == null: return clear_run()
	var envelope: Dictionary = _read_records()
	if not last_error.is_empty(): return false
	if envelope.clearedRun == raw:
		if not clear_run() or not _write_records(envelope.records, null): return false
	if not _write_raw("gemcard.run", raw): return false
	_remember_save(state, raw)
	return true

func clear_run() -> bool:
	var path: String = directory + "gemcard.run.json"
	var result: bool = not FileAccess.file_exists(path) or DirAccess.remove_absolute(path) == OK
	if not result: last_error = FAILED_CLEAR
	return result

func record_result(state: Dictionary, records: Dictionary) -> bool:
	last_error = ""
	if state.get("result") == null: return false
	if state.result.get("recordsApplied", false): return true
	var raw: Variant = _read_raw("gemcard.run")
	if not last_error.is_empty(): return false
	var envelope: Dictionary = _read_records()
	if not last_error.is_empty(): return false
	if raw != null and raw == envelope.clearedRun:
		records.merge(envelope.records, true); state.result.recordsApplied = true
		clear_run(); return true
	var next_run: Dictionary = state.duplicate(true)
	var next_records: Dictionary = _copy_records(records)
	Run.update_records(next_records, next_run)
	var identity: Dictionary = _saved_identity(state)
	var current: Dictionary = _storage_runs.get(directory, {})
	var owns_save: bool = raw != null and identity.get("raw") == raw and (current.is_empty() or identity.generation == current.generation)
	if not _write_records(next_records, raw if owns_save else envelope.clearedRun): return false
	records.merge(next_records, true)
	state.result.merge(next_run.result, true)
	if owns_save: clear_run()
	return true
