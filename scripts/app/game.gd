extends Control
## Native presentation of the unchanged portable rules. All decisions call rules/.
const C: GDScript = preload("res://rules/index.gd")
const R: GDScript = preload("res://rules/run.gd")
const RC: GDScript = preload("res://rules/run_config.gd")
const E: GDScript = preload("res://rules/effects.gd")
const L: GDScript = preload("res://scripts/ui/layout.gd")
const CardView: GDScript = preload("res://scripts/ui/card_view.gd")
const Store: GDScript = preload("res://scripts/art/art_store.gd")
const Clock: GDScript = preload("res://scripts/art/feel_clock.gd")
const Audio: GDScript = preload("res://scripts/art/sound_player.gd")
const Persistence: GDScript = preload("res://scripts/app/persistence.gd")
const Display: GDScript = preload("res://scripts/app/display.gd")
const DRAW: Dictionary = {"interval":90.0,"fly":380.0,"flip":180.0,"arc":140.0}
const STRIKE: Dictionary = {"lead":80.0,"firstGap":230.0,"decay":0.86,"minGap":110.0,"maxTotal":2600.0,"hold":520.0,"breakHold":700.0,"lift":36.0}
const DEBUG_SEQUENCES: Dictionary = {1:[1,"lens"],2:[3,"lens"],3:[1,3,"hammer"],4:[1,3,2,6,4,5,"hammer"],5:[1,3,2,6,"lens",5],6:[1,"mirror"],7:[0,"mirror"],8:["mirror"],9:[7,"mirror"],10:[1,"mirror",1],11:["stone",1],12:["hammer","hammer"],13:[1,"bag"],14:[1,3,2,6,4,"mirror"]}
const TOOL_HELP: Dictionary = {"bag":"打出后从牌库摸 2 张。","lens":"打出后倍率再 ×2。","hammer":"打出后，这回合到这里的伤害 ×3。","hourglass":"倒计时 +1。打穿了就不加。","seal":"从下一张牌起，到这回合结束。","shadow":"宝石和反应都照抄上一张。第一张打它，什么都没有。","whistle":"从牌堆里找最上面的一张额外牌。牌堆里没有就不摸。","mirror":"变成上一张缺的宝石，一定和上一张凑白；这回合第一张打出时没有宝石。","stone":"打出后三颗宝石各长 5 次。"}
var clock: Variant
var art: Variant
var sound: Variant
var storage: RefCounted
var prefs: Dictionary
var records: Dictionary
var run_state: Dictionary = {}
var saved_run: Dictionary = {}
var game_state: Dictionary = {}
var screen: String = "home"
var layout: Dictionary = {}
var stage: Control
var scene: Control
var fx: Control
var overlay: Control
var modal: Control
var monster: Control
var monster_motion: Control
var hp_fill: ColorRect
var hp_ghost: Control
var hp_under: ColorRect
var hp_layers: Label
var heart_nodes: Array[Control] = []
var countdown_text: Label
var door_nodes: Array[Control] = []
var wall_time_ms: float = 0.0
var strike_generation: int = 0
var float_index: int = 0
var attacking: bool = false
var losing_heart: int = -1
var last_loot_fight: int = -1
var modal_return: Control
var drag_prediction: Dictionary = {}
var score_label: Label
var display_score: float = 0.0
var score_generation: int = 0
var pending_settlements: Array[Dictionary] = []
var save_warning_shown: bool = false
var shop_scroll: int = 0
var row_labels: Array[Control] = []
var formula_text: Label
var hp_text: Label
var multiplier: Control
var countdown_art: Control
var rule_sign: Control
var row_nodes: Dictionary = {}
var row_preview: Control
var hand_labels: Array[Control] = []
var pending_draw_ids: Dictionary = {}
var hand_nodes: Dictionary = {}
var relic_nodes: Dictionary = {}
var selected_relic: int = -1
var selected_loot: int = -1
var selected_door: int = -1
var shop_mode: String = ""
var shop_selected: Array = []
var transition: bool = false
var striking: bool = false
var strike_skip: bool = false
var strike_hp: float = -1.0
var epoch: int = 0
var scene_epoch: int = 0
var animations: Array[Dictionary] = []
var forced_layout: String = ""
var fixed_seed: int = -1
var debug_enabled: bool = false
var art_mode: bool = false
var inspect_id: String = ""
var drag: Dictionary = {}
var preview: Control
var active_toast: Control
var touch_down_at: int = 0
var capture: Dictionary = {}
var _timers: Dictionary = {}
var _shutting_down: bool = false
var loot_cards: Array[Control] = []
var end_button: Button
var undo_button: Button
var active_toast_timer: int = -1

func _ready() -> void:
	for argument: String in OS.get_cmdline_user_args():
		if argument == "--debug": debug_enabled = true
		elif argument == "--art": art_mode = true
		elif argument.begins_with("--inspect-id="): inspect_id = argument.get_slice("=",1)
		elif argument.begins_with("--layout="): forced_layout = argument.get_slice("=",1)
		elif argument.begins_with("--seed="): fixed_seed = int(argument.get_slice("=",1))
		elif argument.begins_with("--capture="): capture.path = argument.trim_prefix("--capture=")
		elif argument.begins_with("--scenario="): capture.scenario = argument.trim_prefix("--scenario=")
	var capture_scenario: String = str(capture.get("scenario", ""))
	if capture_scenario.begins_with("art-"):
		art_mode = true
		if inspect_id.is_empty():
			var suffix: String = capture_scenario.trim_prefix("art-")
			inspect_id = {"dragon": "mon_dragon", "clock": "mon_clock", "rainbow": "ui_rainbow_slot", "rule": "ui_rule_sign"}.get(suffix, suffix)
	var test_directory: String = OS.get_environment("GEMCARD_SAVE_DIR")
	storage = Persistence.new(test_directory)
	prefs = storage.load_settings(); records = storage.load_records()
	clock = Clock.new(); clock.configure(prefs); art = Store.new(clock)
	sound = Audio.new(); add_child(sound); sound.configure(prefs)
	if art.font != null: theme = Theme.new(); theme.default_font = art.font
	stage = Control.new(); stage.name = "Stage"; add_child(stage)
	scene = Control.new(); stage.add_child(scene)
	fx = Control.new(); fx.mouse_filter = Control.MOUSE_FILTER_IGNORE; stage.add_child(fx)
	overlay = Control.new(); overlay.mouse_filter = Control.MOUSE_FILTER_IGNORE; stage.add_child(overlay)
	game_state = C.create_game(_seed(), _rule_options())
	var loaded: Dictionary = storage.load_run()
	if loaded.get("state") is Dictionary:
		saved_run = loaded.state
	get_window().size_changed.connect(_resize)
	get_window().focus_exited.connect(_cancel_drag)
	_resize()
	if not Display.place(get_window()): get_tree().quit(2); return
	if DisplayServer.get_name() != "headless": get_window().show()
	if loaded.get("error") != null: _toast(str(loaded.error))
	elif loaded.get("clear", false): _toast("游戏更新了，上次那局没法接着打，已经清掉了" if loaded.get("reason") == "outdated" else "上次的进度读不出来，已经清掉了")
	if not capture.is_empty(): _capture_scenario.call_deferred()

func _seed() -> int:
	return fixed_seed if fixed_seed >= 0 else int(Time.get_unix_time_from_system()*1000.0)&0xffffffff

func _rule_options() -> Dictionary:
	return {"hand":prefs.hand,"hint":prefs.hint,"grow":prefs.grow,"tools":prefs.tools}

func _process(delta: float) -> void:
	if _shutting_down: return
	wall_time_ms += maxf(0.0, delta * 1000.0)
	clock.advance(delta)
	var active: Array[Dictionary] = animations.duplicate()
	for animation: Dictionary in active:
		if (animation.get("scene_epoch",scene_epoch)!=scene_epoch and not animation.get("persistent",false)) or not _owners_alive(animation.get("owners",[])): animations.erase(animation); continue
		var now: float = wall_time_ms if animation.get("wall", false) else clock.time_ms
		if now < animation.start: continue
		var fraction: float = clampf((now-animation.start)/animation.duration,0.0,1.0)
		if fraction >= 0.0 and animation.step.is_valid(): animation.step.call(fraction)
		if fraction >= 1.0:
			animations.erase(animation)
			if animation.get("finish") is Callable and animation.finish.is_valid(): animation.finish.call()
	if not drag.is_empty() and drag.get("touch", false) and not drag.get("hold_cancelled", false) and not drag.get("moving",false) and not drag.get("held",false) and Time.get_ticks_msec()-touch_down_at >= L.MOTION.holdMs:
		drag.held = true; _preview_card(drag.card, float(drag.origin.x)+100.0)

func _animate(duration: float, step: Callable, finish: Callable = Callable(), delay: float = 0.0, wall: bool = false, persistent: bool = false, owners: Array = []) -> void:
	animations.append({"start":(wall_time_ms if wall else clock.time_ms)+delay,"duration":maxf(1,duration),"step":step,"finish":finish,"wall":wall,"scene_epoch":scene_epoch,"persistent":persistent,"owners":_owner_ids(owners)})

func _owner_ids(owners: Array) -> Array[int]:
	var ids: Array[int]=[]
	for owner: Node in owners: ids.append(owner.get_instance_id() if is_instance_valid(owner) else 0)
	return ids

func _owners_alive(ids: Array) -> bool:
	for identity: int in ids:
		if identity==0 or not is_instance_id_valid(identity): return false
		var owner: Object=instance_from_id(identity)
		if owner is Node and owner.is_queued_for_deletion(): return false
	return true

func _later(ms: float, action: Callable, persistent: bool = false, owners: Array = []) -> int:
	var timer: Timer = Timer.new()
	timer.one_shot = true
	timer.wait_time = maxf(0.001, ms / 1000.0)
	var identity: int = timer.get_instance_id()
	_timers[identity] = {"timer":timer,"action":action,"epoch":epoch,"scene_epoch":scene_epoch,"persistent":persistent,"owners":_owner_ids(owners)}
	add_child(timer)
	timer.timeout.connect(_timer_finished.bind(identity), CONNECT_ONE_SHOT)
	timer.start()
	return identity

func _cancel_timer(identity: int) -> void:
	var item: Dictionary=_timers.get(identity,{})
	if item.is_empty(): return
	_timers.erase(identity)
	var timer: Timer=item.timer
	if is_instance_valid(timer): timer.stop(); timer.queue_free()

func _timer_finished(identity: int) -> void:
	var item: Dictionary = _timers.get(identity, {})
	if item.is_empty(): return
	_timers.erase(identity)
	var timer: Timer = item.timer
	if is_instance_valid(timer): timer.queue_free()
	if not _shutting_down and is_inside_tree() and int(item.epoch)==epoch and (item.persistent or int(item.scene_epoch)==scene_epoch) and _owners_alive(item.get("owners",[])) and item.action.is_valid(): item.action.call()

func _clear_timers(all: bool = true) -> void:
	for identity: int in _timers.keys():
		var item: Dictionary = _timers[identity]
		if not all and (item.persistent or int(item.scene_epoch)==scene_epoch): continue
		var timer: Timer = item.timer
		if is_instance_valid(timer): timer.stop(); timer.queue_free()
		_timers.erase(identity)

func _reset() -> void:
	_cancel_drag(); _close_modal(); _clear_row_overlays(); _clear_hand_draws(); pending_draw_ids.clear()
	epoch += 1; strike_generation += 1
	_clear_timers(); animations.clear(); clock.reset(); clock.configure(prefs)
	transition = false; striking = false; strike_skip = false; strike_hp = -1
	for child: Node in fx.get_children(): child.queue_free()

func _resize() -> void:
	if stage == null: return
	_cancel_drag(); _close_modal()
	var requested: String = forced_layout if forced_layout in ["portrait","landscape"] else prefs.layout
	var physical: Vector2i = get_window().size
	var name_choice: String = requested if requested != "auto" else "landscape" if physical.x > physical.y else "portrait"
	var logical: Vector2i = Vector2i(1920,1080) if name_choice == "landscape" else Vector2i(1080,1920)
	get_window().content_scale_size = logical
	get_window().content_scale_aspect = Window.CONTENT_SCALE_ASPECT_EXPAND
	var window_fit: float=minf(float(physical.x)/float(logical.x),float(physical.y)/float(logical.y))
	var virtual_size: Vector2=Vector2(physical)/maxf(0.001,window_fit)
	var base: Dictionary = L.base(name_choice)
	var factor: float = minf(virtual_size.x/float(base.width),virtual_size.y/float(base.height))
	var extra: float = virtual_size.y/factor-base.height if name_choice == "portrait" else virtual_size.x/factor-base.width
	layout = L.fit_layout(base,extra)
	stage.size = Vector2(layout.width,layout.height); stage.scale = Vector2.ONE*factor
	stage.position = (virtual_size-stage.size*factor)/2.0
	for layer: Control in [scene,fx,overlay]: layer.size = stage.size
	_render()

static func _rect(box: Dictionary) -> Rect2:
	return Rect2(float(box.x),float(box.y),float(box.w),float(box.h))

func _place(node: Control, box: Dictionary, parent: Node = null) -> Control:
	if parent != null: parent.add_child(node)
	node.position = _rect(box).position; node.size = _rect(box).size
	return node

func _label(text: String, box: Dictionary, font_size: int = 30, parent: Node = null, centered: bool = false) -> Label:
	var node: Label = Label.new()
	node.mouse_filter = Control.MOUSE_FILTER_IGNORE
	node.add_theme_font_size_override("font_size",font_size)
	if font_size >= 36 and art.bold_font != null: node.add_theme_font_override("font",art.bold_font)
	node.add_theme_color_override("font_color",Color(art.manifest.palette.text))
	node.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	node.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER if centered else HORIZONTAL_ALIGNMENT_LEFT
	node.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_place(node,box,scene if parent == null else parent)
	node.text = text
	return node

func _panel(box: Dictionary, parent: Node = null, border: int = 24) -> Control:
	var node: Control = art.nine_slice("ui_panel",border)
	_place(node,box,scene if parent == null else parent)
	return node

func _button(text: String, box: Dictionary, action: Callable, primary: bool = false, icon: String = "", parent: Node = null) -> Button:
	var node: Button = PresentationButton.new(); node.set_meta("primary",primary); node.text = text; node.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	if art.bold_font != null: node.add_theme_font_override("font",art.bold_font)
	node.add_theme_font_size_override("font_size",40 if primary else 32)
	for key: String in ["font_color","font_hover_color","font_pressed_color","font_focus_color","font_disabled_color"]:
		node.add_theme_color_override(key,Color(art.manifest.palette.ink if primary else art.manifest.palette.text))
	for style: String in ["normal","hover","pressed","focus","disabled"]:
		var frame: StyleBoxFlat = StyleBoxFlat.new()
		frame.bg_color = Color(0.08,0.06,0.12,0.12)
		if style == "hover" or style == "focus": frame.set_border_width_all(3); frame.border_color = Color(art.manifest.palette.accent)
		node.add_theme_stylebox_override(style,frame)
	var background: Control = art.nine_slice("ui_btn_primary" if primary else "ui_btn",32)
	node.add_child(background); background.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT); background.show_behind_parent = true; background.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_place(node,box,scene if parent == null else parent)
	if not icon.is_empty():
		var image: Control = art.create(icon); node.add_child(image); image.position = Vector2(12,12); image.size = Vector2(box.h-24,box.h-24); image.mouse_filter = Control.MOUSE_FILTER_IGNORE
	node.pressed.connect(func() -> void: sound.button(); action.call())
	return node

func _round(text: String, box: Dictionary, action: Callable, icon: String) -> Button:
	var node: Button = PresentationButton.new(); node.tooltip_text = text; node.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	for state: String in ["normal","hover","pressed","focus","disabled"]:
		var style: StyleBoxFlat = StyleBoxFlat.new()
		style.bg_color = Color("#1b1625") if state != "pressed" else Color("#110d19")
		style.border_color = Color(art.manifest.palette.accent if state in ["hover","focus"] else art.manifest.palette.accentDark)
		style.set_border_width_all(2)
		style.set_corner_radius_all(int(minf(float(box.w),float(box.h))/2.0))
		style.shadow_color = Color(0,0,0,0.55); style.shadow_size = 12; style.shadow_offset = Vector2(0,6)
		node.add_theme_stylebox_override(state,style)
	_place(node,box,scene)
	var image: Control = art.create(icon); node.add_child(image)
	var extent: float = float(layout.toolbarIcon) if icon in ["ui_icon_rules","ui_icon_settings"] else 62.0
	image.position = (Vector2(box.w,box.h)-Vector2.ONE*extent)/2.0; image.size = Vector2.ONE*extent
	image.mouse_filter = Control.MOUSE_FILTER_IGNORE
	node.pressed.connect(func() -> void: sound.button(); action.call())
	return node

func _art(id: String, box: Dictionary, parent: Node = null) -> Control:
	var node: Control = art.create(id)
	_place(node,box,scene if parent == null else parent); node.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return node

func _anchored(id: String, point: Dictionary, factor: float, parent: Node = null) -> Control:
	var node: Control = art.create(id)
	var definition: Dictionary = art.assets[id].definition
	var anchor: Array = definition.get("anchor",[node.size.x/2.0,node.size.y])
	node.position = Vector2(point.x,point.y)-Vector2(anchor[0],anchor[1])*factor
	node.scale = Vector2.ONE*factor
	(scene if parent == null else parent).add_child(node); node.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return node

func _clear_layer(layer: Control) -> void:
	for child: Node in layer.get_children(): layer.remove_child(child); child.queue_free()

func _render() -> void:
	if stage == null or layout.is_empty(): return
	scene_epoch+=1
	_clear_timers(false)
	loot_cards.clear()
	for child: Node in fx.get_children():
		if child.get_meta("render_owned",false): child.queue_free()
	_keep_row_nodes()
	_clear_layer(scene); row_labels.clear(); hand_labels.clear(); relic_nodes.clear(); formula_text=null
	monster = null; monster_motion = null; hp_fill = null; hp_ghost = null; hp_text = null; hp_under = null; hp_layers = null; countdown_text = null
	heart_nodes.clear(); door_nodes.clear()
	if art_mode:
		var inspector: Control = load("res://scripts/ui/art_inspector.gd").new()
		scene.add_child(inspector); inspector.size = stage.size; inspector.setup(art)
		if not inspect_id.is_empty(): inspector.select_asset(inspect_id)
		return
	_scene_background()
	var table: Control = art.nine_slice("table_cloth",layout.tableBorder); _place(table,layout.table,scene); table.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_round("规则",layout.rules,_show_rules,"ui_icon_rules")
	_round("设置",layout.settings,_show_settings,"ui_icon_settings")
	if screen == "home": _home(); return
	if screen == "adventure":
		if run_state.get("result") != null and not attacking: _result(); return
		_adventure_top()
		match str(run_state.phase):
			"relic": _relic_pick(); return
			"loot": _loot(); return
			"doors": _doors(); return
			"shop": _shop(); return
	_battle()

func _shader_rect(code: String, uniforms: Dictionary, parent: Control, box: Rect2) -> ColorRect:
	var shader: Shader=Shader.new(); shader.code=code
	var material: ShaderMaterial=ShaderMaterial.new(); material.shader=shader
	for key: String in uniforms: material.set_shader_parameter(key,uniforms[key])
	var node: ColorRect=ColorRect.new(); node.material=material; node.position=box.position; node.size=box.size; node.mouse_filter=Control.MOUSE_FILTER_IGNORE; parent.add_child(node)
	return node

