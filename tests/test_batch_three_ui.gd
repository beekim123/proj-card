extends RefCounted
const Main: GDScript = preload("res://scripts/app/game.gd")
const H: GDScript = preload("res://tests/test_batch_three_helpers.gd")
var passed: int = 0
var failures: Array[String] = []
func check(ok: bool, label: String) -> void:
	if ok: passed += 1
	else: failures.append(label)
func run() -> Dictionary:
	var tree: SceneTree = Engine.get_main_loop()
	var old_dir: String = OS.get_environment("GEMCARD_SAVE_DIR")
	OS.set_environment("GEMCARD_SAVE_DIR",ProjectSettings.globalize_path("res://artifacts/batch-3/ui-"+str(Time.get_ticks_usec())))
	var app: Control = Main.new(); app.fixed_seed = 1979; tree.root.add_child(app); await tree.process_frame
	check(app.has_method("_difficulty"),"difficulty page exists")
	if failures.is_empty():
		app.prefs.sound = false; app.sound.configure(app.prefs)
		for direction: String in ["landscape","portrait"]:
			app.forced_layout = direction; app._resize(); app.screen = "difficulty"; app._render(); await tree.process_frame
			check(app.scene.find_child("Tier1",true,false).disabled and not app.scene.find_child("Tier0",true,false).disabled,direction+" locked tiers")
			check_difficulty_text_fit(app,direction+" locked")
			app.records.fullWins = 1; app.records.bestClearedTier = 0; app.records.wins = 1; app.records.played = 1; app.storage.save_records(app.records)
			app._render(); await tree.process_frame; check(not app.scene.find_child("Tier2",true,false).disabled,direction+" unlocked tier2")
			check_difficulty_text_fit(app,direction+" unlocked")
			await review_regressions(app,direction)
			await resumed_countdown_regression(app,direction)
			app._open_difficulty()
			app.selected_tier = 2; app._confirm_difficulty(); check(app.run_state.difficulty.tier == 2 and app.prefs.tier == 2,direction+" selected tier confirmed and remembered")
			app.run_state = H.full_victory(); app.game_state = app.run_state.game; app._persist(); app._render(); await tree.process_frame
			check(app.scene.find_child("BigGem",true,false) != null,direction+" trophy visible")
			app.go_home(); app.screen = "collection"; app._render(); await tree.process_frame
			check(app.scene.find_child("CollectionCount",true,false).text.contains("/19"),direction+" nineteen collection")
			check(app._farthest_text(18) == "宝库已过",direction+" full frontier text")
			app.records = preload("res://rules/run.gd").create_records(); app.storage.save_records(app.records)
		for id: String in ["mon_tree","mon_armor","rule_regrow","rule_cap","relic_link","relic_shine","relic_guard","relic_rbheal","relic_biggem","bg_tile_vault","prop_coins","prop_urn"]: check(app.art.assets.has(id),"native placeholder "+id)
		for scenario: String in ["difficulty-locked","difficulty-unlocked","vault-regrow","vault-cap","vault-dragon","act2-choice","victory","victory-save-pending","collection-top","collection-bottom"]:
			app._reset(); app.run_state = {}; app.saved_run = {}; app.pending_settlements.clear()
			app.storage = preload("res://scripts/app/persistence.gd").new(ProjectSettings.globalize_path("res://artifacts/batch-3/capture-fixture-"+scenario+"-"+str(Time.get_ticks_usec())))
			app.records = app.storage.load_records(); app.debug_enabled = true
			check(app._prepare_batch_three_capture(scenario),"capture prepares "+scenario)
			var snapshot: Dictionary = app._capture_snapshot()
			check(snapshot.has("records") and snapshot.has("profile") and snapshot.has("viewState"),"actual sidecar metadata "+scenario)
			if scenario.begins_with("difficulty-") or scenario.begins_with("collection-"):
				var fixture_wins: int = 0 if scenario == "difficulty-locked" else 3
				check(snapshot.records.fullWins == fixture_wins and snapshot.records.bestClearedTier == (-1 if fixture_wins == 0 else 4),"capture persists actual unlock records "+scenario)
			if scenario == "victory-save-pending":
				check(not app.run_state.result.recordsApplied and snapshot.records.fullWins == 0,"persistent failure really pending")
				for direction: String in ["landscape","portrait"]:
					app.forced_layout = direction; app._resize(); await tree.process_frame
					var warning: Control = app.scene.find_child("SettlementWarning",true,false)
					var pending_retry: Button = app.scene.find_child("RetrySettlement",true,false)
					var scroll: ScrollContainer = app.scene.find_child("ResultScroll",true,false)
					check(warning != null and pending_retry != null,direction+" pending result has named warning and retry")
					if warning != null and pending_retry != null:
						check(scroll.scroll_vertical == 0 and scroll.get_global_rect().encloses(warning.get_global_rect()) and scroll.get_global_rect().encloses(pending_retry.get_global_rect()),direction+" pending warning and retry visible at initial scroll top")
						await click_button(app,pending_retry)
						check(not app.run_state.result.recordsApplied and app.storage.load_records().fullWins == 0 and app.scene.find_child("SettlementWarning",true,false) != null,direction+" retry under persistent failure remains visibly unsaved")
				app.storage.failure_stage = ""; app.storage.failure_remaining = 1
				var retry: Button = app.scene.find_child("RetrySettlement",true,false)
				if retry != null: await click_button(app,retry)
				else: app._settle_records()
				check(app.run_state.result.recordsApplied and app.records.fullWins == 1,"pending retry commits exactly once")
	await app.shutdown_presentation(); app.queue_free(); await tree.process_frame; OS.set_environment("GEMCARD_SAVE_DIR",old_dir)
	return {"passed":passed,"failed":failures.size(),"failures":failures}

