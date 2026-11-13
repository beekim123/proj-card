extends VBoxContainer
## The four composed examples from h5/src/art/inspector.ts, built lazily.
const Card = preload("res://scripts/ui/card_view.gd")
const Layout = preload("res://scripts/ui/layout.gd")
const Config = preload("res://rules/config.gd")
const MASKS: Array = [1,2,4,3,6,5,7,0]
const SCALES: Array = [0.75,1.4,2.0]
const FORMS: Array = [[0,0,0],[15,15,15],[45,45,45],[15,0,45]]
var store: RefCounted
var section: String = ""
var base_form: int = 0
var mirror_mask: int = 6
var base_cards: Array[Control] = []
var tool_pairs: Dictionary = {}
var ui_parts: Dictionary = {}
var door_scenes: Dictionary = {}
var issues: Array[String] = []
var _content: VBoxContainer

func setup(art_store: RefCounted, target: String) -> void:
	store = art_store; section = target
	add_theme_constant_override("separation",16)
	match section:
		"base-cards":
			_label(self,"八种牌 · 完整拼装",32)
			var selector: OptionButton = OptionButton.new(); selector.name = "BaseForm"
			for title: String in ["全部原石","全部切好","全部闪光","红切好 / 绿原石 / 蓝闪光"]: selector.add_item(title)
			selector.item_selected.connect(set_base_form); add_child(selector)
			_label(self,"每种形态同时显示 0.75 / 1.4 / 2 倍。同一颗宝石同步变化。",22)
			_content = VBoxContainer.new(); add_child(_content); set_base_form(0)
		"tool-cards":
			_label(self,"9 种额外牌 · 手牌与桌面",32)
			_label(self,"左边手牌保持待机，右边桌面暂停；播放后重新暂停。镜子手中显示 ?。",22)
			var selector: OptionButton = OptionButton.new(); selector.name = "MirrorMask"
			var masks: Array = [0,1,2,4,3,6,5,7]
			for title: String in ["没宝石","红","绿","蓝","黄","青","品红","白"]: selector.add_item(title)
			selector.select(masks.find(mirror_mask))
			selector.item_selected.connect(func(index: int) -> void: set_mirror_mask(masks[index])); add_child(selector)
			_content = VBoxContainer.new(); add_child(_content); set_mirror_mask(mirror_mask)
		"composed-ui": _build_ui()
		"door-scenes": _build_doors()

func _label(parent: Node, value: String, font_size: int = 24) -> Label:
	var label: Label = Label.new(); label.text = value
	label.add_theme_font_size_override("font_size",font_size)
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	parent.add_child(label); return label

func _button(parent: Node, value: String, action: Callable) -> Button:
	var button: Button = Button.new(); button.text = value
	button.custom_minimum_size.y = 46; button.pressed.connect(action)
	parent.add_child(button); return button

func _clear_content() -> void:
	for child: Node in _content.get_children(): _content.remove_child(child); child.queue_free()

func _canvas(parent: Node, extent: Vector2) -> Control:
	var scroll: ScrollContainer = ScrollContainer.new()
	scroll.custom_minimum_size = Vector2(1,extent.y+20)
	scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	parent.add_child(scroll)
	var canvas: Control = Control.new(); canvas.custom_minimum_size = extent; canvas.size = extent
	scroll.add_child(canvas); return canvas

func _card(parent: Node, data: Dictionary, growth: Array, still: bool, factor: float = 1.0) -> Control:
	var view: Control = Card.new()
	view.setup(store,data,{"xp":growth.duplicate(),"opts":{"grow":true}},still)
	view.pivot_offset = Vector2.ZERO; view.scale = Vector2.ONE*factor
	var frame: Control = Control.new(); frame.custom_minimum_size = view.size*factor
	parent.add_child(frame); frame.add_child(view)
	view.set_meta("sample_scale",factor)
	return view