func _scene_background() -> void:
	var background: TextureRect=TextureRect.new(); background.texture=art.image_texture(art.image_path("bg_tile")); background.texture_repeat=CanvasItem.TEXTURE_REPEAT_ENABLED; background.expand_mode=TextureRect.EXPAND_IGNORE_SIZE; background.stretch_mode=TextureRect.STRETCH_SCALE; background.size=stage.size; background.mouse_filter=Control.MOUSE_FILTER_IGNORE
	var shader: Shader=Shader.new()
	shader.code="shader_type canvas_item; uniform vec2 repeats=vec2(1.0); void fragment(){ COLOR=texture(TEXTURE,UV*repeats); }"
	var material: ShaderMaterial=ShaderMaterial.new(); material.shader=shader; material.set_shader_parameter("repeats",stage.size/512.0); background.material=material; scene.add_child(background)
	_shader_rect("shader_type canvas_item; void fragment(){ float d=length((UV-vec2(0.5,0.45))/vec2(0.8,0.75)); float a=clamp((d-0.45)/0.55,0.0,1.0)*0.82; COLOR=vec4(7.0/255.0,9.0/255.0,15.0/255.0,a); }",{},scene,Rect2(Vector2.ZERO,stage.size))
	_shader_rect("shader_type canvas_item; uniform vec2 canvas_size=vec2(1.0); uniform vec2 center=vec2(0.0); uniform vec2 radii=vec2(1.0); void fragment(){ float d=length((UV*canvas_size-center)/radii); float a=d<0.55?mix(0.16,0.05,d/0.55):mix(0.05,0.0,clamp((d-0.55)/0.25,0.0,1.0)); COLOR=vec4(226.0/255.0,214.0/255.0,186.0/255.0,a); }",{"canvas_size":stage.size,"center":Vector2(layout.light.x,layout.light.y),"radii":Vector2(layout.light.rx,layout.light.ry)},scene,Rect2(Vector2.ZERO,stage.size))
	if layout.floorY != null:
		var height: float=maxf(1.0,float(layout.height)-float(layout.floorY))
		_shader_rect("shader_type canvas_item; uniform float extent=1.0; void fragment(){ float y=UV.y*extent; float a=y<60.0?mix(0.0,0.55,y/60.0):mix(0.55,0.85,clamp((y-60.0)/max(1.0,extent-60.0),0.0,1.0)); COLOR=vec4(13.0/255.0,17.0/255.0,28.0/255.0,a); }",{"extent":height},scene,Rect2(0,float(layout.floorY),float(layout.width),height))
		var edge: ColorRect=ColorRect.new(); edge.color=Color(110.0/255.0,84.0/255.0,43.0/255.0,0.35); edge.position=Vector2(0,layout.floorY); edge.size=Vector2(layout.width,2); edge.mouse_filter=Control.MOUSE_FILTER_IGNORE; scene.add_child(edge)

func _attack_vignette() -> void:
	var node: ColorRect=_shader_rect("shader_type canvas_item; void fragment(){ float d=length((UV-vec2(0.5))/vec2(0.5)); COLOR=vec4(13.0/255.0,17.0/255.0,28.0/255.0,clamp((d-0.3)/0.7,0.0,1.0)); }",{},fx,Rect2(Vector2.ZERO,stage.size))
	node.z_index=40; node.modulate.a=0.0
	_animate(500.0,func(t: float) -> void:
		if is_instance_valid(node): node.modulate.a=0.55*(t/0.18 if t<0.18 else 1.0-(t-0.18)/0.82),func() -> void:
		if is_instance_valid(node): node.queue_free(),0.0,true,true)

func _home() -> void:
	_anchored("title_emblem",layout.title.emblem,layout.title.emblemScale)
	var title: HBoxContainer = HBoxContainer.new(); title.alignment = BoxContainer.ALIGNMENT_CENTER
	_place(title,layout.title.name,scene)
	var name_label: Label = Label.new(); name_label.text = "新卡牌"; name_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER; name_label.add_theme_font_size_override("font_size",96); title.add_child(name_label)
	var suffix: Label = Label.new(); suffix.text = "（暂名）"; suffix.vertical_alignment = VERTICAL_ALIGNMENT_CENTER; suffix.add_theme_font_size_override("font_size",42); title.add_child(suffix)
	for label: Label in [name_label,suffix]:
		if art.bold_font != null: label.add_theme_font_override("font",art.bold_font)
		label.add_theme_color_override("font_color",Color(art.manifest.palette.text))
		label.add_theme_color_override("font_outline_color",Color(art.manifest.palette.ink)); label.add_theme_constant_override("outline_size",4)
	_button("新开一局" if not saved_run.is_empty() else "开始冒险",layout.title.start,func() -> void:
		if saved_run.is_empty(): start_adventure()
		else: _confirm("新开一局","现在这局会作废，确定新开一局吗？","新开一局",start_adventure),true)
	if not saved_run.is_empty(): _button("继续这局（第 %d 仗）" % saved_run.fight,layout.title.resume,resume_adventure)
	_button("练习（打木桩）",layout.title.practice,start_practice)
	var home_records: BoxContainer=VBoxContainer.new() if layout.name=="portrait" else HBoxContainer.new()
	home_records.name="HomeRecords"; home_records.alignment=BoxContainer.ALIGNMENT_CENTER
	home_records.add_theme_constant_override("separation",8 if layout.name=="portrait" else 24)
	_place(home_records,layout.title.record,scene)
	var descriptions: Array[String]=["还没有纪录"]
	if records.played>0:
		descriptions=["最远：%s · 通关 %d 次" % ["已通关" if records.farthest==7 else "第 %d 仗" % records.farthest,records.wins],"最高一回合 %s · 最大超杀 %s" % [C.format_full(records.bestTurn),R.format_overkill(records.maxOverkill)]]
	for description: String in descriptions:
		var value: Label=Label.new(); value.add_theme_font_size_override("font_size",28); value.add_theme_color_override("font_color",Color(art.manifest.palette.textDim)); value.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER; value.vertical_alignment=VERTICAL_ALIGNMENT_CENTER
		home_records.add_child(value); value.text=description
	if layout.name == "portrait":
		var positions: Array = L.hand_positions(5,layout)
		for point: Dictionary in positions:
			var back: Control = _art("card_back",{"x":point.x,"y":point.y,"w":200*layout.hand.scale,"h":300*layout.hand.scale})
			back.pivot_offset = Vector2(back.size.x/2,back.size.y); back.rotation_degrees = point.rotation

func start_adventure() -> void:
	if not run_state.is_empty() and run_state.get("result") != null: _settle_records()
	_flush_settlements()
	_reset(); screen = "adventure"; run_state = R.create_run(_seed()); run_state.game.opts.hint = prefs.hint
	game_state = run_state.game; saved_run = run_state
	selected_relic = -1; selected_loot = -1; selected_door = -1; shop_mode = ""; shop_selected = []; last_loot_fight = -1
	_persist(); _render()

func resume_adventure() -> void:
	if saved_run.is_empty(): return
	_reset(); screen = "adventure"; run_state = saved_run; game_state = run_state.game; game_state.opts.hint = prefs.hint
	last_loot_fight = int(run_state.fight) if run_state.phase == "loot" else -1
	_render()

func start_practice() -> void:
	if not run_state.is_empty() and run_state.get("result") != null: _settle_records()
	_flush_settlements()
	_reset(); screen = "practice"; run_state = {}; game_state = C.create_game(_seed(),_rule_options()); _render(); _draw_animation(game_state.hand)

func go_home() -> void:
	if not run_state.is_empty() and run_state.get("result") != null: _settle_records()
	_flush_settlements()
	if not run_state.is_empty() and run_state.get("result") == null: _persist(); saved_run = run_state
	_reset(); screen = "home"; run_state = {}; _render()

func _storage_warning() -> void:
	if not save_warning_shown:
		save_warning_shown = true
		_toast("浏览器未允许保存，本次游戏仍可继续")

func _settle_records() -> bool:
	if run_state.is_empty() or run_state.get("result") == null: return true
	if not storage.record_result(run_state, records):
		var retained: bool = false
		for item: Dictionary in pending_settlements:
			if is_same(item, run_state): retained = true; break
		if not retained: pending_settlements.append(run_state)
		_storage_warning(); return false
	for index: int in range(pending_settlements.size()-1, -1, -1):
		if is_same(pending_settlements[index], run_state): pending_settlements.remove_at(index)
	if is_same(saved_run, run_state): saved_run = {}
	return true

func _flush_settlements() -> void:
	for state: Dictionary in pending_settlements.duplicate():
		if not storage.record_result(state, records): _storage_warning(); break
		for index: int in range(pending_settlements.size()-1, -1, -1):
			if is_same(pending_settlements[index], state): pending_settlements.remove_at(index)
		if is_same(saved_run, state): saved_run = {}

func _persist() -> void:
	if not run_state.is_empty() and run_state.get("result") != null: _settle_records()
	_flush_settlements()
	var active: Dictionary = run_state if screen == "adventure" and not run_state.is_empty() and run_state.get("result") == null else saved_run
	if not active.is_empty() and active.get("result") == null and not storage.save_run(active): _storage_warning()

func _banner(text: String) -> void:
	_art("ui_banner", layout.banner)
	_label(text,layout.banner,46,null,true)

func _adventure_top() -> void:
	_label("第 %d 仗 · 第 %d 回合" % [run_state.fight,game_state.turn],layout.turn,32)
	_label("%s · 第 %d 间" % [RC.RUN.acts[int(run_state.act)-1].name,run_state.room],layout.actLabel,28)
	var progress: Dictionary = layout.progress
	for index: int in range(RC.RUN.fights.size()):
		var id: String = "ui_node_boss" if index == 5 else "ui_node_elite" if index == 2 else "ui_node_door" if index in [1,3,4] else "ui_node_fight"
		if not art.assets.has(id): id = "ui_node_fight"
		var node: Control = _art(id,{"x":progress.x+index*(progress.w-progress.node)/5.0,"y":progress.y-progress.node/2.0,"w":progress.node,"h":progress.node})
		if index+1 < run_state.fight: node.modulate = Color(0.7,0.65,0.5,0.8)
	for index: int in range(int(run_state.maxHearts)):
		var heart: Control = _art("ui_heart" if index < run_state.hearts or index == losing_heart else "ui_heart_empty",{"x":layout.hearts.x+index*(layout.hearts.size+layout.hearts.gap),"y":layout.hearts.y,"w":layout.hearts.size,"h":layout.hearts.size})
		heart_nodes.append(heart)
	var relic_layout: Dictionary = layout.relics
	for index: int in range(run_state.relics.size()):
		var id: String = run_state.relics[index]
		var icon: Control = _art("relic_"+id,{"x":relic_layout.x+index*(relic_layout.size+relic_layout.gap),"y":relic_layout.y,"w":relic_layout.size,"h":relic_layout.size})
		icon.mouse_filter = Control.MOUSE_FILTER_STOP; icon.gui_input.connect(func(event: InputEvent) -> void:
			if _click(event): _text_modal(RC.RELICS[id].name,[RC.RELICS[id].text]))
		relic_nodes[id] = icon

func _relic_pick() -> void:
	_banner("再挑一件宝物" if not run_state.relics.is_empty() else "选一个宝物带进古堡")
	if run_state.relics.is_empty():
		var knocker: Control = _anchored("npc_knocker",layout.knocker,layout.knocker.scale)
		art.play(knocker, "talk")
		var lines: Array[String] = ["又来一个找宝石的。老规矩：宝物带出大门才算你的。","挑一件带上吧。里头那条龙，可比你会攒东西。","我赌你过不了门厅。敢不敢？"]
		_label(lines[int(records.played)%3],layout.knockerSay,30)
	for index: int in range(run_state.relicOptions.size()):
		var id: String = run_state.relicOptions[index]
		var point: Dictionary = layout.relicPick.points[index]
		var box: Dictionary = {"x":point.x,"y":point.y,"w":200*layout.relicPick.scale,"h":300*layout.relicPick.scale}
		var panel: Control=_panel(box); panel.name="RelicPanel"+str(index); panel.clip_contents=true
		var inner_width: float=float(box.w)-20.0
		var name_height: float=float(layout.relicPick.nameSize)*1.1
		var detail_height: float=minf(float(layout.relicPick.textSize)*3.6,maxf(0.0,float(box.h)-16.0-float(layout.relicPick.icon)-name_height-8.0))
		var block_height: float=float(layout.relicPick.icon)+name_height+detail_height+8.0
		var top: float=(float(box.h)-block_height)/2.0
		var icon_extent: float=minf(float(layout.relicPick.icon),inner_width)
		_art("relic_"+id,{"x":(box.w-icon_extent)/2.0,"y":top+(layout.relicPick.icon-icon_extent)/2.0,"w":icon_extent,"h":icon_extent},panel)
		var title_box: Control=Control.new(); title_box.position=Vector2(10,top+layout.relicPick.icon+4); title_box.size=Vector2(inner_width,name_height); title_box.mouse_filter=Control.MOUSE_FILTER_IGNORE; panel.add_child(title_box)
		var title_font: FontVariation=FontVariation.new(); title_font.base_font=art.bold_font if art.bold_font!=null else art.font; title_font.spacing_glyph=-1
		var title_width: float=maxf(inner_width,title_font.get_string_size(RC.RELICS[id].name,HORIZONTAL_ALIGNMENT_CENTER,-1,int(layout.relicPick.nameSize)).x)
		var name: Label=Label.new(); name.name="RelicName"+str(index); name.mouse_filter=Control.MOUSE_FILTER_IGNORE; name.autowrap_mode=TextServer.AUTOWRAP_OFF; name.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER
		name.add_theme_font_override("font",title_font); name.add_theme_font_size_override("font_size",int(layout.relicPick.nameSize)); name.add_theme_color_override("font_color",Color(art.manifest.palette.text))
		name.position=Vector2((inner_width-title_width)/2.0,(name_height-title_font.get_height(int(layout.relicPick.nameSize)))/2.0); name.size=Vector2(title_width,title_font.get_height(int(layout.relicPick.nameSize))); title_box.add_child(name); name.text=RC.RELICS[id].name
		var detail_box: Control=Control.new(); detail_box.name="RelicDescriptionClip"+str(index); detail_box.clip_contents=true; detail_box.mouse_filter=Control.MOUSE_FILTER_IGNORE; detail_box.position=Vector2(10,top+layout.relicPick.icon+4+name_height+4); detail_box.size=Vector2(inner_width,detail_height); panel.add_child(detail_box)
		var detail_font: int=int(layout.relicPick.textSize)
		var detail: Label=Label.new(); detail.name="RelicDescription"+str(index); detail.mouse_filter=Control.MOUSE_FILTER_IGNORE; detail.autowrap_mode=TextServer.AUTOWRAP_WORD_SMART; detail.clip_text=true; detail.max_lines_visible=3; detail.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER
		detail.add_theme_font_size_override("font_size",detail_font); detail.add_theme_color_override("font_color",Color(art.manifest.palette.text)); detail.add_theme_constant_override("line_spacing",int(round(detail_font*1.2-art.font.get_height(detail_font))))
		detail.position=Vector2(0,(detail_font*1.2-art.font.get_height(detail_font))/2.0); detail.size=Vector2(inner_width,maxf(detail_height,art.font.get_height(detail_font))); detail_box.add_child(detail); detail.text=RC.RELICS[id].text
		_selectable(panel,index == selected_relic,func() -> void: selected_relic = index; _render(),{},"relic")
	_label("选了「%s」，点“拿这件”带走" % RC.RELICS[run_state.relicOptions[selected_relic]].name if selected_relic >= 0 else "选一件，再点“拿这件”",layout.loot.hint,30,null,true)
	_button("拿这件",layout.loot.take,_take_relic,true).disabled = selected_relic < 0

func _selectable(node: Control, selected: bool, action: Callable, inspect: Dictionary = {}, kind: String = "") -> void:
	if selected and kind in ["relic","loot","door","shop"]:
		var shift: float=40.0 if kind in ["relic","loot"] else 18.0 if kind=="door" else 14.0
		var factor: float=1.08 if kind=="relic" else 1.15 if kind=="loot" else 1.0
		if factor!=1.0:
			var original: Vector2=node.get_transform()*Vector2.ZERO
			node.pivot_offset=node.size/2.0
			node.position=original-node.pivot_offset*(Vector2.ONE-node.scale)
		node.position.y-=shift; node.scale*=factor
	var input: Button = Button.new(); input.flat = true; input.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT); node.add_child(input)
	if selected:
		var style: StyleBoxFlat = StyleBoxFlat.new(); style.bg_color = Color(0.8,0.7,0.4,0.12); style.border_color = Color(art.manifest.palette.accent); style.set_border_width_all(5); input.add_theme_stylebox_override("normal",style)
	var held: Array[bool] = [false]
	var token: Array[int] = [0]
	if not inspect.is_empty():
		input.gui_input.connect(func(event: InputEvent) -> void:
			if _click(event):
				held[0]=false; token[0]+=1
				var generation: int=token[0]
				_later(float(L.MOTION.holdMs),func() -> void:
					if generation==token[0] and is_instance_valid(input) and input.is_inside_tree(): held[0]=true; _inspect_card(inspect))
			elif (event is InputEventMouseButton and not event.pressed) or (event is InputEventScreenTouch and (not event.pressed or event.canceled)): token[0]+=1)
		input.mouse_exited.connect(func() -> void: token[0]+=1)
	input.pressed.connect(func() -> void:
		if held[0] or transition: return
		sound.button(); action.call())

func _take_relic() -> void:
	if transition or selected_relic < 0: return
	var id: String = run_state.relicOptions[selected_relic]
	var point: Dictionary = layout.relicPick.points[selected_relic]
	R.choose_relic(run_state,selected_relic); game_state = run_state.game; transition = true; _persist()
	var moving: Control = _art("relic_"+id,{"x":point.x,"y":point.y,"w":192,"h":192},fx)
	var destination: Vector2 = Vector2(layout.relics.x+(run_state.relics.size()-1)*(layout.relics.size+layout.relics.gap),layout.relics.y)
	var origin: Vector2 = moving.position
	_animate(500,func(fraction: float) -> void:
		if is_instance_valid(moving): moving.position = origin.lerp(destination,smoothstep(0.0,1.0,fraction)); moving.scale = Vector2.ONE*lerpf(1.0,float(layout.relics.size)/192.0,fraction))
	_later(500,func() -> void: moving.queue_free(); transition = false; selected_relic = -1; _render(); _enter_fight_feedback())

