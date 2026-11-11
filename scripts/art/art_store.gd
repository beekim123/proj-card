class_name ArtStore
extends RefCounted
## Manifest-backed PNG art. SVG remains the authoritative source, never rendered in game.

const SpriteArtScript: Script = preload("res://scripts/art/sprite_art.gd")
const NineSliceScript: Script = preload("res://scripts/art/nine_slice_art.gd")
const ClockScript: Script = preload("res://scripts/art/feel_clock.gd")

var manifest: Dictionary = {}
var assets: Dictionary = {}
var clock: RefCounted
var font: Font
var bold_font: Font
var stale: Array[String] = []
var _tints: Dictionary = {}
var _disposed: bool = false
var _texture_cache: Dictionary = {}
var _texture_lru: Array[String] = []
var _texture_bytes: int = 0
const TEXTURE_CACHE_MAX: int = 8
const TEXTURE_CACHE_BYTES: int = 128 * 1024 * 1024

func _init(shared_clock: RefCounted = null) -> void:
	clock = shared_clock if shared_clock != null else ClockScript.new()
	manifest = _read_json("res://art/art-manifest.json")
	var data: Dictionary = _read_json("res://art/sprites/sprites.json")
	var palette: Dictionary = manifest.get("palette", {})
	for key: String in palette.get("mix", {}):
		var color: Variant = palette["mix"][key]
		if color is String and color.begins_with("#"):
			_tints[color.to_lower()] = key
	_tints[str(palette.get("text", "#e6dec8")).to_lower()] = "text"
	_tints[str(palette.get("textDim", "#9a8968")).to_lower()] = "textDim"
	for definition: Dictionary in manifest.get("assets", []):
		var id: String = definition["id"]
		assets[id] = {"definition": definition, "entries": {}}
	for name_key: String in data.get("assets", {}):
		var id: String = name_key.get_slice("@", 0)
		if assets.has(id):
			assets[id]["entries"][name_key.get_slice("@", 1) if name_key.contains("@") else ""] = data["assets"][name_key]
	for id: String in assets:
		var entries: Dictionary = assets[id]["entries"]
		if entries.is_empty():
			push_error("缺少精灵图：" + id)
			continue
		if not entries.has(""):
			entries[""] = entries.get("text", entries.values()[0])
		var svg_path: String = "res://art/svg/%s.svg" % id
		if not FileAccess.file_exists(svg_path):
			svg_path = "res://art/placeholders/svg/%s.svg" % id
		if FileAccess.file_exists(svg_path):
			var hash: String = FileAccess.get_file_as_string(svg_path).sha256_text().substr(0, 16)
			if entries[""].get("hash", "") != hash:
				stale.append(id)
	if not stale.is_empty():
		push_warning("精灵图过期，运行 npm run export:sprites：" + " ".join(stale))
	font = _load_font("res://fonts/NotoSansCJKsc-Regular.otf")
	bold_font = _load_font("res://fonts/NotoSansCJKsc-Bold.otf")
	if bold_font == null: bold_font = font
	# Explicit native-only aliases, separate from delivered art and fingerprints.
	var placeholders: Dictionary = _read_json("res://data/body-batch-2-placeholders.json")
	placeholders.merge(_read_json("res://data/body-batch-3-placeholders.json"))
	for id: String in placeholders:
		var source: String = placeholders[id][0]
		if not assets.has(source): push_error("占位来源缺失："+source); continue
		assets[id] = assets[source].duplicate(true)
		assets[id].definition.id = id
		assets[id].definition.nativePlaceholder = true
		assets[id].definition.placeholderLabel = placeholders[id][1]
		assets[id].definition.desc = "原生占位："+str(placeholders[id][1])


static func _load_font(font_path: String) -> Font:
	if FileAccess.file_exists(font_path) or (OS.has_feature("template") and ResourceLoader.exists(font_path)):
		if (OS.has_feature("template") and ResourceLoader.exists(font_path)) or _has_imported_file(font_path):
			return load(font_path) as Font
		else:
			var font_file: FontFile = FontFile.new()
			font_file.data = FileAccess.get_file_as_bytes(font_path)
			return font_file
	return null

static func _read_json(path: String) -> Dictionary:
	var value: Variant = JSON.parse_string(FileAccess.get_file_as_string(path))
	return value if value is Dictionary else {}

