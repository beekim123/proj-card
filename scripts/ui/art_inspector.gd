extends Control
## Native art workbench. Only the selected atlas animates, keeping inspection memory bounded.
const Compositions = preload("res://scripts/ui/art_compositions.gd")
const Layout = preload("res://scripts/ui/layout.gd")

var store: RefCounted
var selected_id: String = ""
var preview: Control
var asset_buttons: Dictionary = {}
var previews: Array[Control] = []
var composition: Control
var filtered_count: int = 0
var cross_markers: Array[Control] = []
var slice_samples: Array[Control] = []
var _gallery_labels: Array[Label] = []
var _list: VBoxContainer
var _details: VBoxContainer
var _preview_box: Control
var _title: Label
var _status: Label
var _static: bool = false
var _color: String = ""
var _compact: bool = false
var _light: bool = false
var _changed_only: bool = false
var _batch: String = "all"
var _theme_button: Button
var _filter_button: Button
var _batch_select: OptionButton
var _filter_summary: Label
var _backgrounds: Array[ColorRect] = []
var _backdrop: ColorRect

static func matches_asset_filter(definition: Dictionary, changed_only: bool, batch: String) -> bool:
	return (not changed_only or definition.get("status","已有") != "已有") and (batch == "all" or definition.get("v2","") == batch or definition.get("batch","") == batch)

func setup(art_store: RefCounted) -> void:
	store = art_store
	_compact = size.x < 800.0
	for child: Node in get_children():
		remove_child(child)
		child.queue_free()
	asset_buttons.clear()
	_backgrounds.clear()
	_backdrop = ColorRect.new(); _backdrop.name = "Backdrop"; _backdrop.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_backdrop); _backdrop.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT); _backgrounds.append(_backdrop)
	var margin: MarginContainer = MarginContainer.new()
	add_child(margin)
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	for side: String in ["left", "top", "right", "bottom"]:
		margin.add_theme_constant_override("margin_" + side, 18)
	var root_box: VBoxContainer = VBoxContainer.new()
	margin.add_child(root_box)
	var heading: Label = Label.new()
	heading.text = "素材检查 · %d 项" % store.catalog().size()
	heading.add_theme_font_size_override("font_size", 36)
	root_box.add_child(heading)
	var toolbar: HFlowContainer = HFlowContainer.new(); toolbar.name = "Toolbar"; root_box.add_child(toolbar)
	_theme_button = _button(toolbar,"切换浅色底",func() -> void: set_light_theme(not _light)); _theme_button.name = "ThemeToggle"
	_filter_button = _button(toolbar,"只看返修 / 重画 / 新画",func() -> void: set_filters(not _changed_only,_batch)); _filter_button.name = "ChangedOnly"
	_batch_select = OptionButton.new(); _batch_select.name = "BatchFilter"
	for title: String in ["全部","第 1 批","第 2 批","本体第 1 批","本体第 2 批"]: _batch_select.add_item(title)
	_batch_select.item_selected.connect(func(index: int) -> void: set_filters(_changed_only,["all","第1批","第2批","本体第1批","本体第2批"][index])); toolbar.add_child(_batch_select)
	_filter_summary = Label.new(); _filter_summary.name = "FilterSummary"; toolbar.add_child(_filter_summary)
	var navigation: HFlowContainer = HFlowContainer.new(); navigation.name = "Compositions"; root_box.add_child(navigation)
	for item: Array in [["base-cards","基础牌拼装"],["tool-cards","额外牌拼装"],["composed-ui","界面组合"],["door-scenes","两扇门组合"]]:
		var target: String = item[0]
		_button(navigation,item[1],func() -> void: show_composition(target))
	var row: BoxContainer = VBoxContainer.new() if _compact else HBoxContainer.new()
	row.size_flags_vertical = Control.SIZE_EXPAND_FILL
	root_box.add_child(row)
	var list_scroll: ScrollContainer = ScrollContainer.new()
	list_scroll.name = "AssetList"
	list_scroll.custom_minimum_size = Vector2(0.0 if _compact else 260.0, 130.0 if _compact else 0.0)
	list_scroll.size_flags_vertical = Control.SIZE_FILL if _compact else Control.SIZE_EXPAND_FILL
	list_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	row.add_child(list_scroll)
	_list = VBoxContainer.new()
	_list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	list_scroll.add_child(_list)
	for definition: Dictionary in store.catalog():
		var id: String = definition["id"]
		var item: Button = Button.new()
		item.text = id
		item.alignment = HORIZONTAL_ALIGNMENT_LEFT
		item.custom_minimum_size.y = 48
		item.add_theme_font_size_override("font_size", 22)
		item.tooltip_text = definition.get("desc", "")
		item.toggle_mode = true
		item.pressed.connect(func() -> void: select_asset(id))
		_list.add_child(item)
		asset_buttons[id] = item
	var detail_scroll: ScrollContainer = ScrollContainer.new()
	detail_scroll.name = "AssetDetails"
	detail_scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	detail_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	detail_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	row.add_child(detail_scroll)
	_details = VBoxContainer.new()
	_details.add_theme_constant_override("separation", 12)
	_details.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	detail_scroll.add_child(_details)
	if not store.catalog().is_empty():
		select_asset(store.catalog()[0]["id"])
	set_filters(_changed_only,_batch); set_light_theme(_light)

