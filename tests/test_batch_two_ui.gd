extends RefCounted
const Main: GDScript = preload("res://scripts/app/game.gd")
const R: GDScript = preload("res://rules/run.gd")
const RC: GDScript = preload("res://rules/run_config.gd")
const Helper: GDScript = preload("res://tests/test_batch_two_run.gd")
var failures: Array[String] = []
var passed: int = 0
func check(ok: bool, label: String) -> void:
	if ok: passed += 1
	else: failures.append(label)
func run() -> Dictionary:
	var tree: SceneTree = Engine.get_main_loop()
	var previous_dir: String = OS.get_environment("GEMCARD_SAVE_DIR")
	OS.set_environment("GEMCARD_SAVE_DIR",ProjectSettings.globalize_path("res://artifacts/batch-2/ui-"+str(Time.get_ticks_usec())))
	var app: Control = Main.new(); app.fixed_seed = 1979; tree.root.add_child(app)
	await tree.process_frame
	check(app.has_method("_collection") and app.has_method("_act_choice"),"collection and exit UI entry points")
	if not failures.is_empty():
		await app.shutdown_presentation(); app.queue_free(); await tree.process_frame
		OS.set_environment("GEMCARD_SAVE_DIR",previous_dir); return result()
	app.prefs.sound = false; app.sound.configure(app.prefs)
	for direction: String in ["landscape","portrait"]:
		app.forced_layout = direction; app._resize(); app.go_home()
		check(app.scene.find_child("CollectionEntry",true,false) != null,direction+" home collection entry")
		app.screen = "collection"; app._render(); await tree.process_frame
		check(app.scene.find_child("CollectionScroll",true,false) != null and app.scene.find_child("CollectionCount",true,false).text.contains(str(app.storage.load_profile().collected.size())+"/"+str(RC.RUN.relicPool.size())),direction+" collection scroll and initial count")
		app.start_adventure(); R.choose_relic(app.run_state,0)
		R.debug_jump_act_room(app.run_state,1,6); Helper.new().win(app.run_state); R.choose_relic(app.run_state,0)
		app.game_state = app.run_state.game; app._render(); await tree.process_frame
		check(app.scene.find_child("ExitContinue",true,false) != null,direction+" hall continue available")
		var select: InputEventKey = InputEventKey.new(); select.pressed = true; select.keycode = KEY_2
		app._input(select)
		check(app.selected_exit == "continue" and app.get_viewport().gui_get_focus_owner().name == "ExitConfirm",direction+" keyboard choice preserves confirm focus")
		var confirm_key: InputEventKey = InputEventKey.new(); confirm_key.pressed = true; confirm_key.keycode = KEY_ENTER
		confirm_key.echo = true; app._input(confirm_key)
		check(app.run_state.phase == "act_choice",direction+" key repeat cannot confirm")
		confirm_key.echo = false; app._input(confirm_key); app._confirm_exit()
		check(app.run_state.fight == 7 and app.run_state.act == 2,direction+" repeated confirm moves once")
		R.debug_jump_act_room(app.run_state,2,3); Helper.new().deal(app.run_state,[1,1,1,1,1,2,2])
		for i: int in range(6): R.play_run_card(app.run_state,0)
		app.game_state = app.run_state.game; app._render(); await tree.process_frame
		check(app._predict_card(app.game_state.hand[0]).is_empty(),direction+" blocked preview no practice fallback")
		check(app.scene.find_child("SixCardLimit",true,false) != null,direction+" six card limit visible")
		app._preview_card(app.game_state.hand[0],500); app._hide_preview()
		R.debug_jump_act_room(app.run_state,2,6); Helper.new().win(app.run_state); R.choose_relic(app.run_state,0)
		app.game_state = app.run_state.game; app._render(); await tree.process_frame
		check((app.scene.find_child("ExitContinue",true,false) != null if RC.is_current() else app.scene.find_child("ExitContinue",true,false) == null) and app.scene.find_child("ExitRetreat",true,false) != null,direction+" corridor choices follow content version")
		app._select_exit("retreat"); app._confirm_exit(); app._confirm_exit()
		check(app.run_state.phase == "retreat" and app.run_state.result.recordsApplied,direction+" retreat settled once")
		check(app.scene.find_child("ResultBanner",true,false) != null,direction+" retreat result")
		app.go_home(); check(app.modal == null and app.drag.is_empty(),direction+" home cleanup")
	for id: String in ["mon_box","mon_portrait","mon_lock","rule_duck","rule_picky","rule_six","card_art_palette","card_art_potion","card_art_diamond","relic_red","relic_green","relic_blue","relic_shun","relic_same4","bg_tile_hall","prop_frame","prop_curtain"]:
		check(app.art.assets.has(id) and app.art.assets[id].definition.get("nativePlaceholder",false),"explicit native placeholder " + id)
		var view: Control = app.art.create(id); check(view != null,"placeholder creates " + id)
		if view != null: view.free()
	await app.shutdown_presentation(); app.queue_free(); await tree.process_frame
	OS.set_environment("GEMCARD_SAVE_DIR",previous_dir)
	return result()
func result() -> Dictionary:
	return {"passed":passed,"failed":failures.size(),"failures":failures}
