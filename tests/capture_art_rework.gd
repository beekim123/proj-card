extends SceneTree
## Standalone real-GPU evidence driver; never part of run_all.gd or the shipped UI.
## Each image gets a new Main and an isolated save directory. Existing production
## scenes, CardView, debug fixtures and SpriteArt playback are used unchanged.

const MAIN: GDScript = preload("res://scripts/app/game.gd")
const RUN: GDScript = preload("res://rules/run.gd")
const RUN_CONFIG: GDScript = preload("res://rules/run_config.gd")
const SPRITE_ART: GDScript = preload("res://scripts/art/sprite_art.gd")
const CARD_SEQUENCE: Array = ["mirror", "lens", "hammer", "diamond", "whistle", 0]
const EVENT_FPS: int = 30
const LOOP_FPS: int = 15
const WATCHDOG_SECONDS: float = 180.0

var _output: String = ""
var _app: Control
var _failure: String = ""
var _report: Dictionary = {
	"purpose": "08/09 art integration GPU evidence; debug fixtures are not natural playthroughs",
	"production_code_changed_by_driver": false,
	"selection_method": "Manual SVG CSS keyframe inspection; large non-death poses, not an exhaustive objective maximum search",
	"collection_limitation": "Current collection UI shows big-gem ownership text but has no relic_biggem artwork node; no UI change or substitute image is made",
	"captures": [],
	"complete": false,
}

func _init() -> void:
	_run.call_deferred()

func _run() -> void:
	_output = OS.get_environment("GEMCARD_CAPTURE_OUTPUT")
	if _output.is_empty():
		_output = ProjectSettings.globalize_path("res://artifacts/art-rework-08-09/screens/run-" + str(Time.get_unix_time_from_system()).replace(".", "-"))
	if not _output.is_absolute_path() or not _output.contains("/artifacts/"):
		_fail("Capture output must be an absolute isolated artifacts directory")
		await _finish()
		return
	if DirAccess.make_dir_recursive_absolute(_output) != OK:
		_fail("Cannot create capture output: " + _output)
		await _finish()
		return
	if FileAccess.file_exists(_output.path_join("report.json")):
		_fail("Refusing to reuse an earlier capture directory: " + _output)
		# Do not overwrite the report that caused this refusal.
		_output = ""
		await _finish()
		return
	if DisplayServer.get_name() == "headless":
		_fail("Real GPU/display session required; headless screenshots are refused")
		await _finish()
		return
	var adapter: String = RenderingServer.get_video_adapter_name()
	for software_name: String in ["swiftshader", "llvmpipe", "softpipe", "software rasterizer"]:
		if adapter.to_lower().contains(software_name):
			_fail("Software adapter cannot supply requested GPU evidence: " + adapter)
			await _finish()
			return
	RUN_CONFIG.use_current()
	create_timer(WATCHDOG_SECONDS).timeout.connect(_watchdog, CONNECT_ONE_SHOT)
	var plans: Array[Dictionary] = _capture_plans()
	_report.expected_captures = plans.size()
	for index: int in range(plans.size()):
		var plan: Dictionary = plans[index]
		plan.label = "%02d-%s" % [index + 1, plan.label]
		if not await _capture_one(plan):
			break
		await _dispose_app()
		if not _write_json(_output.path_join("report.json"), _report):
			break
	_report.complete = _failure.is_empty() and _report.captures.size() == plans.size()
	await _finish()

