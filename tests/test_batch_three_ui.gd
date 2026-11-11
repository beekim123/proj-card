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
			app.records.fullWins = 1; app.records.bestClearedTier = 0; app.records.wins = 1; app.records.played = 1; app.storage.save_records(app.records)
			app._render(); await tree.process_frame; check(not app.scene.find_child("Tier2",true,false).disabled,direction+" unlocked tier2")
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
			if scenario == "victory-save-pending":
				check(not app.run_state.result.recordsApplied and snapshot.records.fullWins == 0,"persistent failure really pending")
				app.storage.failure_stage = ""; app.storage.failure_remaining = 1; app._settle_records()
				check(app.run_state.result.recordsApplied and app.records.fullWins == 1,"pending retry commits exactly once")
	await app.shutdown_presentation(); app.queue_free(); await tree.process_frame; OS.set_environment("GEMCARD_SAVE_DIR",old_dir)
	return {"passed":passed,"failed":failures.size(),"failures":failures}
