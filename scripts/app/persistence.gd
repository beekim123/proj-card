class_name GamePersistence
extends RefCounted
## Native filesystem adapter for the H5 save.ts behavior. Rules return the exact
## portable JSON string; this adapter writes and reads that original text.
const RC: GDScript = preload("res://rules/run_config.gd")
const Progression: GDScript = preload("res://rules/progression.gd")
const Profile = preload("res://rules/profile.gd")
const Save: GDScript = preload("res://rules/save_state.gd")
const Run: GDScript = preload("res://rules/run.gd")
const DEFAULT_SETTINGS: Dictionary = {"hint": true, "hand": 6, "grow": true, "tools": false, "layout": "auto", "formula": false,
	"tier":0, "sound": true, "volume": 2, "shake": true, "animationSpeed": "normal"}
const UNAVAILABLE: String = "浏览器未允许保存进度，本次游戏仍可继续"
const FAILED_CLEAR: String = "上次的进度读不出来，但浏览器未允许清除存档"
static var _next_generation: int = 1
static var _saved_runs: Array = []
static var _storage_runs: Dictionary = {}
var directory: String = "user://"
var last_error: String = ""
var failure_stage: String = ""
var failure_remaining: int = 1

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
	if _fail_io("open"): return false
	var target: String = directory + key + ".json"
	var file: FileAccess = FileAccess.open(target + ".tmp", FileAccess.WRITE)
	if file == null:
		last_error = UNAVAILABLE; return false
	if _fail_io("write"): file.close(); return false
	file.store_string(raw); file.flush()
	var write_error: Error = file.get_error(); file.close()
	if write_error != OK: last_error = UNAVAILABLE; return false
	if _fail_io("rename"): return false
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
	if Progression.tier_multiplier(saved.get("tier",0)) >= 0: settings.tier = int(saved.get("tier",0))
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
	if RC.is_current():
		if not Save.integer(value.get("fullWins")) or not Save.integer(value.get("bestClearedTier"),-1) or value.bestClearedTier > 5: return false
		if value.fullWins > value.wins or (value.fullWins == 0 and value.bestClearedTier != -1) or (value.fullWins > 0 and value.bestClearedTier < 0): return false
	return value.wins <= value.played and value.farthest <= (7 if RC.RUN.legacy else RC.RUN.fights.size()) and (RC.RUN.legacy or (Save.integer(value.get("retreats")) and value.retreats <= value.played))

func _copy_records(records: Dictionary) -> Dictionary:
	var result: Dictionary = {"played": records.played, "wins": records.wins, "farthest": records.farthest, "bestTurn": records.bestTurn, "maxOverkill": records.maxOverkill}
	if not RC.RUN.legacy: result.retreats = records.get("retreats",0)
	if RC.is_current(): result.fullWins = records.get("fullWins",0); result.bestClearedTier = records.get("bestClearedTier",-1)
	return result

func _read_records_older() -> Dictionary:
	var raw: Variant = _read_raw("gemcard.records")
	var defaults: Dictionary = {"version":2,"records":Run.create_records(),"profile":Profile.create_profile(),"settledRunIds":[],"clearedRun":null}
	if raw == null: return defaults
	var value: Variant = Save.parse_json_exact(raw)
	if value is Dictionary and value.get("version") == 2:
		var valid: bool = _is_records(value.get("records")) and Profile.valid(value.get("profile")) and value.get("settledRunIds") is Array
		if valid:
			var ids: Array = value.settledRunIds
			valid = Save._unique(ids)
			for id: Variant in ids:
				if not id is String or id.is_empty(): valid = false
		if valid and (value.get("clearedRun") == null or value.clearedRun is String): return value
	elif value is Dictionary and not value.has("version"):
		var records: Dictionary = value.duplicate(true)
		if not RC.RUN.legacy:
			records.retreats = 0
			if Save.integer(records.get("farthest")) and records.farthest <= 7: records.farthest = max(0,int(records.farthest)-1)
			else: records.farthest = -1
		if _is_records(records):
			defaults.records = _copy_records(records); defaults.clearedRun = value.get("clearedRun")
			return defaults
	if not RC.RUN.legacy: last_error = "收藏与纪录读不出来，原文件已保留"
	return defaults