func _capture_plans() -> Array[Dictionary]:
	var plans: Array[Dictionary] = []
	for pose: Array in [["idle", 0.0], ["hit", 50.0], ["hit_big", 60.0], ["attack", 250.0], ["attack", 330.0]]:
		plans.append({"label": "tree-%s-%dms" % [pose[0], pose[1]], "kind": "monster", "art": "mon_tree", "act": 3, "room": 1, "action": pose[0], "ms": pose[1], "reason": "Exact requested runtime playback time; exported frames remain quantized at 30fps"})
	# The 100ms samples are inside the CSS 60–200ms heavy-hit hold. Box duck
	# holds its large retraction from 40–160ms. These are deliberate review
	# candidates for the largest intact deformation, excluding death dispersal.
	for candidate: Dictionary in [
		{"art": "mon_chest", "act": 1, "room": 1, "action": "hit_big", "ms": 100.0, "reason": "CSS hit_big hold: lid +82px, box (-22,-18), body y-scale .86; checks lid/body joint"},
		{"art": "mon_soldier", "act": 1, "room": 1, "action": "hit_big", "ms": 100.0, "reason": "CSS hit_big hold: body (-16,-12), 12deg, y-scale .84; checks head/body/legs/spear interfaces"},
		{"art": "mon_portrait", "act": 2, "room": 1, "action": "hit_big", "ms": 100.0, "reason": "CSS hit_big hold: frame/canvas/figure/hand (10,12), 10.5deg, y-scale .83"},
		{"art": "mon_lock", "act": 2, "room": 3, "action": "hit_big", "ms": 100.0, "reason": "CSS hit_big hold: body 9.5deg/y-scale .84, shackle 16deg; larger intact joint deformation than click/shut"},
		{"art": "mon_clock", "act": 1, "room": 3, "action": "hit_big", "ms": 100.0, "reason": "CSS hit_big hold: case (-12,-16), 9.5deg/y-scale .84, pendulum32deg, hands-75deg; live countdown slot retained"},
		{"art": "mon_box", "act": 2, "room": 1, "action": "duck", "ms": 100.0, "reason": "CSS duck hold: head +112px/hidden, spring y-scale .18, lid94deg, crank-120deg; deliberately large retraction pose"},
		{"art": "dummy", "act": 0, "room": 0, "action": "hit_big", "ms": 100.0, "reason": "CSS hit_big hold: body14deg, soft head21deg, y-scale .88; checks post/body/head interfaces"},
	]:
		var still: Dictionary = candidate.duplicate(true)
		still.merge({"label": candidate.art + "-idle", "kind": "monster", "action": "idle", "ms": 0.0, "reason": "Static idle frame zero in the real battle/practice presentation"}, true)
		plans.append(still)
		candidate.merge({"label": candidate.art + "-large-" + candidate.action, "kind": "monster"}, true)
		plans.append(candidate)
	plans.append({"label": "six-cards-hand", "kind": "cards", "preview_index": -1})
	for index: int in range(CARD_SEQUENCE.size()):
		plans.append({"label": "card-" + (str(CARD_SEQUENCE[index]) if index < 5 else "empty"), "kind": "cards", "preview_index": index})
	plans.append({"label": "home-emblem", "kind": "home", "required_art": "title_emblem"})
	plans.append({"label": "full-victory-biggem-bottom", "kind": "victory", "required_art": "relic_biggem"})
	plans.append({"label": "collection-current-ui", "kind": "collection"})
	plans.append({"label": "vault-coins", "kind": "vault", "required_art": "prop_coins"})
	return plans