static func dimensions(definition: Dictionary) -> Vector2:
	var box: PackedStringArray = str(definition.get("viewBox", "0 0 1 1")).replace(",", " ").split(" ", false)
	return Vector2(float(box[2]), float(box[3]))

static func action_duration(action: Dictionary) -> float:
	var total: float = 0.0
	for frame: Dictionary in action.get("frames", []):
		total += float(frame.get("d", 0.0))
	return total

static func frame_at(action: Dictionary, time_ms: float) -> int:
	var frames: Array = action.get("frames", [])
	var total: float = action_duration(action)
	if total <= 0.0 or frames.size() < 2:
		return 0
	var remaining: float = fposmod(time_ms, total) if action.get("loop", false) else clampf(time_ms, 0.0, total - 0.001)
	for index: int in range(frames.size()):
		remaining -= float(frames[index].get("d", 0.0))
		if remaining < 0.0:
			return index
	return frames.size() - 1

static func normalize_color(color: String) -> String:
	var value: String = color.strip_edges().to_lower()
	if value.begins_with("rgb(") or value.begins_with("rgba("):
		var values: PackedStringArray = value.get_slice("(", 1).split(",")
		if values.size() >= 3:
			return "#%02x%02x%02x" % [int(values[0]), int(values[1]), int(values[2])]
	return value

func tint_key(color: String) -> String:
	return _tints.get(normalize_color(color), "text")

func get_asset(id: String) -> Dictionary:
	return assets.get(id, {})

func create(id: String, options: Variant = {}) -> Control:
	if _disposed or not assets.has(id):
		push_error("未知素材：" + id)
		return null
	var still: bool = bool(options.get("static", false)) if options is Dictionary else bool(options)
	var element: Control = SpriteArtScript.new()
	element.initialize(self, id, assets[id], clock, still)
	if assets[id].definition.get("nativePlaceholder",false) and not id.begins_with("bg_"):
		var label: Label = Label.new(); label.name = "NativePlaceholderLabel"
		label.text = assets[id].definition.placeholderLabel; label.mouse_filter = Control.MOUSE_FILTER_IGNORE
		label.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		label.add_theme_font_override("font",font); label.add_theme_font_size_override("font_size",24)
		label.add_theme_color_override("font_color",Color.WHITE)
		label.add_theme_color_override("font_outline_color",Color.BLACK); label.add_theme_constant_override("outline_size",5)
		element.add_child(label)
	return element

func create_image(id: String, options: Variant = {}) -> Control:
	return create(id, options)

func create_inline(id: String) -> Control:
	return create(id)

func is_sprite(element: Node) -> bool:
	return element is SpriteArtScript

func play(element: Control, event: String) -> float:
	return element.play_event(event) if not _disposed and is_instance_valid(element) else 0.0

func set_stay(element: Control, event: Variant) -> void:
	if not _disposed and is_instance_valid(element):
		element.set_stay("" if event == null else str(event))

func get_stay(element: Control) -> String:
	return str(element.stay_event) if is_instance_valid(element) else ""

func stop(element: Control) -> void:
	if is_instance_valid(element):
		element.stop()

func set_static(element: Control, still: bool) -> void:
	if is_instance_valid(element):
		element.set_static(still)

func set_color(element: Control, color: Variant) -> void:
	if is_instance_valid(element):
		element.set_color(color)

func set_slot_text(element: Control, slot_id: String, value: Variant) -> Label:
	var positions: Dictionary = element.definition.get("slots", {})
	var holder: Node2D = element.slot_holder(slot_id)
	if not positions.has(slot_id) or holder == null:
		push_error("%s 没有文字槽 %s" % [element.art_id, slot_id])
		return null
	var text: Label = holder.get_node_or_null("Value") as Label
	if text == null:
		text = Label.new()
		text.name = "Value"
		text.mouse_filter = Control.MOUSE_FILTER_IGNORE
		text.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		text.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		holder.add_child(text)
		if font != null:
			text.add_theme_font_override("font", font)
	var position: Array = positions[slot_id]
	var font_size: int = int(position[2])
	if element.art_id == "ui_rule_sign" and slot_id == "rule_text" and str(value).length() >= 4:
		font_size = mini(24, font_size)
	text.text = str(value)
	text.add_theme_font_size_override("font_size", font_size)
	text.add_theme_color_override("font_color", Color(str(manifest.get("palette", {}).get("ink", "#1c1412"))))
	# A fixed large box preserves SVG text-anchor=middle / dominant-baseline=central.
	text.size = Vector2(600.0, float(font_size) * 2.0)
	text.position = Vector2(float(position[0]) - 300.0, float(position[1]) - float(font_size))
	return text