func _battle() -> void:
	var adventure: bool = screen == "adventure"
	var art_id: String = "mon_"+str(run_state.monster.key) if adventure else "dummy"
	if not adventure or run_state.monster.key != "dragon": _anchored("prop_pillar" if adventure else "prop_rack",layout.rackAnchor,layout.rackScale)
	monster_motion = Control.new(); monster_motion.size = stage.size; monster_motion.pivot_offset = Vector2(layout.dummyAnchor.x, layout.dummyAnchor.y); monster_motion.mouse_filter = Control.MOUSE_FILTER_IGNORE; scene.add_child(monster_motion)
	monster = _anchored(art_id,layout.dummyAnchor,float(layout.monsterScale.boss if adventure and run_state.monster.key == "dragon" else layout.monsterScale.normal if adventure else layout.dummyScale), monster_motion)
	if adventure:
		monster.mouse_filter = Control.MOUSE_FILTER_STOP; monster.gui_input.connect(func(event: InputEvent) -> void:
			if _click(event): _show_monster())
		_hp()
		countdown_art = _art("ui_countdown",{"x":layout.countdown.x-layout.countdown.size/2.0,"y":layout.countdown.y-layout.countdown.size/2.0,"w":layout.countdown.size,"h":layout.countdown.size})
		countdown_text = _label(str(0 if attacking else run_state.monster.countdown),{"x":layout.countdown.x-layout.countdown.size/2.0,"y":layout.countdown.y-layout.countdown.size/2.0,"w":layout.countdown.size,"h":layout.countdown.size},44,null,true)
		if run_state.monster.key == "clock": art.set_slot_text(monster,"countdown_slot",str(run_state.monster.countdown))
		if _hp_info().shownBroken: art.set_stay(monster,"daze")
		elif run_state.monster.woundDown: art.set_stay(monster,"wound_down")
		if int(run_state.monster.countdown) <= 1 and not run_state.monster.broken: art.set_stay(countdown_art,"warn")
		_rule_sign()
	multiplier = _art("ui_mult_badge",layout.multiplier)
	_label("×"+C.format_full(game_state.m),layout.multiplier,48,null,true)
	if not adventure: _label("第 %d 回合" % game_state.turn,layout.turn,32)
	if not adventure: _label("最高一回合 %s\n累计 %s" % [C.format_full(game_state.best),C.format_full(game_state.total)],layout.records,26)
	_label("本回合",layout.turnLabel,30)
	score_label = _label(C.format_full(game_state.turnDmg),layout.damage,92,null,true)
	display_score = float(game_state.turnDmg)
	var formula_button: Button = _button("算式 ▾" if not prefs.formula else "收起算式 ▴",{"x":layout.formula.x,"y":layout.formula.y,"w":layout.formula.w,"h":48},func() -> void: prefs.formula = not prefs.formula; storage.save_settings(prefs); _render())
	formula_button.add_theme_font_size_override("font_size",24)
	if prefs.formula: formula_text = _label(C.format_formula(game_state.row[-1], false, Callable(C, "format_full")) if not game_state.row.is_empty() else "",{"x":layout.formula.x,"y":layout.formula.y+54,"w":layout.formula.w,"h":layout.formula.h-54},26)
	_growth(); _rainbow(); _rows(); _hand()
	undo_button=_round("撤回",layout.undo,undo_card,"ui_icon_undo")
	undo_button.disabled=game_state.hist.is_empty() or striking
	var deck: Button = _round("牌库",layout.deck,_show_deck,"ui_icon_deck"); deck.name="DeckButton"
	_label(str(game_state.deck.size()),{"x":layout.deck.x+layout.deck.w-42,"y":layout.deck.y-12,"w":50,"h":38},24,null,true)
	deck.tooltip_text = "牌库 %d 张" % game_state.deck.size()
	var end_text: String = "打出去" if not game_state.row.is_empty() else "结束回合"
	end_button=_button(end_text,layout.end,end_turn,true)
	end_button.disabled=transition or striking

func _hp_info() -> Dictionary:
	var m: Dictionary = run_state.monster
	var fight_type: String = str(RC.RUN.fights[int(run_state.fight) - 1].type)
	var layers: int = int(RC.RUN.hpLayers["normal" if fight_type == "doors" else fight_type])
	var per: float = float(m.maxHp) / float(layers)
	var raw_shown: float = strike_hp if striking else float(m.turnStartHp) if not game_state.row.is_empty() else float(m.hp)
	var shown: float = clampf(raw_shown, 0.0, float(m.maxHp))
	var predicted: float = maxf(0.0, float(m.hp))
	var layer: int = mini(layers, int(ceil(shown / per - 0.000000001))) if shown > 0.0 else 0
	var predicted_layer: int = mini(layers, int(ceil(predicted / per - 0.000000001))) if predicted > 0.0 else 0
	var fraction: float = (shown - float(layer - 1) * per) / per if layer > 0 else 0.0
	var ghost_from: float = ((predicted - float(layer - 1) * per) / per if predicted_layer == layer else 0.0) if predicted < shown else fraction
	var shown_broken: bool = strike_hp <= 0.0 if striking else false if not game_state.row.is_empty() else bool(m.broken)
	var will_break: bool = not shown_broken and bool(m.broken)
	var name_text: String = "打穿了！超杀 %s" % R.format_overkill(m.overkill) if shown_broken else "能打穿！超杀 %s" % R.format_overkill(m.overkill) if will_break else RC.MONSTERS[m.key].name
	var layer_text: String = ""
	if not shown_broken and not will_break and layers > 1:
		layer_text = "×%d → ×%d" % [layer, predicted_layer] if predicted_layer < layer and not striking else "×%d" % layer
	return {"layers": layers, "layer": layer, "predictedLayer": predicted_layer, "fraction": clampf(fraction, 0, 1), "ghostFrom": clampf(ghost_from, 0, 1), "shownBroken": shown_broken, "willBreak": will_break, "text": name_text, "layerText": layer_text}

func _layer_color(layer: int) -> Color:
	return Color("#8a4fc4") if layer >= 3 else Color("#c7742b") if layer == 2 else Color(art.manifest.palette.hpFill)

func _hp() -> void:
	var box: Dictionary=layout.hpBar
	var cuts: Array=art.assets["ui_hp_frame"].definition.get("inner",[8,8,8,8])
	var frame: Control=art.nine_slice("ui_hp_frame",float(layout.hpBorder)); frame.name="HpFrame"; _place(frame,box,scene)
	var slot: Control=Control.new(); slot.name="HpSlot"; slot.position=Vector2(cuts[3],cuts[0]); slot.size=Vector2(box.w-float(cuts[1])-float(cuts[3]),box.h-float(cuts[0])-float(cuts[2])); slot.clip_contents=true; slot.mouse_filter=Control.MOUSE_FILTER_IGNORE; frame.add_child(slot)
	var inner: Dictionary={"x":0,"y":0,"w":slot.size.x,"h":slot.size.y}
	var track: ColorRect=ColorRect.new(); track.color=Color(art.manifest.palette.barTrack); _place(track,inner,slot); track.mouse_filter=Control.MOUSE_FILTER_IGNORE
	hp_under=ColorRect.new(); _place(hp_under,inner,slot); hp_under.mouse_filter=Control.MOUSE_FILTER_IGNORE
	hp_fill=ColorRect.new(); _place(hp_fill,inner,slot); hp_fill.mouse_filter=Control.MOUSE_FILTER_IGNORE
	hp_ghost=DamageGhost.new(); _place(hp_ghost,inner,slot); hp_ghost.mouse_filter=Control.MOUSE_FILTER_IGNORE
	hp_text=_label("",{"x":box.x+12,"y":box.y,"w":box.w-24,"h":box.h},26)
	hp_layers=_label("",{"x":box.x+12,"y":box.y,"w":box.w-24,"h":box.h},28)
	hp_layers.horizontal_alignment=HORIZONTAL_ALIGNMENT_RIGHT
	hp_layers.add_theme_color_override("font_color",Color(art.manifest.palette.accent))
	_update_hp()

func _update_hp() -> void:
	if run_state.is_empty() or hp_fill == null: return
	var info: Dictionary = _hp_info()
	var outer: Dictionary = layout.hpBar
	var cuts: Array = art.assets["ui_hp_frame"].definition.get("inner", [8,8,8,8])
	var box: Dictionary = {"x":outer.x+float(cuts[3]),"y":outer.y+float(cuts[0]),"w":outer.w-float(cuts[1])-float(cuts[3]),"h":outer.h-float(cuts[0])-float(cuts[2])}
	hp_fill.color = _layer_color(info.layer)
	hp_fill.size.x = float(box.w) * float(info.fraction)
	hp_under.color = _layer_color(int(info.layer) - 1)
	hp_under.visible = int(info.layer) > 1
	hp_ghost.position.x = float(box.w) * float(info.ghostFrom)
	hp_ghost.size.x = float(box.w) * maxf(0.0, float(info.fraction) - float(info.ghostFrom))
	hp_ghost.visible = not striking and float(info.ghostFrom) < float(info.fraction)
	hp_ghost.queue_redraw()
	hp_text.text = str(info.text)
	hp_text.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER if info.shownBroken or info.willBreak else HORIZONTAL_ALIGNMENT_LEFT
	hp_text.add_theme_color_override("font_color", Color(art.manifest.palette.accent if info.shownBroken or info.willBreak else art.manifest.palette.text))
	hp_layers.text = str(info.layerText)
	hp_text.set_meta("presentation", info)
	if is_instance_valid(monster): art.set_stay(monster, "daze" if info.shownBroken else "wound_down" if run_state.monster.woundDown else null)

func _rule_sign(override_id: Variant = null) -> void:
	var id: Variant = override_id if override_id != null else R.current_rule(run_state)
	if id == null and R.rule_sealed(run_state): id = R.displayed_rule(run_state)
	if id == null or str(id).is_empty(): return
	rule_sign = _art("ui_rule_sign",layout.ruleSign)
	var text: String = RC.RULES[id].name
	if id == "wind": text = "发条松完" if run_state.monster.woundDown else "%s %s%s" % [text,"●".repeat(int(run_state.monster.wind)),"○".repeat(maxi(0,int(run_state.monster.maxWind-run_state.monster.wind)))]
	var value: Label = art.set_slot_text(rule_sign,"rule_text",text)
	if id == "wind" and value != null: value.add_theme_font_size_override("font_size",24)
	art.set_slot_icon(rule_sign,"icon_slot","rule_"+str(id))
	if R.rule_sealed(run_state): rule_sign.modulate.a = 0.5
	rule_sign.mouse_filter = Control.MOUSE_FILTER_STOP; rule_sign.gui_input.connect(func(event: InputEvent) -> void:
		if _click(event): _show_monster())

func _growth() -> void:
	var centers: Array = layout.growth.centers
	for index: int in range(3):
		var center: Dictionary = centers[index]
		var form: int = C.gem_form(game_state,index)
		var box: Dictionary = {"x":center.x-layout.growth.size/2.0,"y":center.y-layout.growth.size/2.0,"w":layout.growth.size,"h":layout.growth.size}
		var socket: GrowthSocket = GrowthSocket.new()
		var style: StyleBoxFlat = StyleBoxFlat.new()
		style.bg_color = Color("#0f0c16")
		style.border_color = Color(art.manifest.palette.ink)
		style.set_border_width_all(7)
		style.set_corner_radius_all(int(layout.growth.size / 2.0))
		style.shadow_color = Color(0, 0, 0, 0.5)
		style.shadow_size = 14
		style.shadow_offset = Vector2(0, 6)
		socket.add_theme_stylebox_override("panel", style)
		socket.track_color = Color(art.manifest.palette.accentDark)
		socket.track_color.a = 0.55
		socket.fill_color = Color(art.manifest.palette.accent)
		var thresholds: Array = E.growth_thresholds(run_state if not run_state.is_empty() else game_state)
		var xp: float = float(game_state.xp[index])
		socket.progress = 1.0 if xp >= float(thresholds[2]) else (xp - float(thresholds[1])) / (float(thresholds[2]) - float(thresholds[1])) if xp >= float(thresholds[1]) else xp / float(thresholds[1])
		socket.mouse_filter = Control.MOUSE_FILTER_STOP
		socket.gui_input.connect(func(event: InputEvent) -> void:
			if _click(event): _show_growth(index))
		_place(socket, box, scene)
		var gem: Control = _art("gem_%s_%s" % [C.GEMS[index].key,C.FORM_KEYS[form]],{"x":center.x-layout.growth.gem/2.0,"y":center.y-layout.growth.gem/2.0,"w":layout.growth.gem,"h":layout.growth.gem})
		art.set_static(gem, true)
		gem.mouse_filter = Control.MOUSE_FILTER_STOP; gem.gui_input.connect(func(event: InputEvent) -> void:
			if _click(event): _show_growth(index))
		_label("%s %s" % [C.FORMS[form], C.format_full(C.gem_value(game_state,index))],{"x":center.x-84,"y":center.y+layout.growth.size/2+layout.growth.labelGap,"w":168,"h":70},24,null,true)

func _rainbow() -> void:
	var status: Dictionary = R.rainbow_status(run_state if not run_state.is_empty() else game_state)
	var colors: Array = [1,3,2,6,4,5]
	for index: int in range(6):
		var node: Control = _art("ui_rainbow_slot",{"x":layout.rainbow.x+index*(layout.rainbow.slot+layout.rainbow.gap),"y":layout.rainbow.y,"w":layout.rainbow.slot,"h":layout.rainbow.slot})
		art.set_color(node,str(art.manifest.palette.mix[str(colors[index])]))
		if status.lit.has(colors[index]) or game_state.rainbow: art.set_stay(node,"light")
	if int(status.need) == 5: _label("5 种就够", {"x":layout.rainbow.x,"y":layout.rainbow.y+layout.rainbow.slot+8,"w":260,"h":38}, 24)
	if status.ready: _label("这手能出彩虹",layout.rainbowReady,28,null,true)

func _card(card: Dictionary, parent: Node, point: Dictionary, factor: float, still: bool) -> Control:
	var node: Control = CardView.new(); node.setup(art,card,game_state,still); parent.add_child(node)
	node.scale = Vector2.ONE*factor
	node.position = Vector2(point.x,point.y) - node.pivot_offset * (Vector2.ONE - node.scale)
	node.set_meta("layout_origin", Vector2(point.x, point.y))
	node.mouse_filter = Control.MOUSE_FILTER_STOP
	node.focus_mode = Control.FOCUS_ALL
	return node

func _card_face_key(card: Dictionary) -> String:
	return "%s:%s:%s:%s:%s:%s:%s" % [card.v,card.get("type",""),C.gem_form(game_state,0),C.gem_form(game_state,1),C.gem_form(game_state,2),game_state.opts.grow,epoch]

func _keep_row_nodes() -> void:
	var battle: bool=not art_mode and (screen=="practice" or (screen=="adventure" and (run_state.get("phase")=="battle" or attacking)))
	if not battle: row_nodes.clear(); hand_nodes.clear(); return
	for node: Control in row_nodes.values()+hand_nodes.values():
		if is_instance_valid(node) and not node.is_queued_for_deletion() and node.get_parent()!=null: node.get_parent().remove_child(node)

func _row_rewind(identity: int) -> void:
	for index: int in range(game_state.row.size()):
		if game_state.row[index].id==identity: rewind_to(index); return

func _rows() -> void:
	var previous: Dictionary=row_nodes.duplicate()
	if is_instance_valid(row_preview): row_preview.queue_free()
	row_preview=null
	for old: Control in row_labels:
		if is_instance_valid(old): old.queue_free()
	row_nodes.clear(); row_labels.clear()
	var items: Array=game_state.row.duplicate()
	if not drag_prediction.is_empty(): items.append(drag_prediction)
	var positions: Array=L.row_positions(items,layout)
	if items.is_empty():
		var empty: Panel=Panel.new()
		var style: StyleBoxFlat=StyleBoxFlat.new(); style.bg_color=Color(0,0,0,0); style.border_color=Color(0.6,0.54,0.4,0.35); style.set_border_width_all(2); style.set_corner_radius_all(12)
		empty.add_theme_stylebox_override("panel",style); empty.mouse_filter=Control.MOUSE_FILTER_IGNORE
		_place(empty,{"x":layout.rowStart.x,"y":layout.rowStart.y,"w":L.row_size(layout).w,"h":L.row_size(layout).h},scene)
		row_labels.append(empty)
		row_labels.append(_label("拖到这里",{"x":layout.rowStart.x,"y":layout.rowStart.y,"w":L.row_size(layout).w,"h":L.row_size(layout).h},28,null,true))
	for index: int in range(items.size()):
		var entry: Dictionary=items[index]
		var point: Dictionary=positions[index]
		var predicted: bool=index==game_state.row.size()
		var key: String=_card_face_key(entry)
		var node: Control=null if predicted else previous.get(entry.id)
		if node!=null and (not is_instance_valid(node) or node.is_queued_for_deletion() or node.get_meta("row_face_key","")!=key):
			if is_instance_valid(node): node.queue_free()
			node=null
		if node==null:
			node=_card(entry,scene,point,layout.rowScale,true)
			node.set_meta("row_face_key",key)
			if not predicted:
				var identity: int=int(entry.id)
				node.gui_input.connect(func(event: InputEvent) -> void:
					if _click(event): _row_rewind(identity))
		else:
			if node.get_parent()==null: scene.add_child(node)
			node.card_data=entry.duplicate(true)
			node.scale=Vector2.ONE*float(layout.rowScale)
			node.position=Vector2(point.x,point.y)-node.pivot_offset*(Vector2.ONE-node.scale)
			node.set_meta("layout_origin",Vector2(point.x,point.y))
		if predicted:
			row_preview=node; node.modulate.a=0.6; node.mouse_filter=Control.MOUSE_FILTER_IGNORE
		else:
			row_nodes[entry.id]=node; previous.erase(entry.id)
		if predicted and not game_state.opts.hint: continue
		if point.showLabel and entry.k!="plain": row_labels.append(_label(C.REACTION_NAMES[entry.k],{"x":point.x-20,"y":point.y-42,"w":200*layout.rowScale+40,"h":36},26,null,true))
		var damage_text: String=("预计 " if predicted else "")+C.format_full(entry.damage)
		var card_width: float=200.0*float(layout.rowScale)
		var damage_width: float=maxf(card_width,art.font.get_string_size(damage_text,HORIZONTAL_ALIGNMENT_CENTER,-1,28).x)
		var damage_label: Label=_label(damage_text,{"x":point.x+(card_width-damage_width)/2.0,"y":point.y+300*layout.rowScale+8,"w":damage_width,"h":32},28,null,true)
		damage_label.vertical_alignment=VERTICAL_ALIGNMENT_TOP; damage_label.autowrap_mode=TextServer.AUTOWRAP_OFF
		damage_label.set_meta("row_damage",not predicted); row_labels.append(damage_label)
		_row_details(entry,point,card_width)

	for old: Control in previous.values():
		if is_instance_valid(old): old.queue_free()

func _row_details(entry: Dictionary, point: Dictionary, card_width: float) -> void:
	var bonuses: Array[String]=[]
	if float(entry.get("rainbow",0))>0: bonuses.append("彩虹 +"+C.format_full(entry.rainbow))
	if float(entry.get("hammer",0))>0: bonuses.append("锤子 +"+C.format_full(entry.hammer))
	var effects: Array[Dictionary]=[]
	for effect: Dictionary in entry.get("effects",[]):
		if effect.id in RC.RULES or effect.id=="layers" or effect.id in RC.RELICS or effect.id in C.TOOLS: effects.append(effect)
	if bonuses.is_empty() and effects.is_empty(): return
	var column_widths: Array[float]=[0.0,0.0]
	for index: int in range(effects.size()):
		var text: String="打两次" if effects[index].id=="twice" else str(effects[index].get("text",""))
		column_widths[index%2]=maxf(column_widths[index%2],art.font.get_string_size(text,HORIZONTAL_ALIGNMENT_LEFT,-1,24).x+8.0)
	var grid_width: float=column_widths[0]+column_widths[1]+(8.0 if effects.size()>1 else 0.0)
	var width: float=maxf(card_width,grid_width)
	for text: String in bonuses: width=maxf(width,art.font.get_string_size(text,HORIZONTAL_ALIGNMENT_CENTER,-1,24).x)
	width=minf(280.0,width)
	var details: Control=Control.new(); details.name="RowDetails"+str(entry.id); details.mouse_filter=Control.MOUSE_FILTER_IGNORE; details.position=Vector2(point.x+(card_width-width)/2.0,point.y+300.0*layout.rowScale+40.0); scene.add_child(details); row_labels.append(details)
	var line_height: float=24.0*1.15
	var natural_height: float=art.font.get_height(24)
	var y: float=0.0
	for text: String in bonuses:
		var text_width: float=maxf(width,art.font.get_string_size(text,HORIZONTAL_ALIGNMENT_CENTER,-1,24).x)
		var label: Label=_label(text,{"x":(width-text_width)/2.0,"y":y+(line_height-natural_height)/2.0,"w":text_width,"h":natural_height},24,details,true)
		label.autowrap_mode=TextServer.AUTOWRAP_OFF; label.add_theme_color_override("font_color",Color(art.manifest.palette.accent)); y+=line_height
	if not effects.is_empty():
		var grid: GridContainer=GridContainer.new(); grid.name="RowEffects"+str(entry.id); grid.columns=2; grid.mouse_filter=Control.MOUSE_FILTER_IGNORE; grid.add_theme_constant_override("h_separation",8); grid.add_theme_constant_override("v_separation",3); grid.position=Vector2((width-grid_width)/2.0,y); grid.size=Vector2(grid_width,ceil(float(effects.size())/2.0)*(line_height+4.0)+maxi(0,int(ceil(float(effects.size())/2.0))-1)*3.0); details.add_child(grid)
		for effect: Dictionary in effects:
			var text: String="打两次" if effect.id=="twice" else str(effect.get("text",""))
			var tag_width: float=art.font.get_string_size(text,HORIZONTAL_ALIGNMENT_LEFT,-1,24).x+8.0
			var tag: Panel=Panel.new(); tag.custom_minimum_size=Vector2(tag_width,line_height+4.0); tag.clip_contents=true; tag.mouse_filter=Control.MOUSE_FILTER_IGNORE; grid.add_child(tag)
			var style: StyleBoxFlat=StyleBoxFlat.new(); style.bg_color=Color(13.0/255.0,17.0/255.0,28.0/255.0,0.9); style.set_corner_radius_all(5); tag.add_theme_stylebox_override("panel",style)
			var label: Label=_label(text,{"x":4,"y":2.0+(line_height-natural_height)/2.0,"w":tag_width-8.0,"h":natural_height},24,tag,false)
			label.autowrap_mode=TextServer.AUTOWRAP_OFF; label.add_theme_color_override("font_color",Color(art.manifest.palette.accent if effect.id in RC.RELICS else art.manifest.palette.accentDark))
		y+=grid.size.y
	details.size=Vector2(width,y)