func _capture_one(plan: Dictionary) -> bool:
	var save_directory: String = _output.path_join("saves").path_join(plan.label)
	for save_key: String in ["gemcard.run", "gemcard.records", "gemcard.settings"]:
		if FileAccess.file_exists(save_directory.path_join(save_key + ".json")):
			return _fail("Refusing to reuse an earlier isolated save: " + save_directory)
	OS.set_environment("GEMCARD_SAVE_DIR", save_directory)
	_app = MAIN.new()
	_app.fixed_seed = 1979
	_app.debug_enabled = true
	_app.forced_layout = "landscape"
	root.add_child(_app)
	await process_frame
	_app.prefs.sound = false
	_app.prefs.shake = false
	_app.sound.configure(_app.prefs)
	if not _app.art.stale.is_empty():
		return _fail("Stale sprite export: " + str(_app.art.stale))
	match str(plan.kind):
		"monster":
			if plan.art == "dummy":
				_app.start_practice()
			else:
				_app.start_adventure()
				RUN.choose_relic(_app.run_state, 0)
				RUN.debug_jump_act_room(_app.run_state, int(plan.act), int(plan.room))
				RUN.start_battle(_app.run_state, str(plan.art).trim_prefix("mon_"))
				_app.game_state = _app.run_state.game
			_app.debug_deal([1])
			if not is_instance_valid(_app.monster) or _app.monster.art_id != plan.art:
				return _fail("Wrong monster fixture: " + str(plan))
			if not _app.run_state.is_empty() and not _app.storage.save_run(_app.run_state):
				return _fail("Monster fixture could not be saved: " + str(_app.storage.last_error))
		"cards":
			_app.start_practice()
			_app.debug_deal(CARD_SEQUENCE)
			if _app.game_state.hand.size() != CARD_SEQUENCE.size():
				return _fail("Six-card hand was not prepared")
		"victory", "collection", "vault":
			var scenario: String = {"victory": "victory", "collection": "collection-top", "vault": "vault-regrow"}[plan.kind]
			if not _app._prepare_batch_three_capture(scenario):
				return _fail("Existing legal debug fixture failed: " + scenario)
		"home":
			_app.go_home()
		_:
			return _fail("Unknown capture plan: " + str(plan))
	var business_before: Dictionary = {"run": _app.run_state.duplicate(true), "game": _app.game_state.duplicate(true)}
	if not await _settle_presentation():
		return false
	if plan.kind == "cards" and int(plan.preview_index) >= 0:
		_app._preview_card(_app.game_state.hand[int(plan.preview_index)], float(_app.layout.width) / 2.0)
		await process_frame
		if not is_instance_valid(_app.preview):
			return _fail("Existing hand preview was not retained")
	if plan.kind == "victory":
		if _app.run_state.get("phase") != "victory" or _app.run_state.get("act") != 3 or _app.run_state.get("result", {}).get("outcome") != "victory":
			return _fail("Requested image is not a full third-act victory")
		var result_scroll: ScrollContainer = _app.scene.find_child("ResultScroll", true, false)
		if result_scroll == null:
			return _fail("Victory ResultScroll missing")
		result_scroll.scroll_vertical = int(result_scroll.get_v_scroll_bar().max_value)
		await process_frame
		await process_frame
		var gem_label: Label = _app.scene.find_child("BigGem", true, false)
		var gem_sprite: Control = _find_art(_app.scene, "relic_biggem")
		var visible_area: Rect2 = result_scroll.get_global_rect()
		var bar: VScrollBar = result_scroll.get_v_scroll_bar()
		plan.victory_checks = {
			"six_relics": _app.run_state.relics.size() == 6,
			"records_applied": _app.run_state.result.recordsApplied and _app.storage.load_records().fullWins == 1,
			"scrolled_to_bottom": result_scroll.scroll_vertical > 0 and bar.value >= bar.max_value - bar.page - 1.0,
			"biggem_label_in_visible_rect": gem_label != null and gem_label.is_visible_in_tree() and visible_area.encloses(gem_label.get_global_rect()),
			"biggem_sprite_in_visible_rect": gem_sprite != null and gem_sprite.is_visible_in_tree() and visible_area.encloses(gem_sprite.get_global_rect()),
		}
		for check_name: String in plan.victory_checks:
			if not plan.victory_checks[check_name]:
				return _fail("Full-victory screenshot check failed: " + check_name)
	_app._clear_timers()
	_freeze_nodes(_app)
	_app.clock.speed = 0.0
	if plan.kind == "monster":
		var sprite: Control = _app.monster
		if plan.action != "idle" and not sprite.definition.get("events", {}).has(plan.action):
			return _fail("Missing requested event: " + str(plan))
		sprite.stop()
		sprite.static_art = plan.action == "idle"
		sprite.start_action(str(plan.action))
		sprite.elapsed_ms = float(plan.ms)
		sprite._update_frame()
		if sprite.current_frame.is_empty():
			return _fail("Requested pose has no exported frame: " + str(plan))
		plan.playback = _sprite_evidence(sprite)
		plan.playback.requested_ms = float(plan.ms)
	var art_nodes: Array[Dictionary] = []
	_collect_art(_app, art_nodes)
	if plan.has("required_art") and not _has_art(art_nodes, str(plan.required_art)):
		return _fail("Required real UI artwork is absent: " + str(plan.required_art))
	if plan.kind == "cards":
		for art_id: String in ["card_art_mirror", "card_art_lens", "card_art_hammer", "card_art_diamond", "card_art_whistle", "card_art_empty"]:
			if not _has_art(art_nodes, art_id):
				return _fail("Card artwork missing from native hand/preview: " + art_id)
	if plan.kind == "collection":
		plan.biggem_art_node_present = _has_art(art_nodes, "relic_biggem")
		plan.limitation = _report.collection_limitation
	var display: Dictionary = _display_evidence()
	if display.is_empty():
		return false
	await process_frame
	await RenderingServer.frame_post_draw
	var image: Image = root.get_texture().get_image()
	if image == null or image.is_empty():
		return _fail("GPU viewport returned no image: " + str(plan.label))
	var filename: String = _output.path_join(str(plan.label) + ".png")
	if FileAccess.file_exists(filename):
		return _fail("Refusing to replace an earlier evidence image: " + filename)
	var png_error: Error = image.save_png(filename)
	if png_error != OK:
		return _fail("save_png failed (%d): %s" % [png_error, filename])
	var png: FileAccess = FileAccess.open(filename, FileAccess.READ)
	if png == null or png.get_length() <= 0:
		return _fail("PNG was not written: " + filename)
	var png_bytes: int = png.get_length()
	png.close()
	var state: Dictionary = _app._capture_snapshot()
	var business_unchanged: bool = _app.run_state == business_before.run and _app.game_state == business_before.game
	if not business_unchanged:
		return _fail("Business state changed during presentation capture: " + str(plan.label))
	state.captureProof = {
		"plan": plan, "render_source": "actual root viewport after RenderingServer.frame_post_draw",
		"png": filename, "png_bytes": png_bytes, "save_png_result": png_error,
		"pixels": [image.get_width(), image.get_height()], "save_directory": save_directory,
		"captured_at_utc": Time.get_datetime_string_from_system(true),
		"display": display, "art_nodes": art_nodes,
		"business_state_unchanged": business_unchanged,
		"quantization": "30fps event / 15fps idle PNG playback. Requested runtime time selects an existing exported segment. Adjacent identical samples can be coalesced, so frame_index is not a source sample index or a unique-image count. Playback intervals use stored rounded durations; nominal export sample time is inferred from the cumulative start and fps.",
		"result_scroll": _scroll_evidence("ResultScroll"),
		"collection_scroll": _scroll_evidence("CollectionScroll"),
	}
	if not _write_json(filename.get_basename() + ".json", state):
		return false
	_report.captures.append({"label": plan.label, "png": filename, "state": filename.get_basename() + ".json", "pixels": state.captureProof.pixels, "plan": plan, "display": display})
	print("GEMCARD_SCREENSHOT " + filename)
	return true

