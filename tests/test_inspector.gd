extends RefCounted
const Inspector: GDScript = preload("res://scripts/ui/art_inspector.gd")
const Store: GDScript = preload("res://scripts/art/art_store.gd")
const Layout: GDScript = preload("res://scripts/ui/layout.gd")
var _result: Dictionary = {}

func _check(name: String, condition: bool) -> void:
	_result.names.append(name)
	if condition: _result.passed += 1
	else: _result.failed.append(name); _result.failures.append(name)

static func run(tree: SceneTree) -> Dictionary:
	var suite: RefCounted = load("res://tests/test_inspector.gd").new()
	var result: Dictionary = await suite._run_cases(tree)
	await tree.process_frame
	return result

func _run_cases(tree: SceneTree) -> Dictionary:
	_result = {"passed":0,"failed":[],"names":[],"failures":[]}
	var store: RefCounted = Store.new()
	var inspector: Control = Inspector.new()
	inspector.size = Vector2(1920,1080)
	tree.root.add_child(inspector)
	inspector.setup(store)
	await tree.process_frame
	_check("preserves original assets plus explicit native placeholders and selected preview API",inspector.asset_buttons.size() == store.catalog().size() and inspector.preview != null and inspector.previews.size() > 0)
	for method: String in ["set_filters","set_light_theme","show_composition","play_two_hit_instances"]:
		_check("inspector exposes "+method,inspector.has_method(method))
	if not inspector.has_method("show_composition"):
		inspector.free(); store.dispose(); return _result
	for batch: String in ["all","第1批","第2批","本体第1批","本体第2批"]:
		for changed: bool in [false,true]:
			var expected: int = 0
			for definition: Dictionary in store.catalog():
				if (not changed or definition.get("status","已有") != "已有") and (batch == "all" or definition.get("v2","") == batch or definition.get("batch","") == batch): expected += 1
			inspector.set_filters(changed,batch)
			var actual: int = 0
			for button: Button in inspector.asset_buttons.values():
				if button.visible: actual += 1
			_check("matches H5 filter and count %s / %s" % [batch,changed],actual == expected and inspector.filtered_count == expected)
	inspector.set_filters(false,"all")
	_check("filter treats missing status as 已有",Inspector.matches_asset_filter({},false,"all") and not Inspector.matches_asset_filter({},true,"all"))
	for definition: Dictionary in store.catalog():
		inspector.select_asset(definition.id)
		_check("every manifest item retains selectable preview: "+definition.id,inspector.selected_id == definition.id and inspector.preview != null and inspector.preview.art_id == definition.id)
	inspector.set_light_theme(true)
	_check("light background matches H5 palette text",inspector.get_node("Backdrop").color == Color(store.manifest.palette.text))
	inspector.set_light_theme(false)
	_check("dark background matches H5 page background",inspector.get_node("Backdrop").color == Color(store.manifest.palette.pageBg))
	inspector.select_asset("mon_dragon")
	var monster_samples: int = 5+(1 if store.assets.mon_dragon.definition.get("idle",false) else 0)
	_check("monster retains primary preview and all four H5 layout scale examples",inspector.previews.size() == monster_samples and inspector.preview == inspector.previews[0])
	_check("every monster sample includes anchor and hitPoint cross",inspector.cross_markers.size() == monster_samples*2)
	for marker: Control in inspector.cross_markers:
		var artwork: Control = marker.get_meta("artwork")
		var expected_point: Vector2 = artwork.position+marker.get_meta("point")*(artwork.size/store.dimensions(artwork.definition))-Vector2(8,8)
		_check("anchor/hitPoint cross follows the real preview scale",marker.position == expected_point)
	inspector.select_asset("gem_red_rough")
	_check("idle assets include separate permanently static comparison",inspector.previews.size() == 2 and inspector.previews[1].static_art)
	var static_toggle: CheckButton = inspector.get("_details").get_node("Static")
	static_toggle.button_pressed = true
	_check("static control affects every selected variant",inspector.previews.all(func(item: Control) -> bool: return item.static_art))
	static_toggle.button_pressed = false
	_check("static comparison remains paused after returning primary to idle",not inspector.preview.static_art and inspector.previews[1].static_art)
	inspector.select_asset("mon_clock")
	await tree.process_frame
	for item: Control in inspector.previews:
		_check("pre-tree clock sizing scales live slots with the PNG: "+str(item.size),item.get("_slot_root").scale == item.size/store.dimensions(item.definition))
	var sign: Control = store.create("ui_rule_sign")
	sign.size = Vector2(420,132)
	var sign_text: Label = store.set_slot_text(sign,"rule_text","咬手")
	var sign_icon: TextureRect = store.set_slot_icon(sign,"icon_slot","rule_bite")
	tree.root.add_child(sign)
	store.play(sign,"flip"); store.clock.advance(0.12); sign.sync_clock()
	var sign_scale: Vector2 = sign.size/store.dimensions(sign.definition)
	var scale_transform: Transform2D = Transform2D(Vector2(sign_scale.x,0),Vector2(0,sign_scale.y),Vector2.ZERO)
	var text_holder: Node2D = sign.slot_holder("rule_text")
	var icon_holder: Node2D = sign.slot_holder("icon_slot")
	var text_point: Array = sign.definition.slots.rule_text
	var text_expected: Vector2 = sign.get_global_transform()*scale_transform*text_holder.transform*Vector2(text_point[0],text_point[1])
	var icon_expected: Vector2 = sign.get_global_transform()*scale_transform*icon_holder.transform*Vector2(48,44)
	_check("pre-tree scaling applies to both animated sign slot roots",sign.get("_slot_root").scale == sign_scale)
	_check("animated sign text follows scaled exported slot matrix",(sign_text.get_global_transform()*(sign_text.size/2.0)).is_equal_approx(text_expected))
	_check("animated sign icon follows scaled exported slot matrix",(sign_icon.get_global_transform()*(sign_icon.size/2.0)).is_equal_approx(icon_expected))
	sign.free()
	var countdown_values: Control = inspector.get("_details").get_node("CountdownValues")
	countdown_values.get_child(0).pressed.emit()
	_check("countdown buttons update every moving slot",inspector.previews.all(func(item: Control) -> bool: return item.slot_holder("countdown_slot").get_node("Value").text == "1"))
	for id: String in ["table_cloth","ui_panel","ui_hp_frame"]:
		inspector.select_asset(id)
		_check("three actual-size nine-slice samples: "+id,inspector.slice_samples.size() == 3)
		for sample: Control in inspector.slice_samples: _check("nine-slice preserves declared actual pixel size "+id,sample.size == sample.get_meta("sample_size"))
	inspector.select_asset("fx_hit")
	var effects: Array = inspector.play_two_hit_instances()
	_check("fx_hit creates two independent self-removing instances",effects.size() == 2 and effects[0] != effects[1] and effects[0].remove_after_action and effects[1].remove_after_action)
	inspector.show_composition("base-cards")
	await tree.process_frame
	var composition: Control = inspector.composition
	_check("base cards cover eight masks at all three H5 scales",composition.base_cards.size() == 24)
	for index: int in range(composition.base_cards.size()):
		var card: Control = composition.base_cards[index]
		var factor: float = [0.75,1.4,2.0][int(index/8)]
		_check("base card mask and actual scale %d" % index,card.card_data.v == [1,2,4,3,6,5,7,0][index%8] and card.scale == Vector2.ONE*factor and card.get_parent().custom_minimum_size == Vector2(200,300)*factor)
	for form: int in range(4):
		composition.set_base_form(form)
		_check("base growth selector updates all 24 cards: %d" % form,composition.base_cards.size() == 24 and composition.base_form == form)
		var white: Control = composition.base_cards[6]
		_check("base growth uses H5 values: %d" % form,white.tooltip_text.contains(["300","450","600","450"][form]))
	inspector.show_composition("tool-cards")
	await tree.process_frame
	composition = inspector.composition
	var expected_tools: Array = preload("res://rules/run_config.gd").LEGACY_TOOL_POOL + ["palette","potion","diamond"]
	_check("all nine legacy and three new tools have animated hand and paused table compositions",composition.tool_pairs.size() == 12 and expected_tools.all(func(id: String) -> bool: return composition.tool_pairs.has(id)))
	for pair: Dictionary in composition.tool_pairs.values(): _check("tool table stays paused after transient play",not pair.hand.static_art and pair.row.static_art and pair.row.card_data.has("k"))
	composition.set_mirror_mask(1)
	_check("mirror selector changes resolved table gems while hand remains unknown",composition.tool_pairs.mirror.row.card_data.v == 1 and composition.tool_pairs.mirror.hand.tooltip_text.contains("底数 ?"))
	_check("tool play button restarts both play animations",composition.play_tool("mirror") == 600.0 and composition.tool_pairs.mirror.row.static_art)
	store.clock.advance(0.7)
	var mirror_art: Control = composition.tool_pairs.mirror.row.get("_artwork")
	mirror_art.sync_clock()
	_check("paused table tool returns to idle frame zero after play",mirror_art.action_name == "idle" and mirror_art.frame_index == 0 and mirror_art.static_art)
	inspector.show_composition("composed-ui")
	await tree.process_frame
	composition = inspector.composition
	_check("UI composition has two backs, banner, three HP samples and three hearts",composition.ui_parts.backs.size() == 2 and composition.ui_parts.hp.size() == 3 and composition.ui_parts.hearts.size() == 3 and composition.ui_parts.banner.size == Vector2(600,140))
	for i: int in range(3): _check("HP composition exact H5 percentage %s" % [100,37,0][i],composition.ui_parts.hp[i].get_meta("percentage") == [100,37,0][i])
	inspector.show_composition("door-scenes")
	await tree.process_frame
	composition = inspector.composition
	_check("door compositions cover both exact layout tables",composition.door_scenes.size() == 2)
	_check("door compositions contain delivered new artwork",composition.issues.is_empty())
	for key: String in ["portrait","landscape"]:
		var scene: Dictionary = composition.door_scenes[key]
		var layout: Dictionary = Layout.base(key)
		_check("door stage keeps real layout extent "+key,scene.stage.size == Vector2(layout.width,layout.doors.hint.y))
		_check("right door remains open and can replay "+key,store.get_stay(scene.doors[1]) == "open" and composition.replay_right_door(key) == 600.0)
		_check("door rewards use H5 card/heal labels "+key,scene.rewards[0].get_meta("reward_text") == "额外牌" and scene.rewards[1].get_meta("reward_text") == "回一颗心")
		if scene.monsters.size() == 2:
			_check("door monsters use delivered new style "+key,scene.monsters.all(func(node: Control) -> bool: return node.definition.get("artStyle", "") == "fable-carbon-remake" and not node.get_meta("inspector_placeholder",false)))
		else: _check("both delivered monsters are present "+key,false)
	inspector.select_asset("ui_rainbow_slot")
	var rainbow_live: Array[Control] = inspector.previews.filter(func(item: Control) -> bool: return not item.get_meta("sample_static",false))
	_check("composition navigation preserves six colors and the new idle static comparison",inspector.preview != null and inspector.selected_id == "ui_rainbow_slot" and rainbow_live.map(func(item: Control) -> String: return item.entry_key) == ["1","3","2","6","4","5"] and inspector.previews.size() == 7 and inspector.previews[6].static_art)
	inspector.play_asset_event("out")
	_check("rainbow out clears every persistent light state as H5",inspector.previews.all(func(item: Control) -> bool: return store.get_stay(item).is_empty()))
	inspector.free(); store.dispose()
	return _result