func press_key(app: Control, code: Key) -> void:
	for pressed: bool in [true,false]:
		var event: InputEventKey = InputEventKey.new()
		event.keycode = code; event.physical_keycode = code; event.pressed = pressed
		app.get_viewport().push_input(event)
		await app.get_tree().process_frame

func click_button(app: Control, button: Button) -> void:
	var center: Vector2 = button.get_global_rect().get_center()
	for pressed: bool in [true,false]:
		var event: InputEventMouseButton = InputEventMouseButton.new()
		event.position = center; event.button_index = MOUSE_BUTTON_LEFT; event.pressed = pressed
		app.get_viewport().push_input(event,true)
		await app.get_tree().process_frame

func review_regressions(app: Control, direction: String) -> void:
	var tree: SceneTree = app.get_tree()
	for code: Key in [KEY_ENTER,KEY_SPACE]:
		app.prefs.tier = 0; app._open_difficulty(); await tree.process_frame
		app.scene.find_child("Tier0",true,false).grab_focus()
		await press_key(app,KEY_TAB)
		var focus: Control = app.get_viewport().gui_get_focus_owner()
		check(focus != null and focus.name == "Tier1",direction+" Tab reaches next unlocked tier")
		await press_key(app,code)
		check(app.screen == "difficulty" and app.selected_tier == 1,direction+" focused tier activation selects without starting "+str(code))
		if app.screen == "difficulty":
			app.scene.find_child("DifficultyConfirm",true,false).grab_focus()
			await press_key(app,code)
			check(app.screen == "adventure" and app.run_state.difficulty.tier == 1,direction+" focused confirm starts selected tier "+str(code))
		app.prefs.tier = 0; app._open_difficulty(); await tree.process_frame
		await press_key(app,KEY_2); await press_key(app,code)
		check(app.screen == "adventure" and app.run_state.difficulty.tier == 2,direction+" number shortcut then confirmation "+str(code))
	app.prefs.tier = 0; app.start_adventure()
	var rules: GDScript = preload("res://rules/run.gd")
	rules.choose_relic(app.run_state,0); app.game_state = app.run_state.game
	app.game_state.xp = [15,15,15]
	app._show_growth(0)
	check(modal_text(app).contains("变闪光（底数 200）"),direction+" ordinary growth predicts base200")
	app._close_modal(); rules.acquire_relic(app.run_state,"shine"); app._show_growth(0)
	check(modal_text(app).contains("变闪光（底数 300）") and not modal_text(app).contains("底数 200"),direction+" shine growth predicts base300")
	app._close_modal()
	for id: String in preload("res://rules/run_config.gd").RELIC_IDS:
		if app.run_state.relics.size() >= 6: break
		rules.acquire_relic(app.run_state,id)
	rules.debug_jump_act_room(app.run_state,3,6); app.game_state = app.run_state.game; app._render(); await tree.process_frame
	var act_label: Label = null
	for node: Node in app.scene.find_children("*","Label",true,false):
		if node.text.begins_with("宝库 · 第6间"): act_label = node; break
	check(act_label != null,direction+" six relic battle has act label")
	if act_label != null:
		for icon: Control in app.relic_nodes.values():
			check(not icon.get_global_rect().intersects(act_label.get_global_rect()),direction+" six relic icons avoid act label")
	for room: int in [1,3,6]:
		rules.debug_jump_act_room(app.run_state,3,room); app.game_state = app.run_state.game; app._render(); await tree.process_frame
		check_top_regions(app,direction+" vault room "+str(room))
	for countdown: int in [3,1]:
		app.start_adventure(); rules.choose_relic(app.run_state,0)
		rules.debug_jump_act_room(app.run_state,3,1); rules.start_battle(app.run_state,"tree")
		app.run_state.monster.hp = 600; app.run_state.monster.turnStartHp = 1001
		app.run_state.monster.countdown = countdown; app.run_state.hearts = 2
		app.game_state = app.run_state.game; app._render(); await tree.process_frame
		app._settle_turn()
		check(app.run_state.monster.hp == 800 and app.run_state.hearts == (1 if countdown == 1 else 2),direction+" regrow preserves recovery and attack order "+str(countdown))
		var feedback: String = ""
		if is_instance_valid(app.active_toast):
			for node: Node in app.active_toast.find_children("*","Label",true,false): feedback += node.text
		check(feedback.contains("长回去：恢复 200"),direction+" regrow recovery feedback with attack countdown "+str(countdown))
		if countdown == 1: await tree.create_timer(1.3).timeout