func set_filters(changed_only: bool, batch: String = "all") -> void:
	_changed_only = changed_only; _batch = batch; filtered_count = 0
	for id: String in asset_buttons:
		var visible_asset: bool = matches_asset_filter(store.assets[id].definition,changed_only,batch)
		asset_buttons[id].visible = visible_asset
		if visible_asset: filtered_count += 1
	_filter_button.text = "显示全部状态" if changed_only else "只看返修 / 重画 / 新画"
	_batch_select.select(maxi(0,["all","第1批","第2批","本体第1批","本体第2批"].find(batch)))
	_filter_summary.text = "显示 %d / %d 项" % [filtered_count,asset_buttons.size()]

func set_light_theme(light: bool) -> void:
	_light = light
	var palette: Dictionary = store.manifest.palette
	var background: Color = Color(palette.text if light else palette.pageBg)
	var foreground: Color = Color(palette.panelBg if light else palette.text)
	var appearance: Theme = Theme.new()
	if store.font != null: appearance.default_font = store.font
	appearance.default_font_size = 22
	for type: String in ["Label","Button","CheckButton","OptionButton","LineEdit"]: appearance.set_color("font_color",type,foreground)
	for type: String in ["Button","OptionButton","LineEdit"]:
		var panel: StyleBoxFlat = StyleBoxFlat.new(); panel.bg_color = Color(palette.text if light else palette.panelBg); panel.border_color = Color(palette.accentDark); panel.set_border_width_all(1); panel.set_corner_radius_all(6)
		for state: String in ["normal","hover","pressed","focus"]: appearance.set_stylebox(state,type,panel)
	theme = appearance
	for backdrop: ColorRect in _backgrounds:
		if is_instance_valid(backdrop): backdrop.color = background
	_theme_button.text = "切换深色底" if light else "切换浅色底"

func _reset_details() -> void:
	preview = null; previews.clear(); cross_markers.clear(); slice_samples.clear(); _gallery_labels.clear(); composition = null
	_backgrounds = [_backdrop]
	for child: Node in _details.get_children(): _details.remove_child(child); child.queue_free()

func show_composition(target: String) -> void:
	if target not in ["base-cards","tool-cards","composed-ui","door-scenes"]: return
	_reset_details()
	composition = Compositions.new(); composition.name = target.to_pascal_case(); _details.add_child(composition)
	composition.setup(store,target)

func play_two_hit_instances() -> Array:
	if selected_id != "fx_hit" or not is_instance_valid(preview): return []
	var result: Array = []
	for index: int in range(2):
		var point: Vector2 = preview.position+Vector2(preview.size.x*(0.35 if index == 0 else 0.65),preview.size.y/2.0)
		var color: String = store.manifest.palette.gem.red.mid if index == 0 else store.manifest.palette.gem.blue.mid
		var effect: Control = store.effect("fx_hit",_preview_box,point.x,point.y,color)
		effect.size = preview.size; effect.position = point-effect.size/2.0; result.append(effect)
	return result

func play_asset_event(event: String) -> float:
	if not is_instance_valid(preview): return 0.0
	if selected_id.begins_with("fx_"):
		var center: Vector2 = preview.position+preview.size/2.0
		var effect: Control = store.effect(selected_id,_preview_box,center.x,center.y,_color if _color != "" else store.manifest.palette.gem.red.mid)
		effect.size = preview.size; effect.position = center-effect.size/2.0
		return float(preview.definition.get("events",{}).get(event,0))
	var duration: float = 0.0
	for item: Control in previews:
		if selected_id == "ui_rainbow_slot" and event == "out": store.set_stay(item,"")
		duration = store.play(item,event)
	return duration