func _clear_row_overlays() -> void:
	for row: Control in row_nodes.values():
		if is_instance_valid(row): _reveal_mirror(row,false)

func _present_mirror(row: Control, identity: int) -> void:
	var faces: Array[int]=[]
	for child: Node in row.get_children():
		if child is CanvasItem: child.visible=false; faces.append(child.get_instance_id())
	row.set_meta("mirror_faces",faces)
	var unknown: Control=CardView.new(); unknown.name="TemporaryMirror"
	unknown.setup(art,C.create_tool_card("mirror",identity),game_state,true)
	unknown.mouse_filter=Control.MOUSE_FILTER_IGNORE; row.add_child(unknown); unknown.play_card_art()
	_later(200.0,func() -> void: _reveal_mirror(row),true,[row])

func _reveal_mirror(row: Control, fade: bool = true) -> void:
	if not row.has_meta("mirror_faces") and row.get_node_or_null("TemporaryMirror")==null: return
	var unknown: Node=row.get_node_or_null("TemporaryMirror")
	if unknown!=null: row.remove_child(unknown); unknown.queue_free()
	var faces: Array[CanvasItem]=[]
	for identity: int in row.get_meta("mirror_faces",[]):
		if is_instance_id_valid(identity):
			var face: Object=instance_from_id(identity)
			if face is CanvasItem: face.visible=true; face.modulate.a=0.0 if fade else 1.0; faces.append(face)
	row.remove_meta("mirror_faces")
	if fade and not faces.is_empty():
		_animate(200.0,func(t: float) -> void:
			for face: CanvasItem in faces:
				if is_instance_valid(face): face.modulate.a=t,Callable(),0.0,false,true,[row])

func _update_formula_preview() -> void:
	if not is_instance_valid(formula_text): return
	if not drag_prediction.is_empty(): formula_text.text=C.format_formula(drag_prediction,true,Callable(C,"format_full")) if game_state.opts.hint else ""
	else: formula_text.text=C.format_formula(game_state.row[-1],false,Callable(C,"format_full")) if not game_state.row.is_empty() else ""

func _playing() -> bool:
	return not striking and (screen=="practice" or (screen=="adventure" and run_state.get("phase")=="battle" and not transition))

func _predict_card(card: Dictionary) -> Dictionary:
	var entry: Variant=R.preview_run_card(run_state,card) if screen=="adventure" and not run_state.is_empty() else null
	return entry if entry is Dictionary else C.preview_card(game_state,card)

func _hand_index(identity: int) -> int:
	for index: int in range(game_state.hand.size()):
		if game_state.hand[index].id==identity: return index
	return -1

func _visible_hand() -> Array[Dictionary]:
	var cards: Array[Dictionary]=[]
	for card: Dictionary in game_state.hand:
		if pending_draw_ids.has(card.id) or (not drag.is_empty() and drag.get("moving",false) and drag.id==card.id): continue
		cards.append(card)
	return cards

func _hand() -> void:
	var previous: Dictionary=hand_nodes.duplicate()
	hand_nodes.clear()
	for old: Control in hand_labels:
		if is_instance_valid(old): old.queue_free()
	hand_labels.clear()
	var cards: Array[Dictionary]=_visible_hand()
	var positions: Array=L.hand_positions(cards.size(),layout)
	var factor: float=L.hand_scale(cards.size(),layout)
	var best: Variant=R.best_hint_card(run_state if not run_state.is_empty() else game_state)
	for index: int in range(cards.size()):
		var card: Dictionary=cards[index]
		var predicted: Dictionary=_predict_card(card)
		var shown: Dictionary=predicted if card.get("type","") in ["mirror","shadow"] else card
		var node: Control=previous.get(card.id)
		var key: String=_card_face_key(shown)
		if node==null or not is_instance_valid(node) or node.is_queued_for_deletion():
			node=_card(shown,scene,positions[index],factor,false)
		else:
			if node.get_parent()==null: scene.add_child(node)
			if node.get_meta("hand_face_key","")!=key:
				var back: Node=node.get_node_or_null("DealingCardBack")
				if back!=null: node.remove_child(back)
				node.setup(art,shown,game_state,false)
				if back!=null:
					node.add_child(back); _hide_hand_face(node,back)
			for connection: Dictionary in node.gui_input.get_connections(): node.gui_input.disconnect(connection.callable)
			for connection: Dictionary in node.mouse_entered.get_connections(): node.mouse_entered.disconnect(connection.callable)
			for connection: Dictionary in node.mouse_exited.get_connections(): node.mouse_exited.disconnect(connection.callable)
		previous.erase(card.id)
		node.set_meta("hand_face_key",key); node.set_meta("hand_factor",factor); node.set_meta("hand_rotation",float(positions[index].rotation))
		node.scale=Vector2.ONE*factor; node.pivot_offset=Vector2(100,300)
		node.position=Vector2(positions[index].x,positions[index].y)-node.pivot_offset*(Vector2.ONE-node.scale)
		node.set_meta("layout_origin",Vector2(positions[index].x,positions[index].y))
		node.rotation_degrees=positions[index].rotation
		hand_nodes[card.id]=node
		if not drag.is_empty() and drag.id==card.id and not drag.moving:
			drag.node=node; drag.source=node; drag.raw_origin=node.position; drag.origin=node.get_meta("layout_origin"); drag.original_scale=node.scale; drag.original_rotation=node.rotation
			node.position.y-=float(L.MOTION.handLift); node.scale*=float(L.MOTION.handPickScale); node.z_index=200
		var identity: int=int(card.id)
		node.gui_input.connect(func(event: InputEvent) -> void: _hand_input(event,_hand_index(identity),node))
		node.mouse_entered.connect(func() -> void:
			if not striking and drag.is_empty() and modal==null: _preview_card(card,float(node.get_meta("layout_origin").x)+100.0*factor))
		node.mouse_exited.connect(func() -> void:
			if drag.is_empty(): _hide_preview())
		var point: Dictionary=positions[index]
		if game_state.opts.hint and best==card.id:
			var hint: Label=_label(C.format_card_hint(predicted),{"x":point.x,"y":point.y-42,"w":200*factor,"h":36},28,null,true)
			hint.name="HandHint"+str(card.id); hand_labels.append(hint)
		if not run_state.is_empty():
			var warnings: Dictionary=R.card_warnings(run_state,card)
			if warnings.attack:
				var warning: Label=_label("会挨打",{"x":point.x,"y":point.y-82,"w":200*factor,"h":38},26,null,true)
				warning.name="HandWarning"+str(card.id); hand_labels.append(warning)
			if warnings.unwind: hand_labels.append(_label("松发条",{"x":point.x,"y":point.y-82,"w":200*factor,"h":38},26,null,true))
		var old_badge: Node=node.get_node_or_null("TwiceBadge")
		if old_badge!=null: node.remove_child(old_badge); old_badge.queue_free()
		if not run_state.is_empty() and R.can_double_tool(run_state,card):
			var badge: Panel=Panel.new(); badge.name="TwiceBadge"; badge.z_index=3; badge.mouse_filter=Control.MOUSE_FILTER_IGNORE; badge.size=Vector2(70,52)/factor; node.add_child(badge)
			var style: StyleBoxFlat=StyleBoxFlat.new(); style.bg_color=Color(art.manifest.palette.accent); style.set_corner_radius_all(int(10.0/factor)); badge.add_theme_stylebox_override("panel",style)
			var value: Label=_label("×2",{"x":0,"y":0,"w":badge.size.x,"h":badge.size.y},int(round(30.0/factor)),badge,true)
			value.add_theme_color_override("font_color",Color(art.manifest.palette.ink))
	for old: Control in previous.values():
		if is_instance_valid(old): old.queue_free()

func _contains(box: Dictionary, point: Vector2) -> bool:
	return point.x >= float(box.x) and point.y >= float(box.y) and point.x <= float(box.x) + float(box.w) and point.y <= float(box.y) + float(box.h)

func _can_drop(point: Vector2) -> bool:
	if point.x < 0.0 or point.y < 0.0 or point.x > float(layout.width) or point.y > float(layout.height) or _contains(layout.hand.region, point): return false
	for box: Dictionary in [layout.undo, layout.deck, layout.end, layout.rules, layout.settings] + L.growth_rects(layout):
		if _contains(box, point): return false
	return true

func _event_point(event: InputEvent) -> Vector2:
	if event is InputEventScreenTouch or event is InputEventScreenDrag:
		return stage.get_global_transform().affine_inverse() * event.position
	return stage.get_local_mouse_position()

func _hand_input(event: InputEvent, index: int, node: Control) -> void:
	if transition or striking or modal != null or not drag.is_empty() or index<0 or index>=game_state.hand.size(): return
	var touch: bool = event is InputEventScreenTouch
	var down: bool = (touch and event.pressed and not event.canceled) or (event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed)
	if not down: return
	var point: Vector2 = _event_point(event)
	var origin: Vector2 = node.get_meta("layout_origin", node.position)
	drag = {"index":index,"id":game_state.hand[index].id,"card":game_state.hand[index].duplicate(),"node":node,"source":node,"origin":origin,"raw_origin":node.position,"original_scale":node.scale,"original_rotation":node.rotation,"start":point,"last":point,"offset":point-origin,"moving":false,"touch":touch,"pointer":event.index if touch else -1,"held":false,"hold_cancelled":false}
	touch_down_at = Time.get_ticks_msec()
	node.position.y -= float(L.MOTION.handLift)
	node.scale = node.scale * float(L.MOTION.handPickScale)
	node.z_index = 200
	node.grab_focus()

func _drag_pointer_matches(event: InputEvent) -> bool:
	if drag.is_empty(): return false
	if event is InputEventScreenTouch or event is InputEventScreenDrag: return bool(drag.touch) and event.index == int(drag.pointer)
	return not bool(drag.touch)

func _unpick(data: Dictionary) -> void:
	var source: Control = data.get("source")
	if not is_instance_valid(source): return
	source.position = data.raw_origin
	source.scale = data.original_scale
	source.rotation = data.original_rotation
	source.z_index = 0
	source.visible = true

func _move_drag(point: Vector2) -> void:
	if drag.is_empty(): return
	drag.last = point
	if drag.touch and not drag.moving and point.y >= float(layout.hand.region.y):
		if absf(point.x - float(drag.start.x)) > float(L.MOTION.dragThreshold):
			drag.hold_cancelled = true; _hide_preview()
		var visible: Array[Dictionary]=_visible_hand()
		var positions: Array = L.hand_positions(visible.size(), layout)
		var selected: int = 0
		for index: int in range(positions.size()):
			if point.x >= float(positions[index].x): selected = index
		if selected < visible.size() and visible[selected].id != drag.id:
			_unpick(drag)
			var node: Control = hand_nodes.get(visible[selected].id)
			if node != null:
				var origin: Vector2 = node.get_meta("layout_origin", node.position)
				drag.index = _hand_index(int(visible[selected].id)); drag.id = visible[selected].id; drag.card = visible[selected].duplicate(); drag.source = node; drag.node = node; drag.origin = origin; drag.raw_origin = node.position; drag.original_scale = node.scale; drag.original_rotation = node.rotation; drag.offset = point - origin
				node.position.y -= float(L.MOTION.handLift); node.scale *= float(L.MOTION.handPickScale); node.z_index = 200
		return
	if not drag.moving and point.distance_to(drag.start) > float(L.MOTION.dragThreshold):
		drag.moving = true; drag.hold_cancelled = true; _hide_preview()
		var copy: Control = _card(drag.card, fx, {"x":0,"y":0}, float(layout.hand.scale), false)
		copy.set_meta("render_owned",true)
		copy.mouse_filter = Control.MOUSE_FILTER_IGNORE
		copy.rotation = 0.0; copy.z_index = 200
		_unpick(drag); drag.source.visible = false; drag.node = copy
		_hand()
	if not drag.moving: return
	var extent: Dictionary = L.hand_size(layout)
	var origin: Vector2 = Vector2(point.x - float(extent.w) / 2.0, point.y - float(L.MOTION.touchOffset) - float(extent.h) / 2.0) if drag.touch else point - drag.offset
	drag.origin = origin
	drag.node.position = origin - drag.node.pivot_offset * (Vector2.ONE - drag.node.scale)
	var was_valid: bool=not drag_prediction.is_empty()
	var valid: bool = _can_drop(point)
	var predicted: Variant = (R.preview_run_card(run_state, drag.card) if not run_state.is_empty() else C.preview_card(game_state, drag.card)) if valid else {}
	drag_prediction = predicted if predicted is Dictionary else {}
	if valid!=was_valid: _rows(); _update_formula_preview()
	if not run_state.is_empty() and valid:
		var after: int = int(R.preview_countdown(run_state, drag.card))
		if countdown_text != null and after != int(run_state.monster.countdown): countdown_text.text = "%s → %s" % [run_state.monster.countdown, after]
		var warnings: Dictionary = R.card_warnings(run_state, drag.card)
		if countdown_text != null: countdown_text.add_theme_color_override("font_color", Color("#e3263a") if warnings.attack else Color(art.manifest.palette.text))

func _return_drag(data: Dictionary) -> void:
	_unpick(data)
	if not data.get("moving", false): return
	var copy: Control = data.get("node")
	var source: Control=hand_nodes.get(data.id)
	if source==null or not is_instance_valid(source):
		_hand(); source=hand_nodes.get(data.id)
	if not is_instance_valid(copy): return
	if not is_instance_valid(source): copy.queue_free(); return
	source.visible = false
	var from: Vector2 = copy.position
	var from_scale: Vector2 = copy.scale
	var destination: Vector2 = source.position
	var target_scale: Vector2=source.scale
	_animate(200.0, func(t: float) -> void:
		if is_instance_valid(copy):
			copy.position = from.lerp(destination, 1.0-pow(1.0-t, 2.0))
			copy.scale = from_scale.lerp(target_scale, t), func() -> void:
		if is_instance_valid(copy): copy.queue_free()
		if is_instance_valid(source): source.visible = true, 0.0, true)

func _release_drag(point: Vector2, canceled: bool = false) -> void:
	if drag.is_empty(): return
	var data: Dictionary = drag
	drag = {}; drag_prediction = {}
	if data.touch: _hide_preview()
	if not canceled and data.moving and _can_drop(point):
		if is_instance_valid(data.node): data.node.queue_free()
		_unpick(data)
		var index: int = -1
		for candidate: int in range(game_state.hand.size()):
			if game_state.hand[candidate].id == data.id: index = candidate; break
		play_card(index, data.origin)
	else:
		_return_drag(data)
		_rows(); _update_formula_preview()
	if not run_state.is_empty(): _update_countdown(int(run_state.monster.countdown))

func _input(event: InputEvent) -> void:
	if striking and ((event is InputEventMouseButton and event.pressed) or (event is InputEventScreenTouch and event.pressed) or (event is InputEventKey and event.pressed and event.keycode in [KEY_SPACE, KEY_ENTER])):
		_skip_strike(); get_viewport().set_input_as_handled(); return
	if not drag.is_empty() and _drag_pointer_matches(event):
		if event is InputEventMouseMotion or event is InputEventScreenDrag:
			_move_drag(_event_point(event)); get_viewport().set_input_as_handled(); return
		if (event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and not event.pressed) or (event is InputEventScreenTouch and (not event.pressed or event.canceled)):
			_release_drag(_event_point(event), event is InputEventScreenTouch and event.canceled)
			get_viewport().set_input_as_handled(); return
	if not event is InputEventKey or not event.pressed or event.echo: return
	if modal != null:
		if event.keycode == KEY_ESCAPE: _close_modal(); get_viewport().set_input_as_handled()
		elif event.keycode == KEY_TAB:
			var focusables: Array[Control] = []
			_collect_focus(modal, focusables)
			if not focusables.is_empty():
				var index: int = focusables.find(get_viewport().gui_get_focus_owner())
				index = (index - 1 + focusables.size()) % focusables.size() if event.shift_pressed else (index + 1) % focusables.size()
				focusables[index].grab_focus(); get_viewport().set_input_as_handled()
		return
	var focus: Control = get_viewport().gui_get_focus_owner()
	if event.ctrl_pressed or event.meta_pressed or event.alt_pressed or focus is LineEdit or focus is TextEdit or focus is OptionButton: return
	if event.keycode == KEY_ESCAPE: _cancel_drag(); return
	if transition: return
	var phase: String = str(run_state.get("phase", ""))
	if screen == "adventure" and phase in ["doors", "relic", "loot"]:
		if event.keycode >= KEY_1 and event.keycode <= KEY_4:
			var index: int = int(event.keycode-KEY_1)
			if phase == "doors" and index < 2: selected_door = index; _render()
			elif phase == "relic" and index < run_state.relicOptions.size(): selected_relic = index; _render()
			elif phase == "loot" and index < run_state.loot.size(): selected_loot = index; _render()
		elif event.keycode == KEY_0 and phase == "loot": _take_loot(-1)
		elif event.keycode == KEY_ENTER:
			if phase == "doors" and selected_door >= 0: _enter_door()
			elif phase == "relic" and selected_relic >= 0: _take_relic()
			elif phase == "loot" and selected_loot >= 0: _take_loot(selected_loot)
		get_viewport().set_input_as_handled(); return
	if screen not in ["practice", "adventure"] or (not run_state.is_empty() and phase != "battle"): return
	if event.keycode >= KEY_1 and event.keycode <= KEY_9: play_card(int(event.keycode-KEY_1)); get_viewport().set_input_as_handled()
	elif event.keycode == KEY_SPACE: end_turn(); get_viewport().set_input_as_handled()
	elif event.keycode == KEY_Z: undo_card()
	elif event.keycode == KEY_ENTER and focus != null and focus.get_meta("card_id", -1) != -1:
		for card: Dictionary in game_state.hand:
			if card.id == focus.get_meta("card_id"): _inspect_card(card); break

func _collect_focus(node: Node, output: Array[Control]) -> void:
	if node is Control and node.focus_mode == Control.FOCUS_ALL and node.is_visible_in_tree() and not (node is BaseButton and node.disabled): output.append(node)
	for child: Node in node.get_children(): _collect_focus(child, output)

func _cancel_drag() -> void:
	if drag.is_empty(): _hide_preview(); return
	var data: Dictionary = drag
	var had_prediction: bool=not drag_prediction.is_empty()
	drag = {}; drag_prediction = {}
	_return_drag(data)
	if had_prediction and scene!=null: _rows(); _update_formula_preview()
	if data.touch: _hide_preview()

static func _click(event: InputEvent) -> bool:
	return event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed or event is InputEventScreenTouch and event.pressed

