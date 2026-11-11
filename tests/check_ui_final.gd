extends SceneTree
const Smoke: GDScript = preload("res://tests/test_ui_smoke.gd")
const Art: GDScript = preload("res://tests/test_art.gd")

func _init() -> void:
	_run.call_deferred()

func _run() -> void:
	var art: Dictionary = Art.run()
	var ui: Dictionary = await Smoke.run(self)
	var report: Dictionary = {"art":art,"ui":ui}
	var output: FileAccess = FileAccess.open("res://artifacts/ui-final-report.json",FileAccess.WRITE)
	output.store_string(JSON.stringify(report,"\t",false,true)); output.close()
	print("FINAL_UI ",ui.passed," passed; ",ui.failed.size()," failed; ART ",art.passed,"/",art.failed.size())
	for failure: String in ui.failed: printerr(failure)
	for failure: String in art.failed: printerr(failure)
	quit(0 if ui.failed.is_empty() and art.failed.is_empty() else 1)