func _label(value: String, font_size: int = 26) -> Label:
	var label: Label = Label.new()
	label.text = value
	label.add_theme_font_size_override("font_size", font_size)
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_details.add_child(label)
	return label

func _button(parent: Container, value: String, action: Callable) -> Button:
	var button: Button = Button.new()
	button.text = value
	button.custom_minimum_size = Vector2(120, 46)
	button.add_theme_font_size_override("font_size", 24)
	button.pressed.connect(action)
	parent.add_child(button)
	return button

func select_asset(id: String) -> void:
	if not store.assets.has(id):
		return
	selected_id = id
	_reset_details()
	for key: String in asset_buttons:
		asset_buttons[key].set_pressed_no_signal(key == id)
	var definition: Dictionary = store.assets[id]["definition"]
	_title = _label(id + " · " + str(definition.get("group", "")), 32)
	_label("%s · %s%s%s" % [definition.get("status","已有"),definition.get("load","")," · 第二版 "+str(definition.v2) if definition.has("v2") else ""," · "+str(definition.batch) if definition.has("batch") else ""],20)
	_preview_box = Control.new()
	_preview_box.custom_minimum_size = Vector2(200, maxf(220.0, minf(520.0, size.y - (360.0 if _compact else 180.0))))
	_preview_box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_details.add_child(_preview_box)
	var background: ColorRect = ColorRect.new()
	background.color = Color(str(store.manifest.get("palette", {}).get("pageBg", "#0d111c")))
	background.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_preview_box.add_child(background)
	_backgrounds.append(background)
	background.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	preview = store.create(id, {"static": _static})
	preview.custom_minimum_size = Vector2.ZERO
	_preview_box.add_child(preview)
	previews.append(preview)
	preview.set_meta("sample_static",false)
	if definition.get("monster",""):
		for kind: String in ["anchor","hitPoint"]:
			if definition.has(kind): _cross(_preview_box,preview,definition[kind],kind)
	if id == "ui_rainbow_slot":
		var keys: Array[String] = ["1", "3", "2", "6", "4", "5"]
		var names: Array[String] = ["红", "黄", "绿", "青", "蓝", "品红"]
		for index: int in range(keys.size()):
			var item: Control = preview if index == 0 else store.create(id, {"static": _static})
			if index > 0:
				item.custom_minimum_size = Vector2.ZERO
				_preview_box.add_child(item)
				previews.append(item)
			store.set_color(item, store.manifest["palette"]["mix"][keys[index]])
			store.set_stay(item, "light")
			var color_label: Label = Label.new()
			color_label.text = names[index]
			color_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
			color_label.add_theme_font_size_override("font_size", 26)
			_preview_box.add_child(color_label)
			_gallery_labels.append(color_label)
	if _color != "" and definition.get("tint", false) and id != "ui_rainbow_slot":
		store.set_color(preview, _color)
	_preview_box.resized.connect(_fit_preview)
	_fit_preview()
	_status = _label("待机 · 画框 %s" % definition.get("viewBox", ""), 22)
	if id == "npc_knocker": _button(_details,"老门环：挑一件，试试你的运气。",func() -> void: store.play(preview,"talk"))
	var events: HFlowContainer = HFlowContainer.new()
	events.name = "Events"
	_details.add_child(events)
	_button(events, "停止 / 待机", func() -> void:
		for item: Control in previews: store.stop(item)
		_status.text = "待机")
	for event: String in definition.get("events", {}):
		_button(events, "%s (%sms)" % [event, definition["events"][event]], func() -> void:
			var duration: float = play_asset_event(event)
			_status.text = "%s · %sms" % [event, duration])
	if id == "fx_hit": _button(events,"同时播放两个实例",play_two_hit_instances)
	var stay_row: HBoxContainer = HBoxContainer.new()
	_details.add_child(stay_row)
	var stay_label: Label = Label.new()
	stay_label.text = "停住状态"
	stay_row.add_child(stay_label)
	var stay: OptionButton = OptionButton.new()
	stay.name = "Stay"
	stay.add_item("清除 / 待机")
	for event: String in definition.get("stay", []):
		stay.add_item(event)
	stay.item_selected.connect(func(index: int) -> void:
		for item: Control in previews: store.set_stay(item, "" if index == 0 else stay.get_item_text(index)))
	stay_row.add_child(stay)
	var static_toggle: CheckButton = CheckButton.new()
	static_toggle.name = "Static"
	static_toggle.text = "静止版（事件照常播放）"
	static_toggle.button_pressed = _static
	static_toggle.toggled.connect(func(on: bool) -> void:
		_static = on
		for item: Control in previews: store.set_static(item, on or item.get_meta("sample_static",false)))
	_details.add_child(static_toggle)
	for slot_id: String in definition.get("slots", {}):
		var slot_row: HBoxContainer = HBoxContainer.new()
		slot_row.name = "Slot_" + slot_id
		_details.add_child(slot_row)
		var caption: Label = Label.new()
		caption.text = slot_id
		slot_row.add_child(caption)
		var input: LineEdit = LineEdit.new()
		input.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		input.text = "3" if slot_id == "countdown_slot" else "咬手"
		input.text_changed.connect(func(value: String) -> void:
			for item: Control in previews: store.set_slot_text(item,slot_id,value))
		slot_row.add_child(input)
		store.set_slot_text(preview, slot_id, input.text)
	if definition.get("parts", []).has("icon_slot"):
		var icons: OptionButton = OptionButton.new()
		icons.name = "IconSlot"
		var icon_ids: Array[String] = []
		for candidate: Dictionary in store.catalog():
			if candidate.get("load", "") == "img":
				icon_ids.append(candidate["id"])
				icons.add_item(candidate["id"])
		icons.item_selected.connect(func(index: int) -> void:
			for item: Control in previews: store.set_slot_icon(item,"icon_slot",icon_ids[index]))
		_details.add_child(icons)
		var initial: int = icon_ids.find("rule_bite")
		if initial < 0:
			initial = 0
		icons.select(initial)
		store.set_slot_icon(preview, "icon_slot", icon_ids[initial])
	if definition.get("tint", false):
		_label("染色", 24)
		var colors: HFlowContainer = HFlowContainer.new()
		colors.name = "Tints"
		_details.add_child(colors)
		var palette: Dictionary = store.manifest["palette"]
		for key: String in ["1", "3", "2", "6", "4", "5", "7", "text", "textDim"]:
			var color: String = str(palette[key] if key in ["text", "textDim"] else palette["mix"][key])
			var button: Button = _button(colors, key, func() -> void:
				_color = color
				for item: Control in previews: store.set_color(item,color))
			button.add_theme_color_override("font_color", Color(color))

	_label(str(definition.get("desc", "")), 22)
	if definition.get("slots",{}).has("countdown_slot"):
		var countdowns: HFlowContainer = HFlowContainer.new(); countdowns.name = "CountdownValues"; _details.add_child(countdowns)
		for number: int in [1,2,3]:
			_button(countdowns,str(number),func() -> void:
				for item: Control in previews:
					for slot_id: String in definition.slots: store.set_slot_text(item,slot_id,number)
					if definition.get("events",{}).has("tick"): store.play(item,"tick"))
	if definition.get("idle",false): _variant("静止 · 1 倍",1.0,true)
	if definition.get("monster",""):
		for item: Array in [["竖屏小怪 / 精英",Layout.base("portrait").monsterScale.normal],["横屏小怪 / 精英",Layout.base("landscape").monsterScale.normal],["竖屏首领",Layout.base("portrait").monsterScale.boss],["横屏首领",Layout.base("landscape").monsterScale.boss]]: _variant("%s · %s 倍" % item,item[1],false)
	if definition.has("nineSlice"):
		_label("九宫格切线：%s；下方三种尺寸按实际像素显示。" % str(definition.nineSlice),22)
		for sample: Array in _slice_sizes(id):
			_label("%s × %s · 边宽 %s" % sample,22)
			var canvas: Control = _actual_canvas(Vector2(sample[0],sample[1]))
			var slice: Control = store.nine_slice(id,sample[2]); slice.size = Vector2(sample[0],sample[1]); slice.set_meta("sample_size",slice.size); canvas.add_child(slice); slice_samples.append(slice)
	set_light_theme(_light)

