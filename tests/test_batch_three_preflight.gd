extends RefCounted
const Main: GDScript = preload("res://scripts/app/game.gd")
const R: GDScript = preload("res://rules/run.gd")
const Save: GDScript = preload("res://rules/save_state.gd")
const Compare: GDScript = preload("res://tests/test_golden.gd")
const Store: GDScript = preload("res://scripts/app/persistence.gd")
var passed: int = 0
var failures: Array[String] = []
func check(ok: bool, label: String) -> void:
	if ok: passed += 1
	else: failures.append(label)
func roundtrip(app: Control, label: String) -> void:
	var encoded: Variant = Save.encode_run_save(app.run_state)
	check(encoded is String,label+" encode valid")
	check(app.storage.save_run(app.run_state) and app.storage.last_error.is_empty(),label+" actual save succeeds")
	var disk: String = FileAccess.get_file_as_string(app.storage.directory+"gemcard.run.json")
	check(disk == encoded,label+" disk equals current encoded state")
	var fresh: RefCounted = Store.new(app.storage.directory)
	var loaded: Dictionary = fresh.load_run()
	check(loaded.get("state") is Dictionary and Compare.first_difference(loaded.state,app.run_state).is_empty(),label+" fresh adapter full state restore")
func run() -> Dictionary:
	var tree: SceneTree = Engine.get_main_loop()
	var previous: String = OS.get_environment("GEMCARD_SAVE_DIR")
	OS.set_environment("GEMCARD_SAVE_DIR",ProjectSettings.globalize_path("res://artifacts/batch-3/preflight-"+str(Time.get_ticks_usec())))
	var app: Control = Main.new(); app.fixed_seed = 1979; app.debug_enabled = true
	tree.root.add_child(app); await tree.process_frame
	app.prefs.sound = false; app.sound.configure(app.prefs)
	app.start_adventure(); R.choose_relic(app.run_state,0); app.game_state = app.run_state.game
	roundtrip(app,"natural battle")
	check(app.run_state.cards.size() == 30 and app.run_state.nextCardId == 31,"natural identity baseline")
	app.debug_deal([1,"potion","palette","diamond"])
	check(app.run_state.nextCardId == 34 and app.run_state.cards.size() == 33,"L05 counter advances for three new IDs")
	roundtrip(app,"debug new tools")
	var counter: int = app.run_state.nextCardId
	app.debug_deal([1,"potion","palette","diamond"])
	check(app.run_state.nextCardId == counter and app.run_state.cards.size() == 33,"repeat deal reuses identities")
	var before: Dictionary = app.run_state.duplicate(true)
	app.debug_deal(["potion","potion","potion"])
	check(app.run_state == before,"tool cap rejects atomically")
	app.run_state = before.duplicate(true); app.game_state = app.run_state.game
	app.debug_deal(["unknown"]); check(app.run_state == before,"invalid input is immutable")
	app.debug_deal(["potion","palette","diamond"]); app.run_state.hearts = 1
	R.play_run_card(app.run_state,0); roundtrip(app,"potion played")
	check(app.run_state.hearts == 2,"potion heals once")
	check(R.undo_run(app.run_state) and app.run_state.hearts == 1,"potion undo restores hearts")
	roundtrip(app,"potion undone")
	R.play_run_card(app.run_state,0); R.end_run_turn(app.run_state)
	check(R.tool_count(app.run_state,"potion") == 0,"committed potion removed")
	roundtrip(app,"potion committed")
	var high: int = app.run_state.nextCardId
	app.debug_deal(["potion","potion"])
	check(app.run_state.nextCardId == high+2,"ID gaps are never reused")
	roundtrip(app,"two tools after gap")
	for direction: String in ["landscape","portrait"]:
		app.forced_layout = direction; app._resize(); app.start_adventure(); app._render(); await tree.process_frame
		for i: int in range(app.run_state.relicOptions.size()):
			var detail: Label = app.scene.find_child("RelicDescription"+str(i),true,false)
			check(detail.get_parent().size.y >= app.art.font.get_height(int(app.layout.relicPick.textSize))*3.0,direction+" L01 full description allocated")
		for id: String in RC_IDS():
			app.run_state.relicOptions = [id]; app.selected_relic = 0; app._render(); await tree.process_frame
			var detail: Label = app.scene.find_child("RelicDescription0",true,false)
			check(detail.get_parent().size.y+0.01 >= detail.get_minimum_size().y,direction+" full measured text "+id)
			var title: Label = app.scene.find_child("RelicName0",true,false)
			check(title.position.x >= 0 and title.position.x+title.size.x*title.scale.x <= title.get_parent().size.x+0.01,direction+" full title width "+id)
		app.screen = "collection"; app._render(); await tree.process_frame
		var count: Control = app.scene.find_child("CollectionCount",true,false)
		check(count.get_parent().position.y >= app.layout.banner.y+app.layout.banner.h,direction+" L02 panel below banner")
		app.start_adventure(); R.choose_relic(app.run_state,0); R.abandon_run(app.run_state); app._render(); await tree.process_frame
		var panel: Control = app.scene.find_child("ResultPanel",true,false)
		check(panel.position.y >= app.layout.banner.y+app.layout.banner.h,direction+" L03 scrolling region below banner")
		app.start_adventure(); R.choose_relic(app.run_state,0); R.debug_jump_act_room(app.run_state,2,3)
		app.game_state = app.run_state.game; app.debug_deal([1,1,1,1,1,2,2])
		for i: int in range(6): R.play_run_card(app.run_state,0)
		app.game_state = app.run_state.game; app._reset(); app._persist(); app._render(); await tree.process_frame
		var limit: Control = app.scene.find_child("SixCardLimit",true,false)
		for hand: Control in app.hand_nodes.values():
			check(not limit.get_global_rect().intersects(hand.get_global_rect()),direction+" L04 transformed hint avoids hand")
		var frozen: Dictionary = app.run_state.duplicate(true)
		var bytes: String = FileAccess.get_file_as_string(app.storage.directory+"gemcard.run.json")
		app.play_card(0)
		check(app.run_state == frozen and FileAccess.get_file_as_string(app.storage.directory+"gemcard.run.json") == bytes,direction+" seventh UI play leaves state and disk unchanged")
		app.undo_card(); await tree.process_frame
		check(app.run_state.game.row.size() == 5 and app.run_state.game.hand.size() == 2 and app.scene.find_child("SixCardLimit",true,false) == null,direction+" undo removes limit and restores hand")
	await app.shutdown_presentation(); app.queue_free(); await tree.process_frame
	OS.set_environment("GEMCARD_SAVE_DIR",previous)
	return {"passed":passed,"failed":failures.size(),"failures":failures}

func RC_IDS() -> Array:
	return preload("res://rules/run_config.gd").RELIC_IDS