func _inspect_card(card: Dictionary) -> void:
	var type: String=card.get("type","")
	var content: VBoxContainer=_open_modal(C.TOOLS[type].name if not type.is_empty() else C.CARD_NAMES[int(card.v)])
	var holder: Control=Control.new(); holder.custom_minimum_size=Vector2(400,600); content.add_child(holder)
	_card(card,holder,{"x":0,"y":0},2.0,false).mouse_filter=Control.MOUSE_FILTER_IGNORE
	if not type.is_empty(): _paragraph(content,TOOL_HELP[type])
	var close: Button=Button.new(); close.flat=true; close.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT); holder.add_child(close); close.pressed.connect(_close_modal)
	content.gui_input.connect(func(event: InputEvent) -> void:
		if _click(event): _close_modal())

func _preview_card(card: Dictionary, center_x: float) -> void:
	_hide_preview()
	var factor: float=float(layout.inspect.scale)
	preview=Control.new(); overlay.add_child(preview); preview.mouse_filter=Control.MOUSE_FILTER_IGNORE
	preview.position=Vector2(clampf(center_x-100.0*factor,8.0,float(layout.width)-200.0*factor-8.0),layout.inspect.bottom-300.0*factor)
	_card(card,preview,{"x":0,"y":0},factor,false).mouse_filter=Control.MOUSE_FILTER_IGNORE
	var lines: Array[String]=[]
	var colors: Array[Color]=[]
	if card.has("type"): lines.append(TOOL_HELP[card.type]); colors.append(Color(art.manifest.palette.text))
	if _playing():
		var entry: Dictionary=_predict_card(card)
		lines.append("现在打出：%s · 预计 %s" % [C.REACTION_NAMES[entry.k],C.format_full(entry.damage)]); colors.append(Color(art.manifest.palette.accent))
		for effect: Dictionary in entry.get("effects",[]):
			if not RC.RULES.has(effect.id): continue
			var text: String="出手提前 1 回合" if effect.id in ["bite","bell"] else "红宝石算 0" if effect.id=="hug" else str(effect.text)
			lines.append("%s：%s" % [RC.RULES[effect.id].name,text]); colors.append(Color(art.manifest.palette.text))
	if lines.is_empty(): return
	var width: float=0.0
	for line: String in lines: width=maxf(width,art.font.get_string_size(line,HORIZONTAL_ALIGNMENT_LEFT,-1,28).x+40.0)
	width=minf(640.0,width)
	var height: float=24.0
	for line: String in lines: height+=maxf(1.0,ceil(art.font.get_string_size(line,HORIZONTAL_ALIGNMENT_LEFT,-1,28).x/maxf(1.0,width-40.0)))*28.0*1.35
	var info: Panel=Panel.new(); info.mouse_filter=Control.MOUSE_FILTER_IGNORE; info.position=Vector2((200.0*factor-width)/2.0,-height-12.0); info.size=Vector2(width,height); preview.add_child(info)
	var style: StyleBoxFlat=StyleBoxFlat.new(); style.bg_color=Color(14.0/255.0,12.0/255.0,20.0/255.0,0.92); style.border_color=Color(art.manifest.palette.accentDark); style.set_border_width_all(2); style.set_corner_radius_all(12); info.add_theme_stylebox_override("panel",style)
	var y: float=12.0
	for index: int in range(lines.size()):
		var line_height: float=maxf(1.0,ceil(art.font.get_string_size(lines[index],HORIZONTAL_ALIGNMENT_LEFT,-1,28).x/maxf(1.0,width-40.0)))*28.0*1.35
		var label: Label=_label(lines[index],{"x":20,"y":y,"w":width-40.0,"h":line_height},28,info,true)
		label.add_theme_color_override("font_color",colors[index]); y+=line_height

func _hide_preview() -> void:
	if is_instance_valid(preview): preview.queue_free()
	preview = null

func play_card(index: int, from: Variant = null) -> void:
	if transition or striking or screen == "home" or index < 0 or index >= game_state.hand.size(): return
	if not run_state.is_empty() and run_state.phase != "battle": return
	_cancel_drag()
	var prior: Dictionary = game_state.duplicate(true)
	var painted_score: float = display_score
	var old_rule: Variant = R.current_rule(run_state) if not run_state.is_empty() else null
	var countdown_before: int = int(run_state.monster.countdown) if not run_state.is_empty() else 0
	var entry: Dictionary = R.play_run_card(run_state,index) if not run_state.is_empty() else C.play_card(game_state,index)
	if entry.is_empty(): return
	var drawn: Array=_new_cards(prior.hand)
	for added: Dictionary in drawn: pending_draw_ids[added.id]=true
	_persist(); _render(); _animate_score(painted_score, float(game_state.turnDmg))
	var node: Control = row_nodes.get(entry.id)
	var sound_index: int = game_state.row.size() - 1
	if entry.get("type", "") == "shadow": sound.shadow(maxi(0, sound_index - 1))
	else: sound.play_card(sound_index)
	if is_instance_valid(node):
		if entry.has("type"): node.play_card_art()
		if entry.get("type","")=="mirror": _present_mirror(node,int(entry.id))
		var destination: Vector2 = node.position
		if from is Vector2:
			_animate(180.0, func(t: float) -> void:
				if is_instance_valid(node): node.position = from.lerp(destination, 1.0-pow(1.0-t, 2.0)))
		_animate(120.0, func(t: float) -> void:
			if is_instance_valid(node): node.position.y = destination.y + 6.0*(t/0.42 if t<0.42 else 1.0-(t-0.42)/0.58))
	var same_relic: bool = false
	for effect: Dictionary in entry.get("effects", []):
		if effect.id == "same": same_relic = true
	var doubled: bool = entry.m2 >= entry.m * 2 and (entry.k in ["shun", "white"] or entry.get("type", "") == "lens" or same_relic)
	art.play(multiplier, "double" if doubled else "up")
	var badge: Control = multiplier
	var badge_scale: Vector2 = badge.scale
	badge.pivot_offset = badge.size / 2.0
	_animate(300.0, func(t: float) -> void:
		if is_instance_valid(badge):
			var pulse: float = sin(t * PI)
			badge.scale = badge_scale * Vector2(maxf(0.01, absf(cos(t * TAU))) if doubled else 1.0, 1.0) * (1.0 + (0.25 if doubled else 0.1) * pulse))
	if doubled: sound.double(sound_index)
	var color: String = str(art.manifest.palette.mix.get(str(entry.v), art.manifest.palette.text))
	if entry.k != "plain":
		var positions: Array = L.row_positions(game_state.row, layout)
		var point: Dictionary = positions[-1]
		_effect("fx_" + str(entry.k), Vector2(point.x, point.y + L.row_size(layout).h / 2.0), color, 1.3 if entry.k == "white" else 1.0)
		if entry.k == "white": sound.white()
	_present_effects(entry, countdown_before, old_rule)
	if float(entry.get("rainbow", 0.0)) > 0.0:
		sound.rainbow()
		var chain: Array[Control] = []
		for card: Dictionary in game_state.row:
			if card.get("rb", false) and row_nodes.has(card.id): chain.append(row_nodes[card.id])
		for chain_index: int in range(chain.size()):
			var item: Control = chain[chain_index]
			_animate(120.0, func(t: float) -> void:
				if is_instance_valid(item): item.modulate = Color(1.0+0.8*sin(t*PI),1.0+0.8*sin(t*PI),1.0+0.8*sin(t*PI)), Callable(), chain_index * 60.0)
		_later(maxf(0.0, (chain.size()-1) * 60.0 + 120.0), func() -> void:
			_shake("large"); _effect("fx_rainbow", Vector2(layout.width/2.0, layout.height/2.0), "", 2.0)
			_float_damage("彩虹 +"+C.format_full(entry.rainbow), float(entry.rainbow), Vector2(layout.floating.x, layout.floating.y), true))
	if entry.get("type", "") == "hammer": _effect("fx_slam", Vector2((layout.rowStart.x+layout.rowRight)/2.0, layout.rowStart.y+L.row_size(layout).h), color, 1.5)
	for index_grown: int in entry.get("grown", []):
		_effect("fx_grow", layout.growth.centers[index_grown], art.manifest.palette.gem[C.GEMS[index_grown].key].mid)
	if not drawn.is_empty(): _later(300.0,func() -> void: _reveal_drawn_hand(drawn),true)

func _reveal_drawn_hand(cards: Array) -> void:
	for card: Dictionary in cards: pending_draw_ids.erase(card.id)
	_hand()
	_draw_animation(cards,140.0)

func _animate_score(from: float, to: float) -> void:
	score_generation += 1
	var generation: int = score_generation
	display_score = maxf(0.0, from)
	if is_instance_valid(score_label): score_label.text = C.format_full(display_score)
	_animate(300.0, func(t: float) -> void:
		if generation == score_generation and is_instance_valid(score_label):
			display_score = floor(maxf(0.0, from + (to-from)*(1.0-pow(1.0-t,3.0)))+0.5)
			score_label.text = C.format_full(display_score))

func _update_countdown(value: int, tick: bool = false) -> void:
	if run_state.is_empty(): return
	if is_instance_valid(monster) and run_state.monster.key == "clock":
		art.set_slot_text(monster, "countdown_slot", value)
		if tick: art.play(monster, "tick")
	if is_instance_valid(countdown_text): countdown_text.text = str(value)
	if is_instance_valid(countdown_art):
		art.set_stay(countdown_art, "warn" if value <= 1 and not run_state.monster.broken else null)
		if tick: art.play(countdown_art, "tick")
	if tick and is_instance_valid(countdown_text):
		var label: Label = countdown_text
		label.pivot_offset = label.size / 2.0
		_animate(300.0, func(t: float) -> void:
			if is_instance_valid(label): label.scale = Vector2.ONE * (1.0+0.3*(1.0-t)))

func _repeat_tool_feedback(entry: Dictionary, node: Control, index: int) -> void:
	if is_instance_valid(node): node.play_card_art()
	var type: String = entry.get("type", "")
	if type == "hourglass": sound.hourglass(); _update_countdown(int(run_state.monster.countdown), true)
	elif type == "whistle": sound.whistle()
	else:
		sound.play_card(index)
		if type == "hammer": _effect("fx_slam", Vector2((layout.rowStart.x+layout.rowRight)/2.0, layout.rowStart.y+L.row_size(layout).h), art.manifest.palette.mix.get(str(entry.v), ""), 1.5)
		if type == "lens": art.play(multiplier, "double"); sound.double(index)
		if type == "stone":
			for gem: Dictionary in C.GEMS: _effect("fx_grow", layout.growth.centers[C.GEMS.find(gem)], art.manifest.palette.gem[gem.key].mid)

func _present_effects(entry: Dictionary, countdown_before: int, old_rule: Variant) -> void:
	if run_state.is_empty(): return
	var wound_down: bool = false
	var hastened: bool = false
	for effect: Dictionary in entry.get("effects", []):
		var id: String = effect.id
		if id == "hourglass": sound.hourglass()
		elif id == "seal": sound.seal()
		elif id == "whistle": sound.whistle()
		if effect.get("text", "") in ["手里拿不下了", "牌堆里没有额外牌"]: _toast(effect.text)
		if id == "twice":
			var node: Control = row_nodes.get(entry.id)
			_later(150.0, func() -> void: _repeat_tool_feedback(entry, node, game_state.row.size()-1),true,[node])
		if relic_nodes.has(id):
			var icon: Control = relic_nodes[id]
			_animate(200.0, func(t: float) -> void:
				if is_instance_valid(icon): icon.scale = Vector2.ONE * (1.0+0.3*sin(t*PI)); icon.modulate = Color(1.0+0.7*sin(t*PI),1.0+0.7*sin(t*PI),1.0+0.7*sin(t*PI)))
		if id == "layers":
			art.play(monster,"layer"); art.play(rule_sign,"flip"); sound.rule("layer")
			if old_rule != null:
				art.set_slot_text(rule_sign, "rule_text", RC.RULES[old_rule].name)
				_later(200.0, func() -> void:
					if is_instance_valid(rule_sign):
						var rule: Variant = R.current_rule(run_state)
						if rule != null: art.set_slot_text(rule_sign, "rule_text", RC.RULES[rule].name); art.set_slot_icon(rule_sign,"icon_slot","rule_"+str(rule)))
		elif id in ["bite", "hug", "bell"]:
			sound.rule(id); hastened = hastened or id in ["bite", "bell"]
			if id != "hug": art.play(monster, "bite" if id == "bite" else "ring")
			if is_instance_valid(rule_sign):
				var sign: Control = rule_sign
				var origin: Vector2 = sign.position
				_animate(300.0, func(t: float) -> void:
					if is_instance_valid(sign): sign.position.x = origin.x + sin(t*TAU)*5.0)
		elif id == "wind":
			wound_down = effect.get("text", "") == "发条松完"
			art.play(monster, "unwind"); sound.rule("wound_down" if wound_down else "unwind")
			if wound_down: art.set_stay(monster, "wound_down")
	if wound_down or hastened or countdown_before != int(run_state.monster.countdown): _update_countdown(int(run_state.monster.countdown), true)

func undo_card() -> void:
	var painted: float=display_score
	if transition or striking or screen == "home": return
	_cancel_drag(); animations.clear()
	if run_state.is_empty(): C.undo(game_state)
	else: R.undo_run(run_state); game_state = run_state.game
	_persist(); _render(); _animate_score(painted,float(game_state.turnDmg))

func rewind_to(index: int) -> void:
	if transition or striking: return
	while game_state.row.size() > index:
		if run_state.is_empty(): C.undo(game_state)
		else: R.undo_run(run_state); game_state = run_state.game
	_persist(); _render()

func _ease_cubic(progress: float, x1: float, y1: float, x2: float, y2: float) -> float:
	if progress<=0.0: return 0.0
	if progress>=1.0: return 1.0
	var low: float=0.0
	var high: float=1.0
	for iteration: int in range(40):
		var at: float=(low+high)/2.0
		var inverse: float=1.0-at
		var x: float=3.0*inverse*inverse*at*x1+3.0*inverse*at*at*x2+at*at*at
		if x<progress: low=at
		else: high=at
	var t: float=(low+high)/2.0
	return 3.0*(1.0-t)*(1.0-t)*t*y1+3.0*(1.0-t)*t*t*y2+t*t*t

func _draw_frame(progress: float, from: Vector2, start_scale: float, angle: float) -> Dictionary:
	var middle: Vector2=Vector2(from.x*0.45,from.y*0.45-DRAW.arc)
	var middle_scale: float=(start_scale+1.0)/2.0+0.06
	if progress<0.55:
		var t: float=progress/0.55
		return {"translation":from.lerp(middle,t),"rotation":lerpf(-8.0,angle-4.0,t),"scale":lerpf(start_scale,middle_scale,t)}
	var t: float=(progress-0.55)/0.45
	return {"translation":middle.lerp(Vector2.ZERO,t),"rotation":lerpf(angle-4.0,angle,t),"scale":lerpf(middle_scale,1.0,t)}

func _hide_hand_face(node: Control, back: Node) -> void:
	var faces: Array[int]=[]
	for child: Node in node.get_children():
		if child is CanvasItem and child!=back and child.name!="TwiceBadge": child.visible=false; faces.append(child.get_instance_id())
	node.set_meta("draw_faces",faces)

func _reveal_hand_face(node: Control) -> void:
	var back: Node=node.get_node_or_null("DealingCardBack")
	if back!=null: node.remove_child(back); back.queue_free()
	for identity: int in node.get_meta("draw_faces",[]):
		if is_instance_id_valid(identity):
			var face: Object=instance_from_id(identity)
			if face is CanvasItem: face.visible=true
	if node.has_meta("draw_faces"): node.remove_meta("draw_faces")
	node.set_meta("draw_active",false)

func _clear_hand_draws() -> void:
	for node: Control in hand_nodes.values():
		if is_instance_valid(node): _reveal_hand_face(node)

func _apply_draw_frame(node: Control, frame: Dictionary) -> void:
	var factor: float=float(node.get_meta("hand_factor",layout.hand.scale))
	var point: Vector2=node.get_meta("layout_origin",Vector2.ZERO)
	node.position=point-node.pivot_offset*(Vector2.ONE-Vector2.ONE*factor)+frame.translation
	node.rotation_degrees=float(frame.rotation)
	node.scale=Vector2.ONE*factor*float(frame.scale)

func _draw_animation(cards: Array, interval: float = DRAW.interval) -> void:
	for index: int in range(cards.size()):
		var card: Dictionary=cards[index]
		var target: Control=hand_nodes.get(card.id)
		if target==null: continue
		var existing: Node=target.get_node_or_null("DealingCardBack")
		if existing!=null: target.remove_child(existing); existing.queue_free()
		var back: Control=art.create("card_back"); back.name="DealingCardBack"; back.size=target.size; back.mouse_filter=Control.MOUSE_FILTER_IGNORE
		_hide_hand_face(target,back); target.add_child(back); target.set_meta("draw_active",true)
		var factor: float=float(target.get_meta("hand_factor",layout.hand.scale))
		var extent: Vector2=target.size*factor
		var point: Vector2=target.get_meta("layout_origin")
		var from: Vector2=Vector2(layout.deck.x+layout.deck.w/2.0,layout.deck.y+layout.deck.h/2.0)-point-extent/2.0
		var start_scale: float=minf(1.0,float(layout.deck.w)*0.9/extent.x)
		var angle: float=float(target.get_meta("hand_rotation",0.0))
		var delay: float=index*interval
		_apply_draw_frame(target,_draw_frame(0.0,from,start_scale,angle))
		_animate(DRAW.fly,func(t: float) -> void:
			_apply_draw_frame(target,_draw_frame(_ease_cubic(t,0.25,0.7,0.35,1.0),from,start_scale,angle)),Callable(),delay,true,true,[target])
		_later(delay,func() -> void:
			sound.draw()
			var deck: Button=scene.find_child("DeckButton",true,false)
			if deck!=null:
				deck.pivot_offset=deck.size/2.0
				_animate(140.0,func(t: float) -> void:
					if is_instance_valid(deck): deck.scale=Vector2.ONE*(1.0+0.12*(t*2.0 if t<0.5 else (1.0-t)*2.0)),Callable(),0.0,true,false,[deck]),true,[target])
		_later(delay+DRAW.fly,func() -> void:
			_apply_draw_frame(target,{"translation":Vector2.ZERO,"rotation":angle,"scale":1.0})
			_animate(DRAW.flip,func(t: float) -> void:
				var eased: float=_ease_cubic(t,0.42,0.0,0.58,1.0)
				var base: float=float(target.get_meta("hand_factor",layout.hand.scale))
				target.rotation_degrees=angle; target.scale=Vector2(base*maxf(0.001,absf(1.0-2.0*eased)),base),func() -> void:
				var base: float=float(target.get_meta("hand_factor",layout.hand.scale))
				target.scale=Vector2.ONE*base; target.rotation_degrees=float(target.get_meta("hand_rotation",angle)),0.0,true,true,[target])
			_later(DRAW.flip/2.0,func() -> void: _reveal_hand_face(target),true,[target]),true,[target])

func _is_big_hit(entry: Dictionary) -> bool:
	var threshold: float = float(run_state.monster.maxHp) * 0.1 if not run_state.is_empty() else 20000.0
	return float(entry.damage) >= threshold or entry.k == "white" or float(entry.get("rainbow", 0)) > 0.0 or entry.get("type", "") == "hammer"

func _strike_gaps(count: int) -> Array[float]:
	var gaps: Array[float] = []
	var total: float = 0.0
	for index: int in range(count):
		var gap: float = maxf(STRIKE.minGap, STRIKE.firstGap * pow(STRIKE.decay, index))
		gaps.append(gap); total += gap
	var fit: float = minf(1.0, STRIKE.maxTotal / maxf(1.0, total))
	for index: int in range(gaps.size()): gaps[index] *= fit
	return gaps

