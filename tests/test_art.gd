extends RefCounted
## Asset playback contracts: timing, restoration, trim, tint and slot transforms.

static func run() -> Dictionary:
	var result: Dictionary = {"passed": 0, "failed": [], "names": []}
	_check(result, FileAccess.file_exists("res://scripts/ui/art_inspector.gd"), "原生素材检查器入口已实现")
	var store_script: Script = load("res://scripts/art/art_store.gd")
	var clock_script: Script = load("res://scripts/art/feel_clock.gd")
	if store_script == null or clock_script == null:
		_check(result, false, "素材节点和手感时钟已实现")
		return result
	var clock: RefCounted = clock_script.new()
	var store: RefCounted = store_script.new(clock)
	_check(result, store.assets.size() == 118 and store.catalog().size() == 118, "新版118项完整清单，不使用占位别名")
	var provenance: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://art/new-art-provenance.json"))
	for id: String in store.assets:
		var delivered: Dictionary = store.assets[id]
		_check(result, delivered.definition.get("artStyle", "") == "fable-carbon-remake" and not delivered.definition.get("nativePlaceholder", false) and not delivered.entries.is_empty() and delivered.entries[""].hash == str(provenance.get("assets", {}).get(id, {}).get("svg_sha256", "")).substr(0,16), "运行节点使用交付新版原稿：" + id)
	var action: Dictionary = {"loop": false, "frames": [{"d": 100}, {"d": 100}, {"d": 100}]}
	_check(result, store_script.frame_at(action, 0.0) == 0 and store_script.frame_at(action, 150.0) == 1 and store_script.frame_at(action, 999.0) == 2, "按时间找帧，不循环的停在最后一帧")
	action["loop"] = true
	_check(result, store_script.frame_at(action, 350.0) == 0 and store_script.frame_at(action, -50.0) == 2, "循环的取模，包括负时间")
	_check(result, store_script.normalize_color("rgb(255, 16, 0)") == "#ff1000", "颜色统一")
	clock.freeze(60.0)
	clock.advance(0.1)
	_check(result, is_equal_approx(clock.time_ms, 40.0), "顿帧跨帧只扣除实际暂停的60毫秒")
	clock.reset()
	clock.speed = 2.0
	clock.slow(300.0)
	clock.slow(300.0)
	clock.advance(0.4)
	_check(result, is_equal_approx(clock.time_ms, 500.0), "慢放不重复除二，过期恢复原速度")
	clock.reset()
	var bear: Control = store.create("mon_bear")
	_check(result, bear != null and bear.size == Vector2(320, 400), "create按清单画框生成原生Control")
	bear.size = Vector2(160, 200)
	_check(result, bear.size == Vector2(160, 200), "素材Control可按布局缩小，不被原图最小尺寸撑开")
	bear.size = Vector2(320, 400)
	_check(result, store.play(bear, "daze") == 600.0 and store.get_stay(bear) == "daze", "stay进场返回清单毫秒数")
	clock.advance(0.8)
	bear.sync_clock()
	_check(result, bear.action_name == "daze~loop", "stay进场完成接循环段")
	store.play(bear, "hit")
	clock.advance(0.5)
	bear.sync_clock()
	_check(result, bear.action_name == "daze~loop", "临时事件结束直接恢复stay循环")
	store.play(bear, "hit")
	store.set_stay(bear, "")
	_check(result, bear.action_name == "hit", "清stay不会截断正在播的临时事件")
	clock.advance(0.5)
	bear.sync_clock()
	_check(result, bear.action_name == "idle" and store.get_stay(bear) == "", "临时事件结束回待机")
	store.set_static(bear, true)
	clock.advance(0.5)
	bear.sync_clock()
	_check(result, bear.frame_index == 0, "静止版待机停在第0帧")
	store.play(bear, "hit")
	clock.advance(0.15)
	bear.sync_clock()
	_check(result, bear.frame_index > 0, "静止版仍然播放事件")
	store.stop(bear)
	_check(result, bear.action_name == "idle" and bear.frame_index == 0 and store.get_stay(bear) == "", "stop取消事件和stay")
	var clock_art: Control = store.create("mon_clock")
	var text: Label = store.set_slot_text(clock_art, "countdown_slot", "3")
	store.play(clock_art, "tick")
	clock.advance(0.1)
	clock_art.sync_clock()
	var matrix: Array = clock_art.current_frame.get("m", {}).get("countdown_slot", [1, 0, 0, 1, 0, 0])
	var actual: Transform2D = text.get_parent().transform
	_check(result, actual == Transform2D(Vector2(matrix[0], matrix[1]), Vector2(matrix[2], matrix[3]), Vector2(matrix[4], matrix[5])), "文字槽按当前帧完整仿射矩阵跟着表盘")
	var rainbow: Control = store.create("ui_rainbow_slot")
	rainbow.set_color("#E3263A")
	_check(result, rainbow.entry_key == "1", "按palette颜色挑对应染色套")
	rainbow.set_color(Color("#2E66F0"))
	_check(result, rainbow.entry_key == "4", "Godot Color参数也挑对应染色套")
	var panel: Control = store.nine_slice("ui_panel", 24.0)
	_check(result, panel != null and panel.has_method("set_border_width"), "九宫格保留源切片和显示边宽")
	var effect_parent: Control = Control.new()
	var effect: Control = store.effect("fx_hit", effect_parent, 100.0, 200.0)
	_check(result, effect.position == Vector2(100, 200) - effect.size / 2.0, "特效按中心定位")
	clock.freeze(120.0)
	clock.advance(0.1)
	effect.sync_clock()
	_check(result, not effect.is_queued_for_deletion(), "顿帧期间特效不会提前移除")
	clock.advance(5.0)
	effect.sync_clock()
	_check(result, effect.is_queued_for_deletion(), "特效随统一时钟播完自行移除")
	for definition: Dictionary in store.manifest.get("assets", []):
		var id: String = definition["id"]
		var svg_path: String = "res://art/svg/%s.svg" % id
		if not FileAccess.file_exists(svg_path):
			svg_path = "res://art/placeholders/svg/%s.svg" % id
		if not FileAccess.file_exists(svg_path):
			_check(result, false, "缺少源SVG或H5原占位图：" + id)
			continue
		var hash: String = FileAccess.get_file_as_string(svg_path).sha256_text().substr(0, 16)
		var entries: Dictionary = store.assets.get(id, {}).get("entries", {})
		var valid: bool = not entries.is_empty()
		for key: String in entries:
			var entry: Dictionary = entries[key]
			valid = valid and entry.get("hash", "") == hash and FileAccess.file_exists("res://art/sprites/" + entry.get("still", ""))
			for sheet: Dictionary in entry.get("sheets", []):
				valid = valid and FileAccess.file_exists("res://art/sprites/" + sheet["f"])
			for event: String in definition.get("events", {}):
				valid = valid and entry.get("actions", {}).has(event)
		_check(result, valid, "素材指纹和帧文件：" + id)
		var native: Resource = load("res://art/resources/%s.tres" % id)
		var native_valid: bool = native != null and native.get("svg_fingerprint") == hash and native.get("art_id") == id
		if native != null:
			for path: String in native.get("animations").values():
				native_valid = native_valid and FileAccess.file_exists(path)
		_check(result, native_valid, "原生ArtResource与动作资源可用：" + id)
	var inspector_script: Script = load("res://scripts/ui/art_inspector.gd")
	if inspector_script != null:
		var inspector: Control = inspector_script.new()
		inspector.size = Vector2(1200, 900)
		inspector.setup(store)
		_check(result, inspector.asset_buttons.size() == store.catalog().size(), "检查器列出新版118项")
		inspector.select_asset("mon_clock")
		_check(result, inspector.preview.art_id == "mon_clock" and inspector.find_child("Events", true, false).get_child_count() == 8 and inspector.find_child("Slot_countdown_slot", true, false) != null, "检查器切座钟时提供全部事件和数字槽")
		inspector.select_asset("ui_rainbow_slot")
		_check(result, inspector.find_child("Tints", true, false).get_child_count() == 9 and inspector.find_child("Stay", true, false).item_count == 2 and inspector.find_child("Static", true, false) != null, "检查器提供染色、stay与静止控制")
		inspector.select_asset("ui_rule_sign")
		_check(result, inspector.find_child("IconSlot", true, false) != null, "检查器提供规矩牌图标槽选择")
		inspector.free()
	else:
		_check(result, false, "素材检查器可以解析")
	var sounds: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://audio/sounds.json"))
	var synthesis_source: String = FileAccess.get_file_as_string("res://tools/audio/sound-source.ts")
	_check(result, sounds.get("source_sha256", "") == synthesis_source.sha256_text(), "离线音效指纹和冻结合成器一致")
	if FileAccess.file_exists("res://h5/src/ui/sound.ts"):
		_check(result, synthesis_source == FileAccess.get_file_as_string("res://h5/src/ui/sound.ts"), "独立音效工具保留H5原始代码")
	var sound_valid: bool = sounds.get("recordings", []).size() == 204
	for recording: Dictionary in sounds.get("recordings", []):
		var file: FileAccess = FileAccess.open("res://audio/" + recording["file"], FileAccess.READ)
		if file == null:
			sound_valid = false
			continue
		sound_valid = sound_valid and file.get_buffer(4).get_string_from_ascii() == "RIFF"
		file.seek(40)
		sound_valid = sound_valid and file.get_32() == int(recording["frames"]) * 4
		file.close()
	_check(result, sound_valid, "68种声音三个原音量全部录制为有效双声道WAV")
	_check(result, FileAccess.file_exists("res://fonts/NotoSansCJKsc-Regular.otf") and FileAccess.file_exists("res://fonts/OFL.txt"), "简中Noto字体与OFL许可证随包保留")
	bear.free()
	clock_art.free()
	rainbow.free()
	panel.free()
	effect_parent.free()
	store.dispose()
	return result

static func _check(result: Dictionary, condition: bool, title: String) -> void:
	result["names"].append(title)
	if condition:
		result["passed"] += 1
	else:
		result["failed"].append(title)
