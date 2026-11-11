class_name NineSliceArt
extends Control
## Native canvas nine-slice with independent source cuts and destination border width.

var _store: RefCounted
var _file: String = ""
var _source_cuts: Array = []
var _border_width: float = 24.0
var _texture: Texture2D

func initialize(store: RefCounted, file: String, cuts: Array, still_scale: float, width: float) -> void:
	_store = store
	_file = file
	for cut: float in cuts:
		_source_cuts.append(cut * still_scale)
	set_border_width(width)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	resized.connect(queue_redraw)

func set_border_width(width: float) -> void:
	_border_width = maxf(0.0, width)
	custom_minimum_size = Vector2.ONE * _border_width * 2.0
	queue_redraw()

func _draw() -> void:
	if _texture == null:
		_texture = _store.image_texture(_file)
	if _texture == null:
		return
	var w: float = _texture.get_width()
	var h: float = _texture.get_height()
	var sx: Array[float] = [0.0, float(_source_cuts[3]), w - float(_source_cuts[1]), w]
	var sy: Array[float] = [0.0, float(_source_cuts[0]), h - float(_source_cuts[2]), h]
	var border_x: float = minf(_border_width, size.x / 2.0)
	var border_y: float = minf(_border_width, size.y / 2.0)
	var dx: Array[float] = [0.0, border_x, size.x - border_x, size.x]
	var dy: Array[float] = [0.0, border_y, size.y - border_y, size.y]
	for y: int in range(3):
		for x: int in range(3):
			draw_texture_rect_region(_texture, Rect2(dx[x], dy[y], dx[x + 1] - dx[x], dy[y + 1] - dy[y]), Rect2(sx[x], sy[y], sx[x + 1] - sx[x], sy[y + 1] - sy[y]))
