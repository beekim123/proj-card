extends RefCounted
const Main: GDScript = preload("res://scripts/app/game.gd")
const R: GDScript = preload("res://rules/run.gd")
var passed: int = 0
var failures: Array[String] = []

func check(ok: bool, label: String) -> void:
	if ok: passed += 1
	else: failures.append(label)

func action(app: Control, expected: String, label: String) -> void:
	check(app.monster.action_name == expected,label+" expected "+expected+", got "+app.monster.action_name)

func prepare(app: Control, act: int, room: int, key: String, sequence: Array) -> void:
	app.start_adventure(); R.choose_relic(app.run_state,0)
	R.debug_jump_act_room(app.run_state,act,room); R.start_battle(app.run_state,key)
	app.game_state = app.run_state.game; app.debug_deal(sequence)
	check(app.run_state.phase == "battle" and app.monster.art_id == "mon_"+key,"real battle fixture "+key)
	check(app.storage.save_run(app.run_state),"legal saveable fixture "+key)

func toast_text(app: Control) -> String:
	var text: String = ""
	if is_instance_valid(app.active_toast):
		for label: Node in app.active_toast.find_children("*","Label",true,false): text += label.text
	return text

func run() -> Dictionary:
	var tree: SceneTree = Engine.get_main_loop()
	var previous: String = OS.get_environment("GEMCARD_SAVE_DIR")
	OS.set_environment("GEMCARD_SAVE_DIR",ProjectSettings.globalize_path("res://artifacts/new-art-feedback-"+str(Time.get_ticks_usec())))
	var app: Control = Main.new(); app.fixed_seed = 1979; app.debug_enabled = true
	tree.root.add_child(app); await tree.process_frame
	app.prefs.sound = false; app.prefs.shake = false; app.sound.configure(app.prefs)
	for sample: Array in [["mon_box","duck"],["mon_portrait","refuse"],["mon_lock","click"],["mon_lock","shut"],["mon_tree","regrow"],["mon_armor","cap"]]:
		check(app.art.assets[sample[0]].definition.events.has(sample[1]),"new source declares "+sample[0]+":"+sample[1])
	prepare(app,2,1,"box",[1,2,3])
	app.play_card(0)
	check(app.game_state.row[0].damage > 0 and app.monster.action_name != "duck","odd box card does not duck")
	app.play_card(0)
	check(app.game_state.row[1].damage == 0 and app.game_state.row[1].effects.any(func(effect: Dictionary) -> bool: return effect.id == "duck"),"second box card actually triggers duck")
	action(app,"duck","box ducks for blocked second card")
	app.play_card(0); check(app.monster.action_name != "duck","third box card does not duck")
	prepare(app,2,1,"box",["seal",1]); app.play_card(0); app.play_card(0)
	check(app.run_state.monster.sealed and app.game_state.row[1].damage > 0 and app.monster.action_name != "duck","sealed box does not duck on second card")
	prepare(app,2,1,"portrait",[1,3]); app.play_card(0)
	check(app.game_state.row[0].damage == 0 and app.game_state.row[0].effects.any(func(effect: Dictionary) -> bool: return effect.id == "picky"),"portrait actually rejects monochrome card")
	action(app,"refuse","portrait refuses monochrome card")
	app.play_card(0); check(app.game_state.row[1].damage > 0 and app.monster.action_name != "refuse","portrait accepts mixed card")
	prepare(app,2,1,"portrait",["seal",1]); app.play_card(0); app.play_card(0)
	check(app.run_state.monster.sealed and app.game_state.row[1].damage > 0 and app.monster.action_name != "refuse","sealed portrait accepts monochrome card")
	prepare(app,2,3,"lock",[1,1,1,1,1,2,2])
	for index: int in range(5):
		app.play_card(0); action(app,"click","lock clicks for legal card "+str(index+1))
	app.play_card(0)
	check(app.game_state.row.size() == 6 and not R.can_play_run_card(app.run_state).ok,"sixth lock card reaches actual limit")
	action(app,"shut","lock shuts on sixth card")
	await tree.create_timer(0.6).timeout
	check(app.monster.action_name != "shut","sixth card animation completes before blocked retry")
	var before: Dictionary = app.run_state.duplicate(true)
	var disk: String = FileAccess.get_file_as_string(app.storage.directory+"gemcard.run.json")
	app.play_card(0)
	check(app.run_state == before and FileAccess.get_file_as_string(app.storage.directory+"gemcard.run.json") == disk,"blocked seventh card preserves actual state and save")
	action(app,"shut","lock shuts again for rejected seventh card")
	prepare(app,2,3,"lock",[1,1,1,1,1,"seal",2])
	for index: int in range(6): app.play_card(0)
	check(R.can_play_run_card(app.run_state).ok and app.monster.action_name != "shut","sixth seal does not pretend sealed limit still applies")
	app.play_card(0); check(app.game_state.row.size() == 7,"sixth seal still permits legal seventh card")
	for countdown: int in [3,1]:
		prepare(app,3,1,"tree",[1]); R.debug_set_countdown(app.run_state,countdown); app.run_state.hearts = 2
		app.play_card(0); check(app.run_state.monster.hp == 3999900,"tree loses actual card damage before regrow")
		await app.end_turn()
		check(app.run_state.monster.hp == 3999950 and app.run_state.hearts == (1 if countdown == 1 else 2),"real turn regrows half before attack "+str(countdown))
		action(app,"attack" if countdown == 1 else "regrow","tree feedback respects attack priority "+str(countdown))
		check(toast_text(app).contains("长回去：恢复 50"),"regrow toast remains with countdown "+str(countdown))
		if countdown == 1: await tree.create_timer(1.3).timeout
	prepare(app,3,1,"tree",["seal",1]); app.play_card(0); app.play_card(0)
	var sealed_hp: float = app.run_state.monster.hp
	await app.end_turn()
	check(app.run_state.monster.hp == sealed_hp and app.monster.action_name != "regrow","sealed tree does not play false recovery")
	prepare(app,3,3,"armor",[1,3,2,6,4,"seal",1])
	for index: int in range(4):
		app.play_card(0); check(app.game_state.m < 32 and app.monster.action_name != "cap","armor below cap does not play cap "+str(index+1))
	app.play_card(0); check(app.game_state.m == 32,"armor reaches multiplier cap through legal cards")
	action(app,"cap","armor presses shield when multiplier reaches32")
	app.play_card(0); check(app.run_state.monster.sealed and app.game_state.m == 32,"seal card retains cached cap")
	action(app,"cap","seal card still uses cached cap feedback")
	app.play_card(0); check(app.game_state.m > 32 and app.monster.action_name != "cap","following sealed card is free of cap feedback")
	prepare(app,3,6,"dragon",[1,3,2,6,4]); R.debug_set_monster_hp(app.run_state,app.run_state.monster.maxHp/3.0)
	for index: int in range(5): app.play_card(0)
	check(R.current_rule(app.run_state) == "cap" and app.game_state.m == 32,"dragon reaches actual cap layer limit")
	check(not app.monster.definition.events.has("cap") and app.monster.action_name != "cap","dragon has no invented armor event")
	await app.shutdown_presentation(); app.queue_free(); await tree.process_frame
	OS.set_environment("GEMCARD_SAVE_DIR",previous)
	return {"passed":passed,"failed":failures.size(),"failures":failures}