func _read_records() -> Dictionary:
	if not RC.is_current(): return _read_records_older()
	var defaults: Dictionary = {"version":3,"records":Run.create_records(),"profile":Profile.create_profile(),"settledRunIds":[],"clearedRun":null}
	var raw: Variant = _read_raw("gemcard.records")
	if raw == null: return defaults
	var value: Variant = Save.parse_json_exact(raw)
	if value is Dictionary and value.get("version") == 3:
		var valid: bool = _is_records(value.get("records")) and Profile.valid(value.get("profile")) and value.get("settledRunIds") is Array
		if valid:
			valid = Save._unique(value.settledRunIds)
			for id: Variant in value.settledRunIds:
				if not id is String or id.is_empty(): valid = false
		if valid and (value.get("clearedRun") == null or value.clearedRun is String): return value
	elif value is Dictionary and (value.get("version") == 2 or not value.has("version")):
		var current: Dictionary = RC.RUN; RC.use_batch_two()
		var older: Dictionary = _read_records_older()
		RC.set("RUN",current)
		if last_error.is_empty():
			older.version = 3; older.records.fullWins = 0; older.records.bestClearedTier = -1
			if _is_records(older.records) and Profile.valid(older.profile): return older
	last_error = "收藏与纪录读不出来，原文件已保留"
	return defaults

func _write_records(records: Dictionary, cleared_run: Variant, previous: Dictionary = {}) -> bool:
	if not _is_records(records): last_error = "纪录无效"; return false
	if RC.RUN.legacy:
		var value: Dictionary = _copy_records(records)
		if cleared_run != null: value.clearedRun = cleared_run
		return _write("gemcard.records",value)
	var envelope: Dictionary = previous.duplicate(true) if not previous.is_empty() else _read_records()
	if not last_error.is_empty(): return false
	envelope.version = RC.RUN.recordsEnvelopeVersion
	envelope.records = _copy_records(records); envelope.clearedRun = cleared_run
	return _write("gemcard.records",envelope)

func load_profile() -> Dictionary:
	last_error = ""
	var envelope: Dictionary = _read_records()
	return envelope.profile.duplicate(true) if last_error.is_empty() else {}

func new_run_id() -> String:
	return Crypto.new().generate_random_bytes(16).hex_encode()

func _fail_io(stage: String) -> bool:
	if failure_stage != stage: return false
	if failure_remaining > 0: failure_remaining -= 1
	if failure_remaining == 0: failure_stage = ""; failure_remaining = 1
	last_error = UNAVAILABLE; return true

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
	if not last_error.is_empty(): return {"state":null,"clear":false,"reason":"io","error":last_error}
	var envelope: Dictionary = _read_records()
	if not last_error.is_empty(): return {"state":null,"clear":false,"reason":"io","error":last_error}
	if raw != null and raw == envelope.clearedRun:
		clear_run(); return {"state":null,"clear":false,"reason":"empty"}
	var result: Dictionary = Save.decode_run_save(raw)
	if result.get("migrated",false):
		# Back up the untouched v4 bytes before any migration write.
		var backup_key: String = "gemcard.run.v"+str(result.get("sourceVersion",4))+"-" + str(raw).sha256_text().left(16)
		if not FileAccess.file_exists(directory+backup_key+".json") and not _write_raw(backup_key,raw):
			return {"state":null,"clear":false,"reason":"migration_failed","error":last_error}
		if result.state.runId.is_empty():
			var identity: Variant = _read("gemcard.run.migration")
			if not identity is Dictionary or identity.get("sourceHash") != str(raw).sha256_text() or not identity.get("runId") is String:
				identity = {"sourceHash":str(raw).sha256_text(),"runId":new_run_id()}
				if not _write("gemcard.run.migration",identity): return {"state":null,"clear":false,"reason":"migration_failed","error":last_error}
			result.state.runId = identity.runId
		if _fail_io("migration"): return {"state":null,"clear":false,"reason":"migration_failed","error":last_error}
		var converted: Variant = Save.encode_run_save(result.state)
		if converted == null or not _write_raw("gemcard.run",converted):
			return {"state":null,"clear":false,"reason":"migration_failed","error":last_error if not last_error.is_empty() else Save.last_error}
		raw = converted
	if result.state != null and raw != null:
		if not RC.RUN.legacy and envelope.settledRunIds.has(result.state.get("runId")):
			clear_run(); return {"state":null,"clear":false,"reason":"empty"}
		_remember_save(result.state,raw,true)
	if result.reason == "unsupported": result.error = "存档来自更新版本，原文件已保留"
	if result.clear:
		if not RC.RUN.legacy and raw != null and not _write_raw("gemcard.run.diagnostic-"+str(raw).sha256_text().left(16),raw):
			result.clear = false; result.error = last_error
		elif not clear_run(): result.error = FAILED_CLEAR
	return result

