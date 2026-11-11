class_name CardView
extends Control
## Manifest-sized native card composition, matching h5/src/ui/card.ts.
const Core: GDScript = preload("res://rules/index.gd")
const Config: GDScript = preload("res://rules/config.gd")
const COLORS: Array = ["red", "green", "blue"]
const NAMES: Array = ["红", "绿", "蓝"]
const BITS: Array = [1, 2, 4]
var card_data: Dictionary = {}
var static_art: bool = false
var _store: RefCounted
var _artwork: Control
var _layers: Array[Control] = []
var _font: Font
var _bold_font: Font

func _put(parent: Control, id: String, x: float, y: float, width: float, height: float) -> Control:
	var element: Control = _store.create(id)
	if element == null: return null
	element.position = Vector2(x, y)
	element.size = Vector2(width, height)
	element.custom_minimum_size = Vector2.ZERO
	element.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_store.set_static(element, static_art)
	parent.add_child(element)
	_layers.append(element)
	return element

func _glow(parent: Control, color: String, settings: Dictionary) -> void:
	var gradient: Gradient = Gradient.new()
	var center_color: Color = Color(color)
	var clear_color: Color = Color(center_color, 0.0)
	gradient.offsets = PackedFloat32Array([0.0, 0.7])
	gradient.colors = PackedColorArray([center_color, clear_color])
	var texture: GradientTexture2D = GradientTexture2D.new()
	texture.gradient = gradient
	texture.width = int(settings.r * 2)
	texture.height = int(settings.r * 2)
	texture.fill = GradientTexture2D.FILL_RADIAL
	texture.fill_from = Vector2(0.5, 0.5)
	texture.fill_to = Vector2(1.0, 0.5)
	var glow: TextureRect = TextureRect.new()
	glow.texture = texture
	glow.mouse_filter = Control.MOUSE_FILTER_IGNORE
	glow.position = Vector2(settings.cx - settings.r, settings.cy - settings.r)
	glow.size = Vector2(settings.r * 2, settings.r * 2)
	glow.modulate.a = settings.opacity
	parent.add_child(glow)

func _measure(value: String, font_size: int) -> float:
	return _font.get_string_size(value, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size).x

func _text(value: String, settings: Dictionary, palette: Dictionary, font_size: int = -1) -> Label:
	var label: Label = Label.new()
	var resolved_size: int = int(settings.size) if font_size < 0 else font_size
	label.text = value
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	label.add_theme_font_override("font", _bold_font if int(settings.get("weight",400 if settings.has("maxWidth") else 700)) >= 700 else _font)
	label.add_theme_font_size_override("font_size", resolved_size)
	label.add_theme_color_override("font_color", Color(str(palette[settings.color])))
	label.vertical_alignment = VERTICAL_ALIGNMENT_TOP
	label.size = Vector2(164, resolved_size * 1.5)
	label.position = Vector2(settings.x, settings.y - resolved_size)
	if settings.get("align", "left") == "right":
		label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
		label.position.x = settings.x - label.size.x
	add_child(label)
	return label

func _badge(type: String, palette: Dictionary) -> void:
	var labels: Dictionary = {"bag": "+%s 张" % Config.TOOLS.bag.draw, "lens": "倍率×%s" % Config.TOOLS.lens.multiplier,
		"hammer": "伤害×%s" % Config.TOOLS.hammer.turnMultiplier, "mirror": "变色", "stone": "成长+%s" % Config.TOOLS.stone.xp,
		"hourglass": "倒计时+1", "seal": "封", "shadow": "照抄", "whistle": "+额外牌"}
	var text: String = labels.get(type, "")
	var units: float = 0
	for index: int in range(text.length()): units += 0.62 if text.unicode_at(index) <= 127 else 1.0
	var width: float = 18.0 * units + 18.0
	var panel: Panel = Panel.new()
	panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	panel.position = Vector2(184.0 - width, 18)
	panel.size = Vector2(width, 30)
	var style: StyleBoxFlat = StyleBoxFlat.new()
	var background: Color = Color(str(palette.ink))
	background.a = 0.82
	style.bg_color = background
	style.border_color = Color(str(palette.accent))
	style.set_border_width_all(2)
	style.set_corner_radius_all(8)
	panel.add_theme_stylebox_override("panel", style)
	add_child(panel)
	var label: Label = Label.new()
	label.text = text
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	label.add_theme_font_override("font", _font)
	label.add_theme_font_size_override("font_size", 18)
	label.add_theme_color_override("font_color", Color(str(palette.accent)))
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.position = Vector2(0, 3)
	label.size = Vector2(width, 27)
	panel.add_child(label)