func set_base_form(index: int) -> void:
	base_form = clampi(index,0,FORMS.size()-1)
	base_cards.clear(); _clear_content()
	for factor: float in SCALES:
		var extent: Array = store.manifest.cardLayout.size
		_label(_content,"%s 倍 · %s × %s" % [factor,float(extent[0])*factor,float(extent[1])*factor])
		var cards: HFlowContainer = HFlowContainer.new(); cards.add_theme_constant_override("h_separation",24); cards.add_theme_constant_override("v_separation",24)
		_content.add_child(cards)
		for mask: int in MASKS: base_cards.append(_card(cards,{"v":mask},FORMS[base_form],false,factor))

func set_mirror_mask(mask: int) -> void:
	mirror_mask = clampi(mask,0,7); tool_pairs.clear(); _clear_content()
	for index: int in range(Config.TOOL_TYPES.size()):
		var type: String = Config.TOOL_TYPES[index]
		_label(_content,Config.TOOLS[type].name,28)
		var row: HFlowContainer = HFlowContainer.new(); row.add_theme_constant_override("h_separation",16); _content.add_child(row)
		var hand_column: VBoxContainer = VBoxContainer.new(); row.add_child(hand_column); _label(hand_column,"在手里 · 会动",20)
		var table_column: VBoxContainer = VBoxContainer.new(); row.add_child(table_column); _label(table_column,"在桌上 · 暂停",20)
		var hand: Control = _card(hand_column,{"id":100+index,"v":Config.TOOLS[type].v,"type":type},[0,0,0],false)
		var table: Control = _card(table_column,{"id":200+index,"v":mirror_mask if type == "mirror" else Config.TOOLS[type].v,"type":type,"k":"plain"},[0,0,0],true)
		tool_pairs[type] = {"hand":hand,"row":table}
		var button: Button = _button(_content,"播放 play · 600ms",func() -> void: play_tool(type)); button.name = "Play_"+type

func play_tool(type: String) -> float:
	if not tool_pairs.has(type): return 0.0
	var hand_duration: float = tool_pairs[type].hand.play_card_art()
	var row_duration: float = tool_pairs[type].row.play_card_art()
	return maxf(hand_duration,row_duration)

func _art(parent: Control, id: String, position_value: Vector2, extent: Vector2, still: bool = false) -> Control:
	var node: Control = store.create(id,{"static":still}); node.position = position_value; node.size = extent
	parent.add_child(node); return node

func _bar(parent: Control, rect: Rect2, color: String) -> Control:
	var panel: Panel = Panel.new(); panel.position = rect.position; panel.size = rect.size; panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var style: StyleBoxFlat = StyleBoxFlat.new(); style.bg_color = Color(color); style.set_corner_radius_all(int(rect.size.y/2.0)); panel.add_theme_stylebox_override("panel",style)
	parent.add_child(panel); return panel

func _overlay_text(label: Label) -> void:
	label.add_theme_color_override("font_color",Color(store.manifest.palette.text)); label.add_theme_color_override("font_outline_color",Color(store.manifest.palette.ink)); label.add_theme_constant_override("outline_size",1)
	if store.bold_font != null: label.add_theme_font_override("font",store.bold_font)