func end_turn() -> void:
	if striking: _skip_strike(); return
	if transition or screen == "home" or (not run_state.is_empty() and run_state.phase != "battle"): return
	_cancel_drag(); _close_modal()
	if game_state.row.is_empty(): _settle_turn(); return
	_clear_row_overlays(); _clear_hand_draws(); pending_draw_ids.clear(); epoch+=1; _clear_timers()
	animations.clear(); clock.reset(); clock.configure(prefs)
	for child: Node in fx.get_children(): child.queue_free()
	striking = true; strike_skip = false; strike_generation += 1
	if is_instance_valid(end_button): end_button.disabled=true
	if is_instance_valid(undo_button): undo_button.disabled=true
	strike_hp = float(run_state.monster.turnStartHp) if not run_state.is_empty() else -1.0
	var entries: Array = game_state.row.duplicate(true)
	var gaps: Array[float] = _strike_gaps(entries.size())
	var generation: int = strike_generation
	await _wait_strike(STRIKE.lead, generation)
	for index: int in range(entries.size()):
		if generation != strike_generation or not striking: return
		_hit_entry(entries[index], index)
		await _wait_strike(gaps[index], generation)
	var hold: float = STRIKE.breakHold if not run_state.is_empty() and run_state.monster.broken else STRIKE.hold
	await _wait_strike(hold + (120.0 if _is_big_hit(entries[-1]) else 0.0), generation)
	if generation != strike_generation or not striking: return
	striking = false; strike_hp = -1.0; _settle_turn()

func _skip_strike() -> void:
	if not striking: return
	strike_generation += 1; striking = false; strike_skip = true; strike_hp = -1.0
	_clear_row_overlays(); _clear_hand_draws(); pending_draw_ids.clear(); epoch+=1; _clear_timers()
	animations.clear(); clock.reset(); clock.configure(prefs)
	for child: Node in fx.get_children(): child.queue_free()
	_settle_turn()

func _wait_strike(ms: float, generation: int) -> void:
	var elapsed: float = 0.0
	while elapsed < ms and striking and generation==strike_generation:
		await get_tree().process_frame
		if not striking or generation!=strike_generation: return
		elapsed += get_process_delta_time() * 1000.0

func _effect(id: String, point: Variant, color: Variant = "", factor: float = 1.0) -> Control:
	var at: Vector2 = point if point is Vector2 else Vector2(float(point.x), float(point.y))
	var node: Control = art.effect(id, fx, at.x, at.y, color)
	if node != null:
		node.pivot_offset = node.size / 2.0
		node.scale = Vector2.ONE * factor
	return node

func _monster_hit_point() -> Vector2:
	if not is_instance_valid(monster): return Vector2(layout.dummyAnchor.x, layout.dummyAnchor.y)
	var definition: Dictionary = monster.definition
	var point: Array = definition.get("hitPoint", [monster.size.x / 2.0, monster.size.y / 2.0])
	return stage.get_global_transform().affine_inverse() * (monster.get_global_transform() * Vector2(float(point[0]), float(point[1])))

func _float_damage(text: String, damage: float, at: Vector2, rainbow: bool = false) -> void:
	float_index += 1
	var font_size: int = 80 if damage > 1000000.0 else 60 if damage >= 10000.0 else 44
	var number: Label = _label(text, {"x":at.x - 240.0 + float(float_index % 3 - 1) * 32.0,"y":at.y - (80.0 if rainbow else 0.0),"w":480,"h":110}, font_size, fx, true)
	if damage > 1000000.0: number.add_theme_color_override("font_color", Color(art.manifest.palette.accent))
	if rainbow: number.add_theme_color_override("font_color", Color(art.manifest.palette.mix["5"]))
	number.pivot_offset = number.size / 2.0
	var origin: Vector2 = number.position
	_animate(900.0, func(t: float) -> void:
		if is_instance_valid(number):
			number.position.y = origin.y - 120.0 * t
			number.modulate.a = 1.0 - t, func() -> void:
		if is_instance_valid(number): number.queue_free(), 0.0, true, true)
	_animate(280.0, func(t: float) -> void:
		if is_instance_valid(number): number.scale = Vector2.ONE * (lerpf(0.6, 1.3, t / 0.45) if t < 0.45 else lerpf(1.3, 1.0, (t - 0.45) / 0.55)), Callable(), 0.0, true, true)

func _hit_entry(entry: Dictionary, index: int) -> void:
	var before: float = strike_hp
	if not run_state.is_empty(): strike_hp -= float(entry.damage)
	var pierce: bool = not run_state.is_empty() and before > 0.0 and strike_hp <= 0.0
	var big: bool = _is_big_hit(entry)
	var hit: Vector2 = _monster_hit_point()
	sound.hit(big); sound.play_card(index)
	if pierce: sound.pierce()
	if is_instance_valid(monster): art.play(monster, "hit_big" if big else "hit")
	_float_damage(C.format_full(entry.damage), float(entry.damage), hit)
	if float(entry.get("rainbow", 0)) > 0.0: _float_damage("彩虹 +" + C.format_full(entry.rainbow), float(entry.rainbow), Vector2(layout.floating.x, layout.floating.y), true)
	_effect("fx_hit", hit, art.manifest.palette.mix.get(str(entry.v), art.manifest.palette.text), 1.25 if big else 1.0)
	if pierce:
		art.set_stay(monster, "daze"); _effect("fx_kill", hit, "", 1.5)
	clock.freeze(120.0 if big else 60.0)
	if pierce: clock.slow(300.0)
	_shake("large" if pierce else "medium" if big else "small")
	var motion: Control = monster_motion if is_instance_valid(monster_motion) else monster
	if is_instance_valid(motion):
		var origin: Vector2 = motion.position
		var distance: float = 32.0 if big else 16.0
		_animate(380.0, func(t: float) -> void:
			if is_instance_valid(motion):
				var amount: float = t / (50.0 / 380.0) if t < 50.0 / 380.0 else 1.0 if t < 130.0 / 380.0 else lerpf(1.0, -0.12, (t - 130.0 / 380.0) / (0.86 - 130.0 / 380.0)) if t < 0.86 else lerpf(-0.12, 0.0, (t - 0.86) / 0.14)
				motion.position = origin + Vector2(distance, -distance) * amount, Callable(), 0.0, true)
		var hold: float = 80.0 if big else 16.0
		_animate(hold + 80.0, func(t: float) -> void:
			if is_instance_valid(motion):
				var brightness: float = 2.2 if t * (hold + 80.0) < hold else lerpf(2.2, 1.0, (t * (hold + 80.0) - hold) / 80.0)
				motion.modulate = Color(brightness, brightness, brightness), Callable(), 0.0, true)
	_update_hp()
	if row_nodes.has(entry.id):
		var node: Control = row_nodes[entry.id]
		var origin: Vector2 = node.position
		var original_scale: Vector2 = node.scale
		_animate(220.0, func(t: float) -> void:
			if is_instance_valid(node):
				node.position.y = origin.y - STRIKE.lift * sin(t * PI)
				node.scale = original_scale * (1.0 + 0.08 * sin(t * PI))
				node.modulate = Color(1.0 + 0.5 * sin(t * PI), 1.0 + 0.5 * sin(t * PI), 1.0 + 0.5 * sin(t * PI)), Callable(), 0.0, true)

func _shake(level: String) -> void:
	if not prefs.shake: return
	var definition: Dictionary={"small":{"pixels":3.0,"ms":150.0},"medium":{"pixels":8.0,"ms":250.0},"large":{"pixels":14.0,"ms":380.0}}[level]
	var p: float=definition.pixels
	var points: Array[Vector2]=[Vector2.ZERO,Vector2(p,-p*0.5),Vector2(-p,p*0.5),Vector2(p*0.6,p*0.3),Vector2(-p*0.3,-p*0.2),Vector2.ZERO]
	var origin: Vector2=stage.position
	_animate(definition.ms,func(t: float) -> void:
		var at: float=t*5.0
		var index: int=mini(4,int(floor(at)))
		stage.position=origin+points[index].lerp(points[index+1],at-float(index)),func() -> void: stage.position=origin,0.0,true)

func _fly_cards(nodes: Array, interval: float) -> void:
	for index: int in range(nodes.size()):
		var source: Control = nodes[index]
		if not is_instance_valid(source) or source.get("card_data") == null: continue
		var point: Vector2 = source.get_meta("layout_origin", source.position)
		var copy: Control = _card(source.card_data, fx, {"x":point.x,"y":point.y}, float(source.scale.y), true)
		var origin: Vector2 = copy.position
		var initial_scale: Vector2 = copy.scale
		_animate(250.0, func(t: float) -> void:
			if is_instance_valid(copy):
				copy.position = origin.lerp(Vector2(layout.deck.x, layout.deck.y), t*t)
				copy.scale = initial_scale * lerpf(1.0, 0.3, t)
				copy.modulate.a = 1.0-t, func() -> void:
			if is_instance_valid(copy): copy.queue_free(), index*interval, true, true)

func _settle_turn() -> void:
	_cancel_drag(); _close_modal()
	var old_hand: Array = game_state.hand.duplicate(true)
	var old_hearts: int = int(run_state.hearts) if not run_state.is_empty() else 0
	var broken: bool = not run_state.is_empty() and bool(run_state.monster.broken)
	var countdown_before: int = int(run_state.monster.countdown) if not run_state.is_empty() else 0
	var fly: Array = row_nodes.values()
	if broken: fly.append_array(hand_nodes.values())
	_fly_cards(fly, 60.0 if broken else 30.0)
	if run_state.is_empty(): C.end_turn(game_state)
	else:
		if R.rule_sealed(run_state): sound.unseal()
		R.end_run_turn(run_state); game_state = run_state.game
	_persist()
	if broken: _death_transition(old_hearts); return
	if not run_state.is_empty() and int(run_state.hearts) < old_hearts:
		attacking = true; losing_heart = old_hearts - 1
		transition = run_state.get("result") != null
		_render(); _update_countdown(0)
		if is_instance_valid(monster): art.play(monster,"attack")
		var motion: Control = monster_motion
		var origin: Vector2 = motion.position if motion != null else Vector2.ZERO
		_animate(800.0, func(t: float) -> void:
			if is_instance_valid(motion):
				var ms: float = t*800.0
				var amount: float = 0.0 if ms <= 250.0 else (ms-250.0)/80.0 if ms < 330.0 else 1.0 if ms <= 450.0 else 1.0-(ms-450.0)/350.0
				motion.position = origin + Vector2(0,40.0*amount)
				motion.scale = Vector2.ONE * (1.0+0.3*amount), Callable(), 0.0, true)
		_later(330.0, func() -> void:
			_attack_vignette(); _shake("large"); sound.heart_lose(); _effect("fx_attack",Vector2(layout.width/2.0,layout.height/2.0),"",2.0)
			if losing_heart >= 0 and losing_heart < heart_nodes.size(): art.play(heart_nodes[losing_heart],"lose"))
		_later(1100.0, func() -> void:
			transition = false; attacking = false; losing_heart = -1
			if run_state.get("result") != null:
				if is_instance_valid(monster): art.play(monster,"hit_big")
				_later(700.0, _render)
			else:
				_render(); _update_countdown(int(run_state.monster.countdown), true); _draw_animation(_new_cards(old_hand)))
	else:
		_render(); _draw_animation(_new_cards(old_hand))
		if not run_state.is_empty() and countdown_before != int(run_state.monster.countdown): _update_countdown(int(run_state.monster.countdown), true)

func _death_transition(old_hearts: int) -> void:
	transition = true
	for node: Control in row_nodes.values(): node.hide()
	for node: Control in hand_nodes.values(): node.hide()
	if is_instance_valid(multiplier): multiplier.hide()
	if is_instance_valid(monster):
		art.set_stay(monster, null)
		var defeated: Control = monster
		var duration: float = art.play(defeated, "die")
		_later(duration, func() -> void:
			if is_instance_valid(defeated): defeated.queue_free())
	_later(300.0, func() -> void:
		_effect("fx_overkill", layout.floating, "", 1.5)
		_float_damage("超杀 " + R.format_overkill(run_state.monster.overkill), 0.0, Vector2(layout.floating.x, layout.floating.y)))
	var finish: Callable = func() -> void:
		transition = false; _render(); _enter_fight_feedback()
	if run_state.phase == "relic" and not run_state.relics.is_empty():
		_later(1800.0, func() -> void:
			for index: int in range(old_hearts, int(run_state.hearts)):
				_later((index-old_hearts)*150.0, func() -> void:
					_heal_feedback(index))
			_later(1200.0, finish))
	elif int(run_state.hearts) > old_hearts:
		_later(1800.0, func() -> void:
			_heal_feedback(old_hearts)
			_later(800.0, finish))
	else: _later(1800.0, finish)

func _heal_feedback(index: int) -> void:
	var h: Dictionary=layout.hearts
	var heart: Control=_art("ui_heart",{"x":h.x+index*(h.size+h.gap),"y":h.y,"w":h.size,"h":h.size},fx)
	heart.pivot_offset=heart.size/2.0
	art.play(heart,"gain"); sound.heal()
	_effect("fx_heal",Vector2(h.x+index*(h.size+h.gap)+h.size/2.0,h.y+h.size/2.0))
	_animate(300.0,func(t: float) -> void:
		if is_instance_valid(heart): heart.scale=Vector2.ONE*(1.0+0.25*sin(t*PI)))
	_later(500.0,func() -> void:
		if is_instance_valid(heart): heart.queue_free())

func _enter_fight_feedback() -> void:
	if run_state.is_empty() or run_state.phase != "battle": return
	if is_instance_valid(monster_motion):
		var motion: Control = monster_motion
		motion.modulate.a = 0.0
		_animate(500.0, func(t: float) -> void:
			if is_instance_valid(motion): motion.modulate.a=t; motion.position.y=40.0*(1.0-t))
	_banner("第 %d 仗" % run_state.fight)
	_draw_animation(game_state.hand)
	for id: String in ["start2","slow","first2"]:
		if relic_nodes.has(id):
			var icon: Control = relic_nodes[id]
			_animate(200.0, func(t: float) -> void:
				if is_instance_valid(icon): icon.scale=Vector2.ONE*(1.0+0.3*sin(t*PI)))
	if run_state.relics.has("slow"): sound.slow_beat(); _update_countdown(int(run_state.monster.countdown),true)

func _new_cards(before: Array) -> Array:
	var result: Array = []
	for card: Dictionary in game_state.hand:
		var found: bool = false
		for old: Dictionary in before:
			if card.id == old.id: found = true; break
		if not found: result.append(card)
	return result

func _loot() -> void:
	_banner("战利品")
	var chest: Control = _anchored("loot_chest",layout.loot.chest,float(layout.monsterScale.normal))
	art.set_stay(chest,"open")
	var animate_loot: bool = last_loot_fight != int(run_state.fight)
	if animate_loot:
		last_loot_fight = int(run_state.fight)
		art.stop(chest); art.play(chest,"drop")
		_later(500.0,func() -> void:
			if is_instance_valid(chest): art.set_stay(chest,"open"))
	var positions: Array = layout.loot.four if run_state.loot.size()==4 else layout.loot.three
	for index: int in range(run_state.loot.size()):
		var card: Dictionary = C.create_tool_card(run_state.loot[index],-1-index)
		var node: Control = _card(card,scene,positions[index],layout.loot.scale,false)
		node.pivot_offset = node.size/2.0
		node.position = Vector2(positions[index].x,positions[index].y)-node.pivot_offset*(Vector2.ONE-node.scale)
		loot_cards.append(node)
		if animate_loot:
			var faces: Array[CanvasItem] = []
			for child: Node in node.get_children():
				if child is CanvasItem: child.visible=false; faces.append(child)
			var back: Control = art.create("card_back")
			back.name="LootCardBack"; back.size=node.size; back.mouse_filter=Control.MOUSE_FILTER_IGNORE; node.add_child(back)
			var destination: Vector2=node.position
			var scale_at: Vector2=node.scale
			var translation: Vector2=Vector2(layout.loot.chest.x-positions[index].x,layout.loot.chest.y-positions[index].y)
			node.modulate.a=0.0
			_animate(400.0,func(t: float) -> void:
				if is_instance_valid(node): node.modulate.a=t; node.position=destination+translation*(1.0-t); node.scale=scale_at*lerpf(0.3,1.0,t),Callable(),700.0+index*120.0)
			_later(1100.0+index*120.0,func() -> void:
				if not is_instance_valid(node): return
				_animate(300.0,func(t: float) -> void:
					if is_instance_valid(node): node.scale=Vector2(scale_at.x*maxf(0.001,absf(1.0-2.0*t)),scale_at.y))
				_later(150.0,func() -> void:
					if is_instance_valid(back): back.queue_free()
					for face: CanvasItem in faces:
						if is_instance_valid(face): face.visible=true))
		_selectable(node,index==selected_loot,func() -> void: selected_loot=index; _render(),{},"loot")
	_label("选了「%s」，点“拿”放进牌组" % C.TOOLS[run_state.loot[selected_loot]].name if selected_loot>=0 else "超杀 %s！多一张可选" % R.format_overkill(run_state.monster.overkill) if float(run_state.monster.overkill)>=float(RC.RUN.lootBonusOverkill) else "选一张，再点“拿”",layout.loot.hint,30,null,true)
	_button("不拿",layout.loot.skip,func() -> void: _take_loot(-1))
	_button("拿",layout.loot.take,func() -> void: _take_loot(selected_loot),true).disabled=selected_loot<0

func _take_loot(index: int) -> void:
	if transition or run_state.phase!="loot": return
	if index>=run_state.loot.size(): return
	var cards: Array[Control]=loot_cards.duplicate()
	_reset(); transition=true
	if index<0: R.skip_loot(run_state)
	else: R.choose_loot(run_state,index)
	game_state=run_state.game; _persist()
	for at: int in range(cards.size()):
		var node: Control=cards[at]
		if not is_instance_valid(node): continue
		if at==index:
			var positions: Array=layout.loot.four if cards.size()==4 else layout.loot.three
			var raw: Vector2=Vector2(positions[at].x,positions[at].y)-node.pivot_offset*(Vector2.ONE-Vector2.ONE*float(layout.loot.scale))
			var destination: Vector2=raw+Vector2(layout.deck.x-positions[at].x,layout.deck.y-positions[at].y)
			var origin: Vector2=raw+Vector2(0,-40)
			node.position=origin; node.scale=Vector2.ONE*float(layout.loot.scale)*1.15
			_animate(500.0,func(t: float) -> void:
				if is_instance_valid(node): node.position=origin.lerp(destination,t); node.scale=Vector2.ONE*float(layout.loot.scale)*lerpf(1.15,0.3,t); node.modulate.a=1.0-t)
		else:
			node.modulate.a=1.0
			_animate(300.0,func(t: float) -> void:
				if is_instance_valid(node): node.modulate.a=1.0-t)
	if index>=0:
		var deck: Button=_round("牌库",layout.deck,Callable(),"ui_icon_deck"); deck.disabled=true
		var count: Label=_label(str(run_state.cards.size()),{"x":layout.deck.x+layout.deck.w-44,"y":layout.deck.y+layout.deck.h-44,"w":52,"h":44},28)
		count.pivot_offset=count.size/2.0
		_animate(300.0,func(t: float) -> void:
			if is_instance_valid(count): count.scale=Vector2.ONE*lerpf(1.4,1.0,t))
	_later(500.0,func() -> void: transition=false; selected_loot=-1; _render(); _enter_fight_feedback())