func setup(store: RefCounted, card: Dictionary, state: Dictionary, still: bool = false) -> void:
	for child: Node in get_children():
		remove_child(child); child.queue_free()
	_layers.clear()
	_artwork = null
	_store = store
	_font = store.font if store.get("font") != null else ThemeDB.fallback_font
	_bold_font = store.bold_font if store.get("bold_font") != null else _font
	card_data = card.duplicate(true)
	static_art = still
	var game: Dictionary = state.game if state.has("game") else state
	var layout: Dictionary = store.manifest.cardLayout
	var palette: Dictionary = store.manifest.palette
	var mask: int = int(card.v)
	var type: String = card.get("type", "")
	var tool: Dictionary = Config.TOOLS.get(type, {})
	var resolved: bool = card.has("k")
	var unknown_mirror: bool = type == "mirror" and not resolved
	size = Vector2(layout.size[0], layout.size[1])
	custom_minimum_size = size
	pivot_offset = Vector2(size.x / 2.0, size.y)
	mouse_filter = Control.MOUSE_FILTER_PASS
	set_meta("card_id", card.get("id", -1))
	set_meta("mask", mask)
	var art: Control = Control.new()
	art.name = "Artwork"
	art.position = Vector2(layout.artWindow.x, layout.artWindow.y)
	art.size = Vector2(layout.artWindow.w, layout.artWindow.h)
	art.clip_contents = true
	art.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(art)
	_put(art, "card_art_bg_tool" if not tool.is_empty() else "card_art_bg", 0, 0, layout.artWindow.w, layout.artWindow.h)
	var color: Variant = palette.mix.get(str(mask))
	if color is String: _glow(art, color, layout.glow)
	var active: Array = []
	for index: int in range(BITS.size()):
		if (mask & int(BITS[index])) != 0: active.append(index)
	if not type.is_empty():
		_artwork = _put(art, "card_art_" + type, 0, 0, layout.artWindow.w, layout.artWindow.h)
		if type == "mirror" and _artwork != null:
			_store.set_color(_artwork, palette.text if unknown_mirror else (color if color != null else palette.textDim))
	if type.is_empty() or type == "shadow":
		if active.is_empty(): _put(art, "card_art_empty", 0, 0, layout.artWindow.w, layout.artWindow.h)
		for position_index: int in range(active.size()):
			var index: int = active[position_index]
			var position_data: Array = layout.gems["3"][COLORS[index]] if active.size() == 3 else (layout.gems["2"][position_index] if active.size() == 2 else layout.gems["1"][0])
			var extent: float = position_data[2]
			var form: int = Core.gem_form(game, index)
			_put(art, "gem_%s_%s" % [COLORS[index], Config.FORM_KEYS[form]], position_data[0] - extent / 2.0, position_data[1] - extent / 2.0, extent, extent)
	_put(self, "card_frame_tool" if not tool.is_empty() else "card_frame", 0, 0, layout.size[0], layout.size[1])
	_put(self, "card_gem_bar", layout.gemBar.x, layout.gemBar.y, layout.gemBar.w, layout.gemBar.h)
	for index: int in active:
		var color_name: String = COLORS[index]
		var socket: Array = layout.gemBar.sockets[color_name]
		var icon_size: float = layout.gemBar.iconSize
		_put(self, "gem_icon_" + color_name, socket[0] - icon_size / 2.0, socket[1] - icon_size / 2.0, icon_size, icon_size)
		var corner: Array = layout.corner[color_name]
		var corner_size: float = layout.corner.iconSize
		_put(self, "gem_icon_" + color_name, corner[0] - corner_size / 2.0, corner[1] - corner_size / 2.0, corner_size, corner_size)
	var values: Array = []
	var pieces: PackedStringArray = PackedStringArray()
	for index: int in active:
		var value: float = Core.gem_value(game, index)
		values.append(value)
		pieces.append("%s %s" % [NAMES[index], _number(value)])
	var line: String = str(tool.text) if not tool.is_empty() else (" + ".join(pieces) if not active.is_empty() else "没有宝石")
	var line_size: int = int(layout.text.line.size)
	if tool.is_empty() and _measure(line, line_size) > layout.text.line.maxWidth:
		pieces.clear()
		for index: int in range(active.size()): pieces.append("%s%s" % [NAMES[active[index]], _number(values[index])])
		if not active.is_empty(): line = "+".join(pieces)
	while line_size > layout.text.line.minSize and _measure(line, line_size) > layout.text.line.maxWidth: line_size -= 1
	var title: String = str(tool.name) if not tool.is_empty() else str(Config.CARD_NAMES[mask])
	var value_text: String = "?" if unknown_mirror else _number(Core.base_value(game, mask))
	_text(title, layout.text.name, palette)
	_text(value_text, layout.text.value, palette)
	_text(line, layout.text.line, palette, line_size)
	if not type.is_empty(): _badge(type, palette)
	tooltip_text = "%s，底数 %s，%s" % [title, value_text, line]

func _number(value: float) -> String:
	return str(int(value)) if value == floor(value) else str(value)

func set_card_paused(paused: bool) -> void:
	static_art = paused
	for element: Control in _layers:
		if is_instance_valid(element): _store.set_static(element, paused)

func play_card_art() -> float:
	return _store.play(_artwork, "play") if is_instance_valid(_artwork) else 0.0