func _settle_presentation() -> bool:
	await create_timer(0.35).timeout
	var deadline: int = Time.get_ticks_msec() + 12000
	while (not _app.animations.is_empty() or not _app._timers.is_empty()) and Time.get_ticks_msec() < deadline:
		await process_frame
	if not _app.animations.is_empty() or not _app._timers.is_empty():
		return _fail("Presentation did not settle before capture")
	await process_frame
	return true

func _freeze_nodes(node: Node) -> void:
	node.set_process(false)
	node.set_physics_process(false)
	for child: Node in node.get_children():
		_freeze_nodes(child)

func _sprite_evidence(sprite: Control) -> Dictionary:
	var action: Dictionary = sprite._action
	var frames: Array = action.get("frames", [])
	var frame_index: int = int(sprite.frame_index)
	var start_ms: float = 0.0
	for index: int in range(frame_index):
		start_ms += float(frames[index].get("d", 0.0))
	var duration_ms: float = float(frames[frame_index].get("d", 0.0)) if frame_index < frames.size() else 0.0
	var fps: int = LOOP_FPS if str(sprite.action_name) == "idle" or str(sprite.action_name).ends_with("~loop") else EVENT_FPS
	var nominal_sample_index: int = roundi(start_ms * float(fps) / 1000.0)
	return {
		"art": sprite.art_id, "action": sprite.action_name, "elapsed_ms": sprite.elapsed_ms,
		"frame_index": frame_index, "frame_count": frames.size(), "export_sampling_fps": fps,
		"playback_interval_ms": [start_ms, start_ms + duration_ms],
		"nominal_export_sample_ms_inferred": float(nominal_sample_index) * 1000.0 / float(fps),
		"sample_time_inference": "round(cumulative rounded segment start * fps / 1000) * 1000 / fps; stored segments may merge identical samples",
		"entry_key": sprite.entry_key, "svg_fingerprint": sprite._entry.get("hash", ""),
		"frame": sprite.current_frame, "global_position": _xy(sprite.global_position),
		"design_display_size": _xy(sprite.size), "visible": sprite.is_visible_in_tree(),
	}