func _doors() -> void:
	_banner("挑一扇门")
	var options: Array = R.door_options(run_state)
	for index: int in range(options.size()):
		var option: Dictionary = options[index]
		var point: Dictionary = layout.doors.points[index]
		var door: Control = _anchored("ui_door",point,layout.doors.scale)
		door_nodes.append(door)
		_anchored("mon_"+option.monster,point,layout.doors.monsterScale)
		var sign: Control = _art("ui_rule_sign",{"x":point.x-layout.doors.reward.w/2.0,"y":point.y+layout.doors.reward.dy,"w":layout.doors.reward.w,"h":layout.doors.reward.h})
		art.set_slot_text(sign,"rule_text",{"card":"额外牌","shop":"工坊","heal":"回一颗心"}[option.reward]); art.set_slot_icon(sign,"icon_slot","ui_reward_"+option.reward)
		var rule: Control = _art("ui_rule_sign",{"x":point.x-layout.doors.ruleSign.w/2.0,"y":point.y+layout.doors.ruleSign.dy,"w":layout.doors.ruleSign.w,"h":layout.doors.ruleSign.h})
		art.set_slot_text(rule,"rule_text",RC.RULES[option.rule].name); art.set_slot_icon(rule,"icon_slot","rule_"+option.rule)
		_selectable(door,index == selected_door,func() -> void: selected_door = index; _render(),{},"door")
	if selected_door >= 0:
		var option: Dictionary = options[selected_door]
		_panel(layout.doors.detail)
		_label("%s · %s\n%s · %s\n打赢拿：%s" % [RC.MONSTERS[option.monster].name,RC.MONSTERS[option.monster].line,RC.RULES[option.rule].name,RC.RULES[option.rule].text,{"card":"额外牌，三张里挑一张。","shop":"进一次工坊，扔牌或者抄牌。","heal":"回一颗心。"}[option.reward]],layout.doors.detail,30)
	else: _label("点门看看打谁、赢了拿什么",layout.doors.hint,30,null,true)
	_button("进这扇门",layout.doors.enter,_enter_door,true).disabled = selected_door < 0

func _enter_door() -> void:
	if selected_door < 0 or transition: return
	transition = true; sound.door_open()
	if selected_door < door_nodes.size(): art.play(door_nodes[selected_door], "open")
	R.choose_door(run_state,selected_door); game_state = run_state.game; selected_door = -1; _persist()
	_later(600,func() -> void: transition = false; _render(); _enter_fight_feedback())

func _shop() -> void:
	_banner("扔牌：挑 1–3 张" if shop_mode == "drop" else "抄牌：挑 1 张" if shop_mode == "copy" else "工坊")
	var status: Dictionary = R.shop_state(run_state)
	if shop_mode.is_empty():
		_button("扔牌\n从整副牌里扔掉 1–3 张。\n现在 %d 张，最少留 20 张" % run_state.cards.size(),layout.shop.ops[0],func() -> void:
			if status.canDrop: shop_mode = "drop"; shop_selected = []; _render()
			else: _toast("牌已经只剩 20 张，不能再扔"))
		_button("抄牌\n挑 1 张，多一张一模一样的。\n每种额外牌最多带 2 张",layout.shop.ops[1],func() -> void:
			if status.canCopy: shop_mode = "copy"; shop_selected = []; _render()
			else: _toast("这种牌已经带满 2 张，不能再抄"))
		_button("不用了",layout.loot.skip,_confirm_shop_skip)
		return
	var scroll: ScrollContainer = ScrollContainer.new(); scroll.name="ShopGrid"; _place(scroll,layout.shop.grid,scene)
	scroll.set_deferred("scroll_vertical",shop_scroll)
	var grid: GridContainer = GridContainer.new(); grid.columns = maxi(1,int(layout.shop.grid.w/(200*layout.shop.gridScale+24))); grid.add_theme_constant_override("h_separation",24); grid.add_theme_constant_override("v_separation",32); scroll.add_child(grid)
	var groups: Dictionary = {}
	var order: Array = C.TOOL_TYPES.duplicate(); order.append_array([1,2,4,3,6,5,7,0])
	for key: Variant in order:
		var list: Array = []
		for card: Dictionary in run_state.cards:
			if (key is String and card.get("type", "") == key) or (not key is String and not card.has("type") and card.v == key): list.append(card)
		if not list.is_empty(): groups[str(key)] = list
	for key: String in groups:
		var group: Array = groups[key]
		var card: Dictionary = group[0]
		var holder: Control = Control.new(); holder.custom_minimum_size = Vector2(200*layout.shop.gridScale,300*layout.shop.gridScale+44); grid.add_child(holder)
		var view: Control = _card(card,holder,{"x":0,"y":0},layout.shop.gridScale,true)
		var selected: int = 0
		for item: Dictionary in group:
			if shop_selected.has(item.id): selected += 1
		_label("选了 %d" % selected if selected > 0 else "×%d" % group.size(),{"x":0,"y":300*layout.shop.gridScale,"w":200*layout.shop.gridScale,"h":40},25,holder,true)
		_selectable(holder,selected > 0,func() -> void:
			if shop_mode == "copy":
				if not R.can_copy_card(run_state,card.id): _toast("这种牌已经带满 2 张，不能再抄"); return
				shop_selected = [] if shop_selected.has(card.id) else [card.id]
			elif selected == group.size():
				for item: Dictionary in group: shop_selected.erase(item.id)
			elif shop_selected.size() >= status.maxDrop:
				if selected > 0:
					for item: Dictionary in group: shop_selected.erase(item.id)
				else: _toast("整副牌最少留 20 张" if status.maxDrop < 3 else "最多扔 3 张")
			else:
				for item: Dictionary in group:
					if not shop_selected.has(item.id): shop_selected.append(item.id); break
			shop_scroll=scroll.scroll_vertical
			_render(), card,"shop")
	_button("换个做法",layout.shop.back,func() -> void: shop_mode = ""; shop_selected = []; _render())
	_button("扔掉这 %d 张" % shop_selected.size() if shop_mode == "drop" else "抄这张",layout.shop.confirm,_confirm_shop,true).disabled = shop_selected.is_empty()

func _confirm_shop_skip() -> void:
	var content: VBoxContainer=_open_modal("什么都不做就走？")
	_modal_action(content,"走",func() -> void:
		_close_modal()
		if not run_state.is_empty(): R.shop_skip(run_state)
		_finish_shop())
	_modal_action(content,"再看看",_close_modal)

func _card_nodes(node: Node) -> Array[Control]:
	var found: Array[Control] = []
	if node is Control and node.get_script() == CardView: found.append(node)
	for child: Node in node.get_children(): found.append_array(_card_nodes(child))
	return found

func _confirm_shop() -> void:
	if transition or run_state.phase != "shop" or shop_selected.is_empty(): return
	transition=true
	var mode: String=shop_mode
	var copies: Array[Control]=[]
	var available: Array[Control]=_card_nodes(scene)
	for identity: int in shop_selected:
		var selected: Dictionary={}
		for card: Dictionary in run_state.cards:
			if card.id==identity: selected=card; break
		for source: Control in available:
			if source.card_data.get("type", "")==selected.get("type", "") and source.card_data.v==selected.v:
				var point: Vector2=stage.get_global_transform().affine_inverse()*(source.get_global_transform()*Vector2.ZERO)
				copies.append(_card(selected,fx,{"x":point.x,"y":point.y},float(layout.shop.gridScale),true))
				break
	if mode=="drop": R.shop_drop(run_state,shop_selected)
	else: R.shop_copy(run_state,shop_selected[0])
	_persist()
	for index: int in range(copies.size()):
		var node: Control=copies[index]
		var origin: Vector2=node.position
		_later(index*120.0,func() -> void:
			if mode=="drop": sound.shop_remove()
			else: sound.shop_copy())
		_animate(400.0,func(t: float) -> void:
			if is_instance_valid(node):
				if mode=="drop": node.position.y=origin.y+lerpf(-20.0,float(layout.height),t); node.modulate.a=1.0-t
				else: node.position.x=origin.x+40.0*sin(t*PI); node.modulate=Color(1.0+0.7*sin(t*PI),1.0+0.7*sin(t*PI),1.0+0.7*sin(t*PI)), Callable(),index*120.0,true)
	_later(800.0+maxf(0.0,(copies.size()-1)*120.0),_finish_shop)

func _finish_shop() -> void:
	game_state=run_state.game; shop_mode=""; shop_selected=[]; transition=false; shop_scroll=0
	animations.clear()
	for child: Node in fx.get_children(): child.queue_free()
	_persist(); _render(); _enter_fight_feedback()

func _result_label(parent: Node, text: String, font_size: int = 28, color: Color = Color.WHITE, wrap: bool = false) -> Label:
	var label: Label=Label.new()
	label.mouse_filter=Control.MOUSE_FILTER_IGNORE
	label.autowrap_mode=TextServer.AUTOWRAP_WORD_SMART if wrap else TextServer.AUTOWRAP_OFF
	label.vertical_alignment=VERTICAL_ALIGNMENT_CENTER
	label.add_theme_font_size_override("font_size",font_size)
	label.add_theme_color_override("font_color",Color(art.manifest.palette.text) if color==Color.WHITE else color)
	parent.add_child(label)
	label.text=text
	return label

func _result_row(parent: VBoxContainer, label: String, value: String, record: bool = false, last: bool = false) -> Label:
	var row: Container=HFlowContainer.new() if layout.name=="portrait" else HBoxContainer.new()
	row.name="ResultRow"+str(parent.get_child_count())
	row.add_theme_constant_override("separation",18)
	row.add_theme_constant_override("h_separation",18); row.add_theme_constant_override("v_separation",0)
	row.size_flags_horizontal=Control.SIZE_EXPAND_FILL
	parent.add_child(row)
	var name_label: Label=_result_label(row,label)
	name_label.size_flags_horizontal=Control.SIZE_SHRINK_BEGIN
	var number: Label=_result_label(row,value,26 if last else 28)
	number.name="Value"
	number.size_flags_horizontal=Control.SIZE_EXPAND_FILL
	number.horizontal_alignment=HORIZONTAL_ALIGNMENT_RIGHT
	var available: float=float(parent.get_meta("available_width",layout.result.panel.w-96.0))
	if layout.name=="portrait" and number.get_combined_minimum_size().x>available:
		number.autowrap_mode=TextServer.AUTOWRAP_WORD_SMART; number.custom_minimum_size.x=available; number.size.x=available
	if record:
		var badge: Label=_result_label(row,"新纪录",26,Color(art.manifest.palette.accent))
		badge.name="NewRecord"
	var original_y: Array[float]=[NAN]
	row.modulate.a=0.0
	var index: int=parent.get_child_count()-1
	_animate(300.0,func(t: float) -> void:
		if is_instance_valid(row):
			if is_nan(original_y[0]): original_y[0]=row.position.y
			row.modulate.a=t; row.position.y=original_y[0]+12.0*(1.0-t),Callable(),index*300.0)
	return number

func _result_count(number: Label, value: float, formatter: Callable, order: int) -> void:
	for step: int in range(11):
		_later((order+1)*300.0+step*30.0,func() -> void:
			if is_instance_valid(number): number.text=formatter.call(value*float(step)/10.0))

func _result() -> void:
	var result: Dictionary=run_state.result
	var panel: Control=_panel(layout.result.panel,scene,48)
	panel.name="ResultPanel"
	var origin: Vector2=panel.position
	panel.modulate.a=0.0
	_animate(400.0,func(t: float) -> void:
		if is_instance_valid(panel): panel.position.y=origin.y+60.0*(1.0-t); panel.modulate.a=t)
	var scroll: ScrollContainer=ScrollContainer.new()
	scroll.name="ResultScroll"; scroll.horizontal_scroll_mode=ScrollContainer.SCROLL_MODE_DISABLED
	scroll.position=Vector2(48,24); scroll.size=panel.size-Vector2(96,48); panel.add_child(scroll)
	var content: VBoxContainer=VBoxContainer.new()
	content.name="ResultContent"; content.size_flags_horizontal=Control.SIZE_EXPAND_FILL
	content.custom_minimum_size=Vector2(scroll.size.x,scroll.size.y)
	content.alignment=BoxContainer.ALIGNMENT_CENTER
	content.add_theme_constant_override("separation",24 if layout.name=="portrait" else 8)
	scroll.add_child(content)
	var knocker: Label=_result_label(content,"老门环：行，这回算你的。龙叼着宝石往长廊里跑了，长廊的门过些日子才开。" if result.outcome=="victory" else "老门环：倒在%s手上了。身上的宝物，龙收下了。" % RC.MONSTERS[result.monster].name,26,Color.WHITE,true)
	knocker.add_theme_constant_override("line_spacing",8)
	var heading: String="倒在第 %d 仗 · %s" % [result.fight,RC.MONSTERS[result.monster].name] if result.outcome=="defeat" else "通关！ 新纪录" if result.newRecords.farthest else ""
	if not heading.is_empty():
		var title: Label=_result_label(content,heading,32,Color(art.manifest.palette.accent))
		if art.bold_font!=null: title.add_theme_font_override("font",art.bold_font)
	var rows: VBoxContainer=VBoxContainer.new()
	rows.name="ResultRows"; rows.set_meta("available_width",scroll.size.x); rows.add_theme_constant_override("separation",24 if layout.name=="portrait" else 8); content.add_child(rows)
	_result_row(rows,"打了 %d 回合" % result.totalTurns,"")
	var best: Label=_result_row(rows,"最高一回合","%s   第 %d 仗" % [C.format_full(result.bestTurn),result.bestFight],result.newRecords.bestTurn)
	best.name="BestTurnValue"
	_result_count(best,float(result.bestTurn),func(value: float) -> String: return "%s   第 %d 仗" % [C.format_full(value),result.bestFight],0)
	var overkill: Label=_result_row(rows,"最大超杀",R.format_overkill(result.maxOverkill),result.newRecords.maxOverkill)
	overkill.name="OverkillValue"
	_result_count(overkill,float(result.maxOverkill),func(value: float) -> String: return R.format_overkill(value),1)
	var damage: Label=_result_row(rows,"总伤害",C.format_full(result.totalDamage))
	damage.name="TotalDamageValue"
	_result_count(damage,float(result.totalDamage),func(value: float) -> String: return C.format_full(value),2)
	_result_row(rows,"宝石","红 %s · 绿 %s · 蓝 %s" % [C.FORMS[int(result.gemForms[0])],C.FORMS[int(result.gemForms[1])],C.FORMS[int(result.gemForms[2])]])
	var extras: Array[String]=[]
	for type: String in C.TOOL_TYPES:
		var count: int=0
		for card: Dictionary in result.extraCards:
			if card.type==type: count+=1
		if count>0: extras.append(C.TOOLS[type].name+(" ×%d" % count if count>1 else ""))
	_result_row(rows,"拿到的额外牌","没有" if extras.is_empty() else " · ".join(extras))
	_result_row(rows,"进了几次工坊",str(run_state.shopsVisited))
	_result_row(rows,"带了几件宝物",str(run_state.relics.size()),false,true)
	_button("回首页",layout.result.home,go_home)
	_button("再来一局",layout.result.again,start_adventure,true)
	var banner: Control=Control.new(); banner.name="ResultBanner"; banner.z_index=20; banner.mouse_filter=Control.MOUSE_FILTER_IGNORE
	_place(banner,layout.banner,scene)
	_art("ui_banner",{"x":0,"y":0,"w":layout.banner.w,"h":layout.banner.h},banner)
	_label("胜利" if result.outcome=="victory" else "失败",{"x":0,"y":0,"w":layout.banner.w,"h":layout.banner.h},56,banner,true)

func _open_modal(title: String) -> VBoxContainer:
	var previous_focus: Control = get_viewport().gui_get_focus_owner()
	_cancel_drag(); _close_modal(); modal_return = previous_focus
	modal = Control.new(); modal.set_meta("title",title); modal.size = stage.size; overlay.add_child(modal)
	var shade: ColorRect = ColorRect.new(); shade.color = Color(0,0,0,0.72); shade.size = stage.size; modal.add_child(shade)
	shade.gui_input.connect(func(event: InputEvent) -> void:
		if _click(event): _close_modal())
	var width: float = float(layout.modalWidth)
	var height: float = minf(layout.height-120,1300)
	var box: Dictionary = {"x":(layout.width-width)/2,"y":(layout.height-height)/2,"w":width,"h":height}
	var frame: Control = _panel(box,modal,40)
	var scroll: ScrollContainer = ScrollContainer.new(); scroll.position = Vector2(40,110); scroll.size = Vector2(width-80,height-150); frame.add_child(scroll)
	var content: VBoxContainer = VBoxContainer.new(); content.custom_minimum_size.x = width-105; content.size_flags_horizontal = Control.SIZE_EXPAND_FILL; content.add_theme_constant_override("separation",24); scroll.add_child(content)
	_label(title,{"x":40,"y":20,"w":width-180,"h":70},40,frame)
	_button("×",{"x":width-110,"y":20,"w":70,"h":70},_close_modal,false,"",frame)
	return content

func _close_modal() -> void:
	if is_instance_valid(modal): modal.queue_free()
	modal = null
	if is_instance_valid(modal_return): modal_return.grab_focus()
	modal_return = null

func _paragraph(content: VBoxContainer, text: String, font_size: int = 29) -> Label:
	var node: Label = Label.new(); node.text = text; node.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; node.custom_minimum_size.x = content.custom_minimum_size.x; node.add_theme_font_size_override("font_size",font_size); content.add_child(node)
	return node

func _modal_action(content: VBoxContainer, text: String, action: Callable) -> Button:
	var node: Button = Button.new(); node.text = text; node.custom_minimum_size.y = 70; node.add_theme_font_size_override("font_size",30); content.add_child(node); node.pressed.connect(func() -> void: sound.button(); action.call()); return node

func _text_modal(title: String, paragraphs: Array) -> void:
	var content: VBoxContainer = _open_modal(title)
	for text: String in paragraphs: _paragraph(content,text)

func _confirm(title: String, text: String, label: String, action: Callable) -> void:
	var content: VBoxContainer = _open_modal(title); _paragraph(content,text)
	_modal_action(content,label,func() -> void: _close_modal(); action.call())
	_modal_action(content,"算了",_close_modal)

func _rules_heading(content: VBoxContainer, title: String) -> void:
	var heading: Label=_paragraph(content,title,30)
	heading.add_theme_color_override("font_color",Color(art.manifest.palette.textDim))
	if art.bold_font!=null: heading.add_theme_font_override("font",art.bold_font)

func _show_rules() -> void:
	var content: VBoxContainer=_open_modal("规则")
	var gems: HBoxContainer=HBoxContainer.new(); gems.add_theme_constant_override("separation",24); content.add_child(gems)
	for color: String in ["red","green","blue"]:
		var icon: Control=art.create("gem_icon_"+color); icon.custom_minimum_size=Vector2(48,48); gems.add_child(icon)
	var copy: Dictionary=JSON.parse_string(FileAccess.get_file_as_string("res://data/ui-copy.json"))
	for text: String in copy.rules: _paragraph(content,text)
	for section: Array in copy.sections:
		_rules_heading(content,str(section[0]))
		for index: int in range(1,section.size()): _paragraph(content,str(section[index]))
	_rules_heading(content,"怪的规矩")
	for id: String in RC.RULES: _paragraph(content,RC.RULES[id].name+"："+RC.RULES[id].text)
	if not run_state.is_empty() and not run_state.relics.is_empty():
		_rules_heading(content,"宝物")
		for id: String in run_state.relics: _paragraph(content,RC.RELICS[id].name+"："+RC.RELICS[id].text)

func _show_monster() -> void:
	var m: Dictionary = run_state.monster
	var paragraphs: Array = [RC.MONSTERS[m.key].name,RC.MONSTERS[m.key].line,"血量 %s / %s · 每 %d 回合出手一次" % [C.format_full(m.hp),C.format_full(m.maxHp),m.maxCountdown]]
	var active: Variant = R.current_rule(run_state)
	var ids: Array = ["hug","bite","bell"] if m.key == "dragon" else [active] if active != null else []
	for id: String in ids: paragraphs.append(RC.RULES[id].name+(" · 现在" if id == active else "")+"\n"+RC.RULES[id].text)
	if R.rule_sealed(run_state): paragraphs.append("这回合不算")
	if m.broken: paragraphs.append("打穿了，这回合规矩不再起作用。")
	_text_modal("怪的介绍",paragraphs)

func _show_growth(index: int) -> void:
	var thresholds: Array = E.growth_thresholds(run_state if not run_state.is_empty() else game_state)
	var form: int = C.gem_form(game_state,index)
	var xp: float = game_state.xp[index]
	var next: String = "已经是闪光" if xp >= thresholds[2] else "再用 %d 次变闪光（底数 200）" % (thresholds[2]-xp) if xp >= thresholds[1] else "再用 %d 次变切好（底数 150）" % (thresholds[1]-xp)
	var paragraphs: Array = ["%s · %s · 底数 %d · 用了 %d 次 · %s" % [C.GEMS[index].name,C.FORMS[form],C.gem_value(game_state,index),xp,next]]
	if not game_state.opts.grow: paragraphs.append("成长已关闭，当前按原石计算，使用次数继续记录。")
	_text_modal(C.GEMS[index].name,paragraphs)