func modal_text(app: Control) -> String:
	var lines: PackedStringArray = []
	for node: Node in app.modal.find_children("*","Label",true,false): lines.append(node.text)
	return "\n".join(lines)

func resumed_countdown_regression(app: Control, direction: String) -> void:
	var rules: GDScript = preload("res://rules/run.gd")
	for sample: Array in [[1,"bear",3,"3"],[3,"clock",3,"3"],[1,"soldier",2,"2"]]:
		app.start_adventure(); rules.choose_relic(app.run_state,0)
		rules.debug_jump_act_room(app.run_state,1,sample[0]); rules.start_battle(app.run_state,sample[1])
		rules.debug_set_countdown(app.run_state,sample[2])
		if sample[1] == "soldier": rules.debug_set_wind(app.run_state,2)
		check(app.storage.save_run(app.run_state),direction+" save countdown fixture "+sample[1])
		var disk: String = FileAccess.get_file_as_string(app.storage.directory+"gemcard.run.json")
		var fresh: RefCounted = preload("res://scripts/app/persistence.gd").new(app.storage.directory)
		var loaded: Dictionary = fresh.load_run()
		check(loaded.state != null,direction+" real file countdown restore "+sample[1])
		if loaded.state == null: continue
		var before: Dictionary = loaded.state.duplicate(true)
		app.run_state = {}; app.saved_run = loaded.state; app.resume_adventure(); await app.get_tree().process_frame
		check(app.countdown_text.text == sample[3],direction+" resumed integer countdown badge "+sample[1]+" got "+app.countdown_text.text)
		if sample[1] == "clock":
			var value: Label = app.monster.slot_holder("countdown_slot").get_node("Value")
			check(value.text == "3",direction+" resumed clock slot displays integer got "+value.text)
		elif sample[1] == "soldier":
			var value: Label = app.rule_sign.slot_holder("rule_text").get_node("Value")
			check(value.text == "上发条 ●●○○",direction+" resumed wind uses integer indicator counts")
		check(app.run_state == before and typeof(app.run_state.monster.countdown) == typeof(before.monster.countdown) and FileAccess.get_file_as_string(app.storage.directory+"gemcard.run.json") == disk,direction+" formatting preserves loaded state and save "+sample[1])

func check_difficulty_text_fit(app: Control, context: String) -> void:
	for tier: int in range(6):
		var button: Button = app.scene.find_child("Tier"+str(tier),true,false)
		var font: Font = button.get_theme_font("font")
		var font_size: int = button.get_theme_font_size("font_size")
		var width: float = font.get_string_size(button.text,HORIZONTAL_ALIGNMENT_LEFT,-1,font_size).x
		check(width+24.0 <= button.size.x+0.01,context+" tier "+str(tier)+" text has 12px side padding ("+str(width)+"/"+str(button.size.x)+")")

func check_top_regions(app: Control, context: String) -> void:
	var regions: Array[Control] = []
	var names: Array[String] = []
	for id: String in app.relic_nodes:
		regions.append(app.relic_nodes[id]); names.append("relic "+id)
	for node: Node in app.scene.find_children("*","Label",true,false):
		if node.text.begins_with("宝库 · 第"):
			regions.append(node); names.append("act label"); break
	var hp: Control = app.scene.find_child("HpFrame",true,false)
	if hp != null: regions.append(hp); names.append("HP bar")
	for node: Node in app.scene.find_children("*","Button",true,false):
		if node.tooltip_text in ["规则","设置"]: regions.append(node); names.append(node.tooltip_text)
	check(regions.size() == 10,context+" checks six relics, act label, HP bar and toolbar")
	var overlaps: PackedStringArray = []
	for left: int in range(regions.size()):
		for right: int in range(left+1,regions.size()):
			if regions[left].get_global_rect().intersects(regions[right].get_global_rect()): overlaps.append(names[left]+" / "+names[right])
	check(overlaps.is_empty(),context+" top regions do not overlap: "+", ".join(overlaps))