func _build_ui() -> void:
	_label(self,"场景组合 · 牌背、横幅、血条、心",32)
	ui_parts = {"backs":[],"hp":[],"hearts":[]}
	_label(self,"牌背 · 会动 / 静止")
	var backs: Control = _canvas(self,Vector2(424,300))
	for index: int in range(2): ui_parts.backs.append(_art(backs,"card_back",Vector2(index*224,0),Vector2(200,300),index == 1))
	_label(self,"横幅 · 600 × 140")
	var banner: Control = _canvas(self,Vector2(600,140)); ui_parts.banner = banner
	_art(banner,"ui_banner",Vector2.ZERO,Vector2(600,140))
	var title: Label = _label(banner,"战利品",56); title.size = banner.size; title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; title.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_overlay_text(title)
	_label(self,"血条 · 440 × 40")
	var palette: Dictionary = store.manifest.palette
	var inner: Array = store.assets.ui_hp_frame.definition.get("inner",[8,8,8,8])
	for percentage: int in [100,37,0]:
		_label(self,"%d%%" % percentage,20)
		var hp: Control = _canvas(self,Vector2(440,40)); hp.set_meta("percentage",percentage); ui_parts.hp.append(hp)
		var frame: Control = store.nine_slice("ui_hp_frame",Layout.base("portrait").hpBorder); frame.size = hp.size; hp.add_child(frame)
		var track: Control = _bar(hp,Rect2(Vector2(inner[3],inner[0]),hp.size-Vector2(inner[1]+inner[3],inner[0]+inner[2])),palette.barTrack)
		for color: String in [palette.hpChip,palette.hpFill]:
			_bar(track,Rect2(Vector2.ZERO,Vector2(track.size.x*float(percentage)/100.0,track.size.y)),color)
		var text: Label = _label(hp,"%d / 100" % percentage,26); text.size = hp.size; text.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; text.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		_overlay_text(text)
	_label(self,"三颗心 · 满、满、空")
	var heart_size: float = Layout.base("portrait").hearts.size
	var hearts: Control = _canvas(self,Vector2(heart_size*3+16,heart_size))
	var ids: Array = ["ui_heart","ui_heart","ui_heart_empty"]
	for index: int in range(ids.size()): ui_parts.hearts.append(_art(hearts,ids[index],Vector2(index*(heart_size+8),0),Vector2.ONE*heart_size))

func _anchored(parent: Control, id: String, point: Dictionary, factor: float, node: Control = null) -> Control:
	var definition: Dictionary = store.assets[id].definition
	var extent: Vector2 = store.dimensions(definition)
	var anchor: Array = definition.get("anchor",[extent.x/2.0,extent.y])
	var artwork: Control = store.create(id) if node == null else node
	artwork.size = extent*factor; artwork.position = Vector2(point.x,point.y)-Vector2(anchor[0],anchor[1])*factor
	parent.add_child(artwork); return artwork

func _build_doors() -> void:
	_label(self,"两扇门 · 关门 / 开门",32)
	for key: String in ["portrait","landscape"]:
		var layout: Dictionary = Layout.base(key)
		_label(self,key+" · 游戏布局坐标",26)
		var stage: Control = _canvas(self,Vector2(layout.width,layout.doors.hint.y))
		var backdrop: ColorRect = ColorRect.new(); backdrop.color = Color(store.manifest.palette.pageBg); backdrop.mouse_filter = Control.MOUSE_FILTER_IGNORE; backdrop.size = stage.size; stage.add_child(backdrop)
		var data: Dictionary = {"stage":stage,"doors":[],"rewards":[],"monsters":[]}
		for index: int in range(layout.doors.points.size()):
			var point: Dictionary = layout.doors.points[index]
			var door: Control = _anchored(stage,"ui_door",point,layout.doors.scale); data.doors.append(door)
			if index == 1: store.set_stay(door,"open")
			var id: String = "mon_chest" if index == 0 else "mon_bear"
			var monster: Control = _anchored(stage,id,point,layout.doors.monsterScale)
			data.monsters.append(monster)
			var reward: Control = store.create("ui_rule_sign")
			var reward_text: String = "额外牌" if index == 0 else "回一颗心"
			store.set_slot_text(reward,"rule_text",reward_text); store.set_slot_icon(reward,"icon_slot","ui_reward_card" if index == 0 else "ui_reward_heal")
			reward.set_meta("reward_text",reward_text)
			reward.position = Vector2(point.x-layout.doors.reward.w/2.0,point.y+layout.doors.reward.dy)
			reward.size = Vector2(layout.doors.reward.w,layout.doors.reward.h); stage.add_child(reward); data.rewards.append(reward)
		door_scenes[key] = data
		_button(self,"重播右门 open · 600ms",func() -> void: replay_right_door(key))
	for warning: String in issues: _label(self,warning,22)

func replay_right_door(layout_name: String) -> float:
	return store.play(door_scenes[layout_name].doors[1],"open") if door_scenes.has(layout_name) else 0.0
