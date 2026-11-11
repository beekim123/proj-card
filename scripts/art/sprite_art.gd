class_name SpriteArt
extends Control
## Draws trimmed PNG regions inside the original art box. Slots retain affine transforms.

signal action_finished(event: String)

var art_id: String = ""
var definition: Dictionary = {}
var entries: Dictionary = {}
var entry_key: String = ""
var action_name: String = "idle"
var frame_index: int = 0
var current_frame: Dictionary = {}
var stay_event: String = ""
var static_art: bool = false
var remove_after_action: bool = false
var elapsed_ms: float = 0.0
var _clock: RefCounted
var _store: RefCounted
var _last_clock: float = 0.0
var _design_size: Vector2 = Vector2.ONE
var _entry: Dictionary = {}
var _action: Dictionary = {}
var _complete: bool = false
var _texture: Texture2D
var _texture_file: String = ""
var _slot_root: Node2D
var _slots: Dictionary = {}
var _tint_color: String = ""
var _shown_key: String = ""

func initialize(store: RefCounted, id: String, asset: Dictionary, clock: RefCounted, still: bool) -> void:
	_store = store
	_clock = clock
	art_id = id
	definition = asset["definition"]
	entries = asset["entries"]
	static_art = still
	_design_size = store.dimensions(definition)
	size = _design_size
	custom_minimum_size = Vector2.ZERO
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	tooltip_text = definition.get("desc", "")
	_last_clock = _clock.time_ms
	_slot_root = Node2D.new()
	_slot_root.name = "Slots"
	add_child(_slot_root)
	var slot_ids: Array = definition.get("slots", {}).keys()
	if definition.get("parts", []).has("icon_slot"):
		slot_ids.append("icon_slot")
	for slot_id: String in slot_ids:
		var holder: Node2D = Node2D.new()
		holder.name = slot_id
		_slot_root.add_child(holder)
		_slots[slot_id] = holder
	resized.connect(_resize_slots)
	_select_entry()
	start_action("idle")

func _enter_tree() -> void:
	# Control.resized is not emitted for size changes made before entering a tree.
	# Sprite pixels use size directly; synchronize live slots at the same boundary.
	if is_instance_valid(_slot_root): _resize_slots()

func _process(_delta: float) -> void:
	sync_clock()

func _resize_slots() -> void:
	_slot_root.scale = size / _design_size
	queue_redraw()

func sync_clock() -> void:
	var now: float = _clock.time_ms
	var delta: float = maxf(0.0, now - _last_clock)
	_last_clock = now
	if _complete or (static_art and action_name == "idle"):
		return
	elapsed_ms += delta
	var total: float = _store.action_duration(_action)
	if not _action.get("loop", false) and elapsed_ms >= total:
		_finish_action()
	else:
		_update_frame()

func set_color(value: Variant) -> void:
	_tint_color = value.to_html(false) if value is Color else str(value)
	if value is Color:
		_tint_color = "#" + _tint_color
	_select_entry()
	_action = _entry.get("actions", {}).get(action_name, _entry.get("actions", {}).get("idle", {}))
	_texture_file = ""
	_update_frame()

func _select_entry() -> void:
	entry_key = ""
	if definition.get("tint", false):
		entry_key = _store.tint_key(_tint_color)
		if not entries.has(entry_key):
			entry_key = "text" if entries.has("text") else str(entries.keys()[0])
	_entry = entries.get(entry_key, entries.get("", {}))

func start_action(event: String, finish_at_end: bool = false) -> void:
	_select_entry()
	var actions: Dictionary = _entry.get("actions", {})
	action_name = event if actions.has(event) else "idle"
	_action = actions.get(action_name, {})
	elapsed_ms = 0.0
	_complete = false
	_last_clock = _clock.time_ms
	_texture_file = ""
	_texture = null
	_shown_key = ""
	if finish_at_end:
		elapsed_ms = maxf(0.0, _store.action_duration(_action) - 0.001)
		_complete = true
	_update_frame()

func play_event(event: String) -> float:
	var duration: float = float(definition.get("events", {}).get(event, 0.0))
	if not definition.get("events", {}).has(event):
		return 0.0
	if definition.get("stay", []).has(event):
		stay_event = event
	start_action(event)
	return duration

func set_stay(event: String) -> void:
	if event != "":
		if not definition.get("stay", []).has(event):
			push_error("%s 没有持久事件 %s" % [art_id, event])
			return
		if stay_event != event:
			play_event(event)
		return
	var previous: String = stay_event
	stay_event = ""
	if previous != "" and action_name.get_slice("~", 0) == previous:
		start_action("idle")

func stop() -> void:
	stay_event = ""
	remove_after_action = false
	start_action("idle")

func set_static(value: bool) -> void:
	if static_art == value:
		return
	static_art = value
	if action_name == "idle":
		start_action("idle")

func _finish_action() -> void:
	var finished: String = action_name
	if remove_after_action:
		_complete = true
		queue_free()
		return
	if definition.get("stay", []).has(finished):
		if _entry.get("actions", {}).has(finished + "~loop"):
			start_action(finished + "~loop")
		else:
			_complete = true
			elapsed_ms = maxf(0.0, _store.action_duration(_action) - 0.001)
			_update_frame()
	elif stay_event != "":
		if _entry.get("actions", {}).has(stay_event + "~loop"):
			start_action(stay_event + "~loop")
		else:
			start_action(stay_event, true)
	else:
		start_action("idle")
	action_finished.emit(finished)

func _update_frame() -> void:
	var frames: Array = _action.get("frames", [])
	if frames.is_empty():
		current_frame = {}
		queue_redraw()
		return
	frame_index = _store.frame_at(_action, elapsed_ms)
	var key: String = "%s|%s|%d" % [entry_key, action_name, frame_index]
	if key == _shown_key:
		return
	_shown_key = key
	current_frame = frames[frame_index]
	var matrices: Dictionary = current_frame.get("m", {})
	for slot_id: String in matrices:
		if not _slots.has(slot_id):
			continue
		var matrix: Array = matrices[slot_id]
		_slots[slot_id].transform = Transform2D(Vector2(matrix[0], matrix[1]), Vector2(matrix[2], matrix[3]), Vector2(matrix[4], matrix[5]))
	queue_redraw()

func slot_holder(slot_id: String) -> Node2D:
	return _slots.get(slot_id)

func _draw() -> void:
	if current_frame.is_empty() or int(current_frame.get("s", -2)) == -2:
		return
	var sheet: int = int(current_frame["s"])
	var source: Rect2
	var target: Rect2
	var file: String
	if sheet == -1:
		file = _entry["still"]
		source = Rect2(Vector2.ZERO, _design_size * float(_entry.get("stillScale", 2.0)))
		target = Rect2(Vector2.ZERO, _design_size)
	else:
		file = _entry["sheets"][sheet]["f"]
		var export_scale: float = float(_entry.get("scale", 1.0))
		source = Rect2(float(current_frame.get("x", 0)), float(current_frame.get("y", 0)), float(current_frame.get("w", 0)), float(current_frame.get("h", 0)))
		target = Rect2(float(current_frame.get("ox", 0)) / export_scale, float(current_frame.get("oy", 0)) / export_scale, source.size.x / export_scale, source.size.y / export_scale)
	if file != _texture_file:
		_texture_file = file
		_texture = _store.image_texture(file)
	if _texture != null:
		draw_set_transform(Vector2.ZERO, 0.0, size / _design_size)
		draw_texture_rect_region(_texture, target, source)
