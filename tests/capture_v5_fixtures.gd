extends SceneTree
const R: GDScript = preload("res://rules/run.gd")
const S: GDScript = preload("res://rules/save_state.gd")
const H: GDScript = preload("res://tests/test_batch_two_run.gd")
const P: GDScript = preload("res://scripts/app/persistence.gd")
var manifest: Dictionary = {"sourceCommit":"74fddbe7763f613981560b42ddf17e2b1511f19e","mode":"body-batch-2 after L05 fix, before batch3","fixtures":{}}
var failures: Array[String] = []
func _init() -> void: _run.call_deferred()
func fresh() -> Dictionary:
	return R.create_run(1979,{"runId":"v5-migration-fixture"})
func capture(label: String, state: Dictionary, commands: String) -> void:
	var raw: Variant = S.encode_run_save(state)
	if raw == null: failures.append(label+": "+S.last_error); return
	var store: RefCounted = P.new(ProjectSettings.globalize_path("res://artifacts/batch-3/fixture-save-"+label))
	if not store.save_run(state): failures.append(label+": "+store.last_error); return
	var disk: String = FileAccess.get_file_as_string(store.directory+"gemcard.run.json")
	var readback: Dictionary = P.new(store.directory).load_run()
	if disk != raw or readback.get("state") == null or not preload("res://tests/test_golden.gd").first_difference(readback.state,state).is_empty():
		failures.append(label+": disk/restore mismatch"); return
	var path: String = "res://tests/fixtures/body-batch-3/v5-"+label+".json"
	var file: FileAccess = FileAccess.open(path,FileAccess.WRITE); file.store_string(raw); file.close()
	manifest.fixtures[label] = {"commands":commands,"sha256":str(raw).sha256_text(),"phase":state.phase,"rngState":state.game.rngState,"cards":state.cards.size(),"nextCardId":state.nextCardId,"hand":state.game.hand.duplicate(true),"relicOptions":state.relicOptions.duplicate(true)}
func _run() -> void:
	DirAccess.make_dir_recursive_absolute("res://tests/fixtures/body-batch-3")
	var s: Dictionary = fresh(); capture("initial-relic",s,"create_run(1979)")
	R.choose_relic(s,0); capture("battle",s,"choose_relic(0)")
	H.new().win(s); capture("loot",s,"debug HP1, play until broken, end turn")
	R.skip_loot(s); capture("doors",s,"skip_loot")
	var shop: int = -1
	for i: int in range(s.doors.size()):
		if s.doors[i].reward == "shop": shop = i
	if shop < 0:
		R.debug_set_doors(s,[{"monster":"chest","reward":"shop"},{"monster":"bear","reward":"card"}])
		shop = 0
	R.choose_door(s,shop); H.new().win(s); capture("shop",s,"choose shop door; debug HP1 victory")
	for act: int in [1,2]:
		s = fresh(); R.choose_relic(s,0); R.debug_jump_act_room(s,act,3); H.new().win(s)
		if act == 1: capture("elite-relic",s,"jump act1 room3; debug HP1 victory")
		R.choose_relic(s,0); R.debug_jump_act_room(s,act,6); H.new().win(s)
		if act == 1: capture("boss-relic",s,"choose elite relic; jump act1 room6; debug HP1 victory")
		R.choose_relic(s,0); capture("act"+str(act)+"-choice",s,"jump act%d room6; win; choose boss relic" % act)
	s = fresh(); R.choose_relic(s,0); H.new().deal(s,[1,"palette","potion"])
	R.play_run_card(s,0); R.play_run_card(s,0); capture("palette-row",s,"give palette+potion via legal allocator; deal red,palette,potion; play red,palette")
	R.play_run_card(s,0); capture("potion-spent",s,"play potion before turn commit")
	R.undo_run(s); capture("undo-history",s,"undo potion, retain paired earlier histories")
	manifest.failures = failures
	var f: FileAccess = FileAccess.open("res://tests/fixtures/body-batch-3/manifest.json",FileAccess.WRITE)
	f.store_string(JSON.stringify(manifest,"\t",false,true)); f.close()
	print(JSON.stringify(manifest)); quit(0 if failures.is_empty() and manifest.fixtures.size() == 12 else 1)