func save_run(state: Dictionary) -> bool:
	last_error = ""
	if not RC.RUN.legacy:
		var existing: Variant = _read("gemcard.run")
		if not last_error.is_empty(): return false
		if existing is Dictionary and Save.integer(existing.get("version")) and existing.version > RC.RUN.maxReadableRunVersion:
			last_error = "存档来自更新版本，原文件已保留"; return false
		if not state.get("runId") is String or state.runId.is_empty(): last_error = "这局缺少身份，不能保存"; return false
	var raw: Variant = Save.encode_run_save(state)
	if not str(Save.last_error).is_empty(): last_error = Save.last_error; return false
	if raw == null: return clear_run()
	var envelope: Dictionary = _read_records()
	if not last_error.is_empty(): return false
	if envelope.clearedRun == raw:
		if not clear_run() or not _write_records(envelope.records, null): return false
	if not _write_raw("gemcard.run", raw): return false
	_remember_save(state, raw)
	return true

func clear_run() -> bool:
	if _fail_io("delete"): return false
	var path: String = directory + "gemcard.run.json"
	var result: bool = not FileAccess.file_exists(path) or DirAccess.remove_absolute(path) == OK
	if not result: last_error = FAILED_CLEAR
	return result

func record_result(state: Dictionary, records: Dictionary) -> bool:
	last_error = ""
	if state.get("result") == null: return false
	if RC.is_current():
		if state.get("phase") not in ["victory","retreat","defeat"] or state.result.outcome != state.phase or state.get("contentVersion") != "body-batch-3": last_error = "结算状态无效"; return false
		if not state.get("difficulty") is Dictionary or Progression.tier_multiplier(state.difficulty.get("tier")) < 0: last_error = "结算档位无效"; return false
		if state.phase == "victory" and (state.fight != 18 or Run.cleared_fights(state) != 18): last_error = "不是完整三幕通关"; return false
	if not RC.RUN.legacy and (not state.get("runId") is String or state.runId.is_empty()):
		last_error = "这局缺少身份，不能结算"; return false
	if state.result.get("recordsApplied", false): return true
	var raw: Variant = _read_raw("gemcard.run")
	if not last_error.is_empty(): return false
	var envelope: Dictionary = _read_records()
	if not last_error.is_empty(): return false
	if RC.RUN.legacy and raw != null and raw == envelope.clearedRun:
		records.merge(envelope.records, true); state.result.recordsApplied = true
		clear_run(); return true
	var next_run: Dictionary = state.duplicate(true)
	var next_records: Dictionary = _copy_records(records if RC.RUN.legacy else envelope.records)
	Run.update_records(next_records, next_run)
	var identity: Dictionary = _saved_identity(state)
	var current: Dictionary = _storage_runs.get(directory, {})
	var owns_save: bool = raw != null and identity.get("raw") == raw and (current.is_empty() or identity.generation == current.generation)
	if not RC.RUN.legacy:
		if envelope.settledRunIds.has(state.runId):
			records.merge(envelope.records,true); state.result.recordsApplied = true
			if owns_save: clear_run()
			return true
		var updated: Dictionary = envelope.duplicate(true)
		updated.settledRunIds.append(state.runId)
		var previous_collection: Array = Profile.starting_relics(envelope.profile)
		if state.result.outcome == "retreat" or (RC.is_current() and state.result.outcome == "victory"): updated.profile = Profile.apply_safe_exit(envelope.profile,state.relics)
		if RC.is_current() and state.result.outcome == "victory":
			next_records = Progression.apply_clear(next_records,int(state.difficulty.tier))
			next_run.result.firstBigGem = not Progression.has_big_gem(envelope.records)
			next_run.result.newUnlockedTiers = []
			for tier: int in range(Progression.unlocked_tier(envelope.records)+1,Progression.unlocked_tier(next_records)+1): next_run.result.newUnlockedTiers.append(tier)
		next_run.result.newCollection = []
		for id: String in Profile.starting_relics(updated.profile):
			if not previous_collection.has(id): next_run.result.newCollection.append(id)
		if not _write_records(next_records,raw if owns_save else envelope.clearedRun,updated): return false
	elif not _write_records(next_records, raw if owns_save else envelope.clearedRun): return false
	records.merge(next_records, true)
	state.result.merge(next_run.result, true)
	if owns_save: clear_run()
	return true