func _actual_canvas(extent: Vector2) -> Control:
	var scroll: ScrollContainer = ScrollContainer.new(); scroll.custom_minimum_size = Vector2(1,extent.y+20); scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED; _details.add_child(scroll)
	var canvas: Control = Control.new(); canvas.custom_minimum_size = extent; canvas.size = extent; scroll.add_child(canvas)
	var backdrop: ColorRect = ColorRect.new(); backdrop.mouse_filter = Control.MOUSE_FILTER_IGNORE; canvas.add_child(backdrop); backdrop.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT); _backgrounds.append(backdrop)
	return canvas

func _variant(title: String, factor: float, still: bool) -> void:
	_label(title,22)
	var definition: Dictionary = store.assets[selected_id].definition
	var extent: Vector2 = store.dimensions(definition)*factor
	var canvas: Control = _actual_canvas(extent)
	var item: Control = store.create(selected_id,{"static":still or _static}); item.size = extent; item.set_meta("sample_static",still); canvas.add_child(item); previews.append(item)
	if definition.get("tint",false): store.set_color(item,_color if _color != "" else store.manifest.palette.gem.red.mid)
	for slot_id: String in definition.get("slots",{}): store.set_slot_text(item,slot_id,"3" if slot_id == "countdown_slot" else "咬手")
	if definition.get("parts",[]).has("icon_slot"): store.set_slot_icon(item,"icon_slot","rule_bite")
	if definition.get("monster",""):
		for kind: String in ["anchor","hitPoint"]:
			if definition.has(kind): _cross(canvas,item,definition[kind],kind)