func set_slot_icon(element: Control, slot_id: String, asset_id: String, box: Variant = Rect2(20, 16, 56, 56)) -> TextureRect:
	var holder: Node2D = element.slot_holder(slot_id)
	if holder == null or not assets.has(asset_id):
		push_error("素材图标槽不存在：" + slot_id)
		return null
	var icon: TextureRect = holder.get_node_or_null("Icon") as TextureRect
	if icon == null:
		icon = TextureRect.new()
		icon.name = "Icon"
		icon.mouse_filter = Control.MOUSE_FILTER_IGNORE
		icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		holder.add_child(icon)
	var rect: Rect2 = box if box is Rect2 else Rect2(float(box[0]), float(box[1]), float(box[2]), float(box[3]))
	icon.position = rect.position
	icon.size = rect.size
	icon.texture = image_texture(assets[asset_id]["entries"][""]["still"])
	return icon

func image_path(id: String) -> String:
	return "res://art/sprites/" + str(assets[id]["entries"][""]["still"])

static func _has_imported_file(path: String) -> bool:
	var config: ConfigFile = ConfigFile.new()
	if config.load(path + ".import") != OK:
		return false
	for key: String in config.get_section_keys("remap"):
		if key.begins_with("path") and FileAccess.file_exists(str(config.get_value("remap", key, ""))):
			return true
	return false

func image_texture(file: String) -> Texture2D:
	var path: String = file if file.begins_with("res://") else "res://art/sprites/" + file
	if _texture_cache.has(path):
		_texture_lru.erase(path)
		_texture_lru.append(path)
		return _texture_cache[path]
	var texture: Texture2D
	if (OS.has_feature("template") and ResourceLoader.exists(path)) or _has_imported_file(path):
		texture = load(path) as Texture2D
	else:
		var image: Image = Image.new()
		var error: Error = image.load_png_from_buffer(FileAccess.get_file_as_bytes(path))
		if error == OK and not image.is_empty():
			texture = ImageTexture.create_from_image(image)
	if texture != null:
		var bytes: int = texture.get_width() * texture.get_height() * 4
		while not _texture_lru.is_empty() and (_texture_lru.size() >= TEXTURE_CACHE_MAX or _texture_bytes + bytes > TEXTURE_CACHE_BYTES):
			var oldest: String = _texture_lru.pop_front()
			var previous: Texture2D = _texture_cache[oldest]
			_texture_bytes -= previous.get_width() * previous.get_height() * 4
			_texture_cache.erase(oldest)
		_texture_cache[path] = texture
		_texture_lru.append(path)
		_texture_bytes += bytes
	return texture

func effect(id: String, parent: Control, x: float, y: float, color: Variant = "") -> Control:
	if not id.begins_with("fx_"):
		push_error("effect只接受fx_*素材")
		return null
	var element: Control = create(id)
	element.position = Vector2(x, y) - element.size / 2.0
	if str(color) != "":
		element.set_color(color)
	parent.add_child(element)
	element.remove_after_action = true
	element.start_action("play")
	return element

func nine_slice(id: String, width: float = 24.0) -> Control:
	if not assets.has(id) or not assets[id]["definition"].has("nineSlice"):
		push_error("没有九宫格约定：" + id)
		return null
	var element: Control = NineSliceScript.new()
	var entry: Dictionary = assets[id]["entries"][""]
	element.initialize(self, entry["still"], assets[id]["definition"]["nineSlice"], float(entry.get("stillScale", 2.0)), width)
	return element

func anchor(element: Control, id: String, x: float, y: float) -> void:
	var point: Array = assets[id]["definition"].get("anchor", [0, 0])
	element.position = Vector2(x - float(point[0]), y - float(point[1]))

func dispose() -> void:
	_disposed = true
	assets.clear()
	_texture_cache.clear()
	_texture_lru.clear()
	_texture_bytes = 0

func catalog() -> Array:
	var entries: Array = manifest.get("assets",[]).duplicate(true)
	for id: String in assets:
		if assets[id].definition.get("nativePlaceholder",false): entries.append(assets[id].definition.duplicate(true))
	return entries