func _show_deck() -> void:
	var paragraphs: Array = []
	for mask: int in [1,2,4,3,6,5,7,0]:
		var count: int = 0
		for card: Dictionary in game_state.deck:
			if not card.has("type") and card.v == mask: count += 1
		paragraphs.append("%s  %d 张" % [C.CARD_NAMES[mask],count])
	for type: String in C.TOOL_TYPES:
		var count: int = 0
		for card: Dictionary in game_state.deck:
			if card.get("type") == type: count += 1
		paragraphs.append("%s  %d 张" % [C.TOOLS[type].name,count])
	paragraphs.append("弃牌堆 %d 张" % game_state.discard.size()); _text_modal("牌库",paragraphs)

func _choice(content: VBoxContainer, title: String, key: String, options: Array, labels: Array) -> void:
	_paragraph(content,title)
	var row: HBoxContainer = HBoxContainer.new(); content.add_child(row)
	for index: int in range(options.size()):
		var value: Variant = options[index]
		var button: Button = Button.new(); button.text = labels[index]; button.toggle_mode = true; button.button_pressed = prefs.get(key) == value; button.size_flags_horizontal = Control.SIZE_EXPAND_FILL; button.custom_minimum_size.y = 62; button.add_theme_font_size_override("font_size",28); row.add_child(button)
		button.pressed.connect(func() -> void:
			_reset(); prefs[key] = value
			if key in ["hand","hint","grow","tools"]: C.update_settings(game_state,{key:value})
			if not storage.save_settings(prefs): _storage_warning()
			sound.configure(prefs); clock.configure(prefs); _persist(); _resize(); _show_settings())

func _show_settings() -> void:
	var content: VBoxContainer = _open_modal("设置")
	_choice(content,"声音","sound",[true,false],["开","关"])
	_choice(content,"音量","volume",[1,2,3],["低","中","高"])
	_choice(content,"震屏","shake",[true,false],["开","关"])
	_choice(content,"动画速度","animationSpeed",["normal","fast"],["正常","快"])
	_choice(content,"提示","hint",[true,false],["开","关"])
	_choice(content,"布局","layout",["auto","portrait","landscape"],["自动","竖屏","横屏"])
	if not forced_layout.is_empty(): _paragraph(content,"网址的 layout 参数优先于布局设置。")
	if screen == "practice":
		_choice(content,"手牌","hand",[6,7,8],["6","7","8"])
		_choice(content,"成长","grow",[true,false],["开","关"])
		_choice(content,"额外牌","tools",[false,true],["不带","每种 1 张"])
		_modal_action(content,"成长清零",func() -> void: C.reset_growth(game_state); _close_modal(); _render(); _toast("宝石成长已清零"))
		_modal_action(content,"重新开始",func() -> void: _confirm("重新开始","重新开始会清掉这局的回合、伤害和宝石成长","确认重新开始",start_practice))
		_modal_action(content,"回首页",go_home)
	elif not run_state.is_empty() and run_state.get("result") == null:
		_modal_action(content,"放弃这局",func() -> void: _confirm("放弃这局","放弃以后这局算输，确定吗？","放弃",func() -> void: R.abandon_run(run_state); _persist(); go_home()))
	if debug_enabled: _debug_panel(content)

func _debug_refresh() -> void:
	_reset()
	if not run_state.is_empty(): game_state = run_state.game
	_persist(); _render()

func _debug_input(content: VBoxContainer, title: String, initial: String, action: Callable) -> void:
	_paragraph(content,title)
	var row: HBoxContainer = HBoxContainer.new(); content.add_child(row)
	var input: LineEdit = LineEdit.new(); input.text = initial; input.custom_minimum_size = Vector2(380,64); input.size_flags_horizontal = Control.SIZE_EXPAND_FILL; input.add_theme_font_size_override("font_size",28); row.add_child(input)
	var button: Button = Button.new(); button.text = title; button.add_theme_font_size_override("font_size",26); row.add_child(button); button.pressed.connect(func() -> void: action.call(input.text))

func _debug_panel(content: VBoxContainer) -> void:
	_paragraph(content,"测试入口（仅 debug=1）",36)
	_paragraph(content,"血量倍数 ×%s（新开一局生效）" % RC.RUN.hpScale)
	var scale_row: HBoxContainer = HBoxContainer.new(); content.add_child(scale_row)
	for value: float in [1.0,1.5,2.0,3.0,4.0]:
		var button: Button = Button.new(); button.text = "×%s" % value; scale_row.add_child(button); button.pressed.connect(func() -> void: RC.RUN.hpScale = value; _show_settings())
	_modal_action(content,"直接进工坊",func() -> void:
		if run_state.is_empty(): start_adventure()
		R.debug_enter_shop(run_state); shop_mode = ""; shop_selected = []; _debug_refresh())
	if not run_state.is_empty(): _modal_action(content,"撕掉封条" if R.rule_sealed(run_state) else "给怪贴封条",func() -> void: R.debug_set_sealed(run_state,not R.rule_sealed(run_state)); _debug_refresh())
	var door_picks: Array = []
	for index: int in range(2):
		var row: HBoxContainer = HBoxContainer.new(); content.add_child(row)
		var mon: OptionButton = OptionButton.new(); var reward: OptionButton = OptionButton.new()
		for id: String in RC.RUN.normalMonsters: mon.add_item(RC.MONSTERS[id].name)
		for text: String in ["额外牌","工坊","回一颗心"]: reward.add_item(text)
		mon.selected = index; reward.selected = index; row.add_child(mon); row.add_child(reward); door_picks.append({"monster":mon,"reward":reward})
	_modal_action(content,"指定两扇门",func() -> void:
		if run_state.is_empty(): start_adventure()
		var doors: Array = []
		for pick: Dictionary in door_picks:
			var id: String = RC.RUN.normalMonsters[pick.monster.selected]; doors.append({"monster":id,"rule":RC.MONSTERS[id].rule,"reward":["card","shop","heal"][pick.reward.selected]})
		R.debug_set_doors(run_state,doors); selected_door = -1; _debug_refresh())
	for fight: int in range(1,7):
		_modal_action(content,"第 %d 仗" % fight,func() -> void:
			if run_state.is_empty(): start_adventure()
			if run_state.relics.is_empty(): R.choose_relic(run_state,0)
			R.debug_jump_room(run_state,fight); _debug_refresh())
	if not run_state.is_empty():
		_debug_input(content,"把手牌加到 N 张（最多 12）",str(game_state.hand.size()),func(value: String) -> void: R.debug_fill_hand(run_state,value.to_int()); _debug_refresh())
		if run_state.phase == "battle":
			_debug_input(content,"设怪的血",str(run_state.monster.hp),func(value: String) -> void: R.debug_set_monster_hp(run_state,value.to_float()); _debug_refresh())
			_debug_input(content,"设心（1–%d）" % run_state.maxHearts,str(run_state.hearts),func(value: String) -> void:
				if value.is_valid_int() and int(value) >= 1 and int(value) <= run_state.maxHearts: run_state.hearts = int(value); _debug_refresh())
			_debug_input(content,"设倒计时",str(run_state.monster.countdown),func(value: String) -> void: R.debug_set_countdown(run_state,value.to_int()); _debug_refresh())
			if run_state.monster.maxWind > 0: _debug_input(content,"设发条",str(run_state.monster.wind),func(value: String) -> void: R.debug_set_wind(run_state,value.to_int()); _debug_refresh())
	for id: String in RC.RELICS:
		_modal_action(content,"给宝物："+RC.RELICS[id].name,func() -> void:
			if run_state.is_empty(): start_adventure()
			R.debug_give_relic(run_state,id); _debug_refresh())
	_modal_action(content,"跳到选宝物画面",func() -> void:
		if run_state.is_empty(): start_adventure()
		else: R.debug_relic_selection(run_state); selected_relic = -1; _debug_refresh())
	var ignore_cap: CheckButton = CheckButton.new(); ignore_cap.text = "不管上限"; content.add_child(ignore_cap)
	for type: String in C.TOOL_TYPES:
		_modal_action(content,"给一张"+C.TOOLS[type].name,func() -> void:
			if not run_state.is_empty(): R.debug_give_tool(run_state,type,ignore_cap.button_pressed)
			else:
				if screen != "practice": start_practice()
				var identity: int = 1
				for pile: String in ["deck","hand","row","discard"]:
					for card: Dictionary in game_state[pile]: identity = maxi(identity,int(card.id)+1)
				game_state.hand.append(C.create_tool_card(type,identity)); game_state.hist = []
			_debug_refresh())
	_debug_input(content,"发指定的牌","1,3,2,6,4,5,hammer",func(value: String) -> void:
		var sequence: Array = []
		for piece: String in value.replace("，",",").replace(" ",",").split(",",false): sequence.append(piece.to_int() if piece.is_valid_int() else piece)
		debug_deal(sequence))
	for index: int in DEBUG_SEQUENCES:
		_modal_action(content,"用例 %d 发牌" % index,func() -> void: debug_deal(DEBUG_SEQUENCES[index],index))

func debug_deal(sequence: Array, test: int = 0) -> void:
	if not debug_enabled: return
	if screen not in ["practice","adventure"] or (not run_state.is_empty() and run_state.phase != "battle"): start_practice()
	for value: Variant in sequence:
		if value is String:
			if not C.TOOL_TYPES.has(value): _toast("未知额外牌"); return
		elif not (value is int or value is float) or float(value) != floor(float(value)) or float(value) < 0 or float(value) > 7:
			_toast("宝石位必须是 0–7"); return
	var pool: Array = []
	if not run_state.is_empty():
		for card: Dictionary in run_state.cards: pool.append(C.copy_card(card))
	else:
		for pile: String in ["deck","hand","row","discard"]:
			for card: Dictionary in game_state[pile]: pool.append(C.create_tool_card(card.type,card.id) if card.has("type") else C.copy_card(card))
	var hand: Array = []
	var identity: int = 0
	for card: Dictionary in pool: identity = maxi(identity,int(card.id))
	for value: Variant in sequence:
		var found: int = -1
		for index: int in range(pool.size()):
			if (value is String and pool[index].get("type", "") == value) or (not value is String and not pool[index].has("type") and pool[index].v == value): found=index; break
		if found < 0:
			identity += 1
			var added: Dictionary = C.create_tool_card(value,identity) if value is String else {"id":identity,"v":value}
			hand.append(added)
			if not run_state.is_empty(): run_state.cards.append(C.copy_card(added))
		else: hand.append(pool.pop_at(found))
	game_state.hand=hand; game_state.deck=pool; game_state.row=[]; game_state.discard=[]; game_state.hist=[]; game_state.m=1; game_state.turnDmg=0; game_state.rainbow=false; game_state.chain=[]; game_state.chainIdx=[]; game_state.xp=[10,0,0] if test==11 else [0,0,0]
	if not run_state.is_empty():
		run_state.hist=[]; run_state.monster.broken=false; run_state.monster.hp=run_state.monster.maxHp; run_state.monster.turnStartHp=run_state.monster.hp; run_state.monster.overkill=0; R.debug_set_monster_hp(run_state,run_state.monster.maxHp)
	_debug_refresh()
	if test>0: _toast("用例 %d：按手牌从左到右出牌" % test)

func _toast(text: String) -> void:
	if not is_inside_tree() or _shutting_down: return
	_cancel_timer(active_toast_timer)
	if is_instance_valid(active_toast): active_toast.queue_free()
	var font: Font=art.font if art.font!=null else ThemeDB.fallback_font
	var maximum: float=minf(940.0,2.0*minf(float(layout.toast.x),float(layout.width-layout.toast.x)))
	var width: float=clampf(font.get_string_size(text,HORIZONTAL_ALIGNMENT_LEFT,-1,30).x+56.0,minf(380.0,maximum),maximum)
	var label: Label=Label.new(); label.autowrap_mode=TextServer.AUTOWRAP_WORD_SMART; label.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER; label.vertical_alignment=VERTICAL_ALIGNMENT_CENTER; label.mouse_filter=Control.MOUSE_FILTER_IGNORE; label.add_theme_font_size_override("font_size",30)
	label.size=Vector2(width-56.0,1.0); label.text=text
	var height: float=maxf(60.0,label.get_minimum_size().y+32.0)
	var panel: Control=art.nine_slice("ui_panel",24.0)
	panel.name="Toast"; panel.size=Vector2(width,height); panel.position=Vector2(layout.toast.x-width/2.0,layout.banner.y-height)
	panel.mouse_filter=Control.MOUSE_FILTER_IGNORE; fx.add_child(panel)
	label.position=Vector2(28,16); label.size=Vector2(width-56.0,height-32.0); panel.add_child(label)
	active_toast=panel
	var holder: Array[Control]=[panel]
	panel.modulate.a=0.0
	_animate(180.0,func(t: float) -> void:
		if is_instance_valid(holder[0]): holder[0].modulate.a=t,Callable(),0.0,true,true)
	active_toast_timer=_later(1200.0,func() -> void:
		if is_instance_valid(panel): panel.queue_free()
		if is_same(active_toast,panel): active_toast=null,true)

func _capture_snapshot() -> Dictionary:
	if art_mode: return {"art":inspect_id}
	return {"screen":screen,"run":null if run_state.is_empty() else run_state,"game":game_state}

func _capture_scenario() -> void:
	var scenario: String = capture.get("scenario","home")
	var result_bottom: bool=scenario=="victory-bottom"
	if result_bottom: scenario="victory"
	if scenario != "home" and not art_mode:
		debug_enabled = true; start_adventure()
		if scenario == "practice": start_practice()
		elif scenario == "relic": pass
		else:
			R.choose_relic(run_state,0); game_state = run_state.game
			if scenario == "shop": R.debug_enter_shop(run_state)
			elif scenario == "doors": R.debug_jump_room(run_state,2)
			elif scenario == "elite-relic":
				R.debug_jump_room(run_state,3); R.debug_set_monster_hp(run_state,0); R.end_run_turn(run_state)
			elif scenario in ["victory","defeat"]:
				if scenario == "victory": R.debug_jump_room(run_state,6); R.debug_set_monster_hp(run_state,0); R.end_run_turn(run_state)
				else: run_state.hearts = 1; R.debug_set_countdown(run_state,0); R.end_run_turn(run_state)
			elif scenario == "loot": R.debug_set_monster_hp(run_state,0); R.end_run_turn(run_state)
			else:
				debug_deal([1,3,2,6,4,5,"hammer"])
				if scenario == "broken": R.debug_set_monster_hp(run_state,1)
				play_card(0); play_card(0)
				if scenario == "strike": end_turn()
			game_state = run_state.game; _persist(); _render()
	await get_tree().create_timer(1.0 if scenario != "strike" else 0.12).timeout
	if scenario != "strike":
		var deadline: int = Time.get_ticks_msec()+8000
		while not animations.is_empty() and Time.get_ticks_msec() < deadline: await get_tree().process_frame
		await get_tree().create_timer(0.1).timeout
	if result_bottom:
		var scroll: ScrollContainer=scene.find_child("ResultScroll",true,false)
		if scroll!=null: scroll.scroll_vertical=int(scroll.get_v_scroll_bar().max_value)
		await get_tree().process_frame
	await RenderingServer.frame_post_draw
	if capture.has("path"):
		var texture: Image = get_viewport().get_texture().get_image()
		texture.save_png(capture.path)
		var state_file: FileAccess=FileAccess.open(str(capture.path).get_basename()+".json",FileAccess.WRITE)
		if state_file!=null: state_file.store_string(JSON.stringify(_capture_snapshot(),"\t",false,true)); state_file.close()
		print("GEMCARD_SCREENSHOT "+capture.path)
		var tree: SceneTree=get_tree()
		await shutdown_presentation()
		queue_free()
		tree.create_timer(0.05).timeout.connect(tree.quit.bind(0),CONNECT_ONE_SHOT)
		return

func shutdown_presentation() -> void:
	if _shutting_down: return
	_shutting_down=true
	_cancel_drag(); _close_modal()
	epoch+=1; scene_epoch+=1; strike_generation+=1
	striking=false; strike_skip=true; transition=false
	_clear_timers(); animations.clear(); set_process(false)
	if sound!=null: sound.dispose(); sound.queue_free(); sound=null
	for layer: Control in [scene,fx,overlay]:
		if is_instance_valid(layer): _clear_layer(layer)
	row_nodes.clear(); row_labels.clear(); hand_nodes.clear(); hand_labels.clear(); pending_draw_ids.clear(); row_preview=null; relic_nodes.clear(); heart_nodes.clear(); door_nodes.clear(); loot_cards.clear()
	end_button=null; undo_button=null; monster=null; monster_motion=null; hp_fill=null; hp_under=null; hp_ghost=null; hp_layers=null; hp_text=null; countdown_text=null; countdown_art=null; multiplier=null; rule_sign=null; score_label=null; formula_text=null; preview=null; active_toast=null; modal_return=null
	await get_tree().process_frame
	await get_tree().process_frame
	if art!=null: art.dispose(); art=null
	clock=null

class GrowthSocket extends Panel:
	var progress: float = 0.0
	var track_color: Color = Color("#6e542b")
	var fill_color: Color = Color("#c2a670")
	func _draw() -> void:
		var center: Vector2 = size / 2.0
		var radius: float = (minf(size.x, size.y) + 12.0) * 0.46
		var line_width: float = (minf(size.x, size.y) + 12.0) * 0.06
		draw_arc(center, radius, -PI / 2.0, TAU - PI / 2.0, 96, track_color, line_width, true)
		if progress > 0.0:
			draw_arc(center, radius, -PI / 2.0, -PI / 2.0 + TAU * clampf(progress, 0.0, 1.0), 96, fill_color, line_width, true)

class DamageGhost extends Control:
	func _draw() -> void:
		draw_rect(Rect2(Vector2.ZERO, size), Color(226.0 / 255.0, 214.0 / 255.0, 186.0 / 255.0, 0.18))
		var diagonal: float = 0.0
		while diagonal < size.x + size.y:
			var a: Vector2 = Vector2(maxf(0.0, diagonal - size.y), minf(size.y, diagonal))
			var b: Vector2 = Vector2(minf(size.x, diagonal), maxf(0.0, diagonal - size.x))
			draw_line(a, b, Color(226.0 / 255.0, 214.0 / 255.0, 186.0 / 255.0, 0.55), 6.0, true)
			diagonal += 12.0

func _notification(what: int) -> void:
	if what in [NOTIFICATION_APPLICATION_FOCUS_OUT, NOTIFICATION_WM_CLOSE_REQUEST] and storage != null and not _shutting_down:
		_cancel_drag()
		_persist()

class PresentationButton extends Button:
	var _seen_disabled: int=-1
	var _disabled_material: ShaderMaterial
	func _process(_delta: float) -> void:
		var state: int=1 if disabled else 0
		if state==_seen_disabled: return
		_seen_disabled=state
		modulate.a=0.5 if disabled else 1.0
		if _disabled_material==null:
			var shader: Shader=Shader.new(); shader.code="shader_type canvas_item; uniform float gray=0.0; void fragment(){ float light=dot(COLOR.rgb,vec3(0.2126,0.7152,0.0722)); COLOR.rgb=mix(COLOR.rgb,vec3(light),gray); }"
			_disabled_material=ShaderMaterial.new(); _disabled_material.shader=shader; material=_disabled_material
		_disabled_material.set_shader_parameter("gray",0.6 if disabled and not get_meta("primary",false) else 0.0)
		_inherit_material(self)
	func _inherit_material(parent: Node) -> void:
		for child: Node in parent.get_children():
			if child is CanvasItem: child.use_parent_material=true
			_inherit_material(child)