func _cross(parent: Control, artwork: Control, point: Array, kind: String) -> void:
	var marker: Control = Control.new(); marker.mouse_filter = Control.MOUSE_FILTER_IGNORE
	marker.set_meta("artwork",artwork); marker.set_meta("point",Vector2(point[0],point[1])); marker.set_meta("kind",kind)
	marker.tooltip_text = "%s (%s, %s)" % [kind,point[0],point[1]]
	var color: Color = Color(store.manifest.palette.hpFill if kind == "hitPoint" else store.manifest.palette.accent)
	for vertical: bool in [true,false]:
		var bar: ColorRect = ColorRect.new(); bar.mouse_filter = Control.MOUSE_FILTER_IGNORE; bar.color = color; bar.position = Vector2(7,0) if vertical else Vector2(0,7); bar.size = Vector2(2,16) if vertical else Vector2(16,2); marker.add_child(bar)
	var caption: Label = Label.new(); caption.text = kind; caption.position = Vector2(20,0); caption.add_theme_font_size_override("font_size",14); marker.add_child(caption)
	parent.add_child(marker); cross_markers.append(marker); _position_cross(marker)

func _position_cross(marker: Control) -> void:
	var artwork: Control = marker.get_meta("artwork")
	marker.position = artwork.position+marker.get_meta("point")*(artwork.size/store.dimensions(artwork.definition))-Vector2(8,8)

func _slice_sizes(id: String) -> Array:
	match id:
		"table_cloth": return [[1032,330,72],[1248,330,72],[300,300,72]]
		"ui_panel": return [[1008,100,24],[600,320,48],[300,300,48]]
		"ui_hp_frame": return [[440,40,Layout.base("portrait").hpBorder],[400,40,Layout.base("landscape").hpBorder],[620,48,Layout.base("portrait").hpBorder]]
	return [[300,100,32],[520,120,32],[192,96,32]]

func _fit_preview() -> void:
	if not is_instance_valid(preview) or not is_instance_valid(_preview_box):
		return
	if selected_id == "ui_rainbow_slot" and previews.size() == 6:
		var cell: Vector2 = _preview_box.size / Vector2(3, 2)
		var extent: float = maxf(1.0, minf(140.0, minf(cell.x - 24.0, cell.y - 64.0)))
		for index: int in range(previews.size()):
			var col: int = index % 3
			var row: int = index / 3
			var center: Vector2 = Vector2((float(col) + 0.5) * cell.x, (float(row) + 0.5) * cell.y - 18.0)
			previews[index].size = Vector2.ONE * extent
			previews[index].position = center - Vector2.ONE * extent / 2.0
			_gallery_labels[index].position = center + Vector2(-cell.x / 2.0, extent / 2.0 + 8.0)
			_gallery_labels[index].size = Vector2(cell.x, 40)
		return
	var original: Vector2 = store.dimensions(preview.definition)
	var available: Vector2 = Vector2(maxf(1.0, _preview_box.size.x - 24.0), maxf(1.0, _preview_box.size.y - 24.0))
	var factor: float = minf(1.0,minf(available.x / original.x, available.y / original.y))
	preview.size = original * factor
	preview.position = (_preview_box.size - preview.size) / 2.0
	for marker: Control in cross_markers:
		if marker.get_meta("artwork") == preview: _position_cross(marker)