func _collect_art(node: Node, result: Array[Dictionary]) -> void:
	if node is SPRITE_ART:
		result.append(_sprite_evidence(node))
	for child: Node in node.get_children():
		_collect_art(child, result)

func _has_art(nodes: Array[Dictionary], art_id: String) -> bool:
	for item: Dictionary in nodes:
		if item.art == art_id and item.visible:
			return true
	return false

func _find_art(node: Node, art_id: String) -> Control:
	if node is SPRITE_ART and node.art_id == art_id:
		return node
	for child: Node in node.get_children():
		var found: Control = _find_art(child, art_id)
		if found != null:
			return found
	return null

func _display_evidence() -> Dictionary:
	var window: Window = root
	var target: int = window.current_screen
	var origin: Vector2i = DisplayServer.screen_get_position(target)
	var screen_size: Vector2i = DisplayServer.screen_get_size(target)
	var native_output: Array = []
	var native: Variant = null
	if OS.get_name() == "macOS":
		var probe: String = OS.get_environment("GEMCARD_DISPLAY_PROBE")
		if probe.is_empty() or OS.execute(probe, [], native_output) != 0:
			_fail("Cannot refresh built-in display metadata before capture")
			return {}
		native = JSON.parse_string("".join(native_output))
		if not native is Dictionary or int(native.get("builtin_count", 0)) != 1 or int(native.get("builtin_index", -1)) != target:
			_fail("Current window is not on the freshly identified Mac built-in display")
			return {}
		if not Rect2i(origin, screen_size).encloses(Rect2i(window.position, window.size)):
			_fail("Window is not wholly inside the built-in display")
			return {}
	return {
		"os": OS.get_name(), "godot": Engine.get_version_info().string,
		"display_server": DisplayServer.get_name(),
		"rendering_method": RenderingServer.get_current_rendering_method(),
		"adapter": RenderingServer.get_video_adapter_name(),
		"adapter_vendor": RenderingServer.get_video_adapter_vendor(),
		"api_version": RenderingServer.get_video_adapter_api_version(),
		"screen_index": target, "screen_origin": _xy(origin), "screen_size": _xy(screen_size),
		"window_position": _xy(window.position), "window_size": _xy(window.size),
		"native_probe": native,
	}

func _scroll_evidence(node_name: String) -> Dictionary:
	var scroll: ScrollContainer = _app.scene.find_child(node_name, true, false)
	if scroll == null:
		return {}
	return {"vertical": scroll.scroll_vertical, "maximum": scroll.get_v_scroll_bar().max_value, "page": scroll.get_v_scroll_bar().page}

func _xy(value: Variant) -> Array:
	return [value.x, value.y]

func _write_json(filename: String, value: Dictionary) -> bool:
	var file: FileAccess = FileAccess.open(filename, FileAccess.WRITE)
	if file == null:
		return _fail("Cannot write JSON: " + filename)
	file.store_string(JSON.stringify(value, "\t", false, true) + "\n")
	var error: Error = file.get_error()
	file.close()
	return true if error == OK else _fail("JSON write failed: " + filename)

func _dispose_app() -> void:
	if not is_instance_valid(_app):
		return
	await _app.shutdown_presentation()
	_app.queue_free()
	await process_frame
	_app = null

func _fail(message: String) -> bool:
	if _failure.is_empty():
		_failure = message
	_report.complete = false
	printerr("ART_REWORK_CAPTURE_FAILED " + message)
	return false

func _watchdog() -> void:
	_fail("Capture watchdog expired; partial evidence is preserved")
	_report.failure = _failure
	if not _output.is_empty():
		_write_json(_output.path_join("report.json"), _report)
	quit(2)

func _finish() -> void:
	await _dispose_app()
	_report.failure = _failure
	if not _output.is_empty() and DirAccess.dir_exists_absolute(_output):
		_write_json(_output.path_join("report.json"), _report)
	print("ART_REWORK_CAPTURE complete=%s count=%d output=%s" % [_report.complete, _report.captures.size(), _output])
	quit(0 if _report.complete and _failure.is_empty() else 2)
