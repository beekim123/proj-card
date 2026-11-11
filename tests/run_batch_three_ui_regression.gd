extends SceneTree
func _init() -> void: _run.call_deferred()
func _run() -> void:
	var one: Dictionary = await preload("res://tests/test_batch_two_ui.gd").new().run()
	var two: Dictionary = await preload("res://tests/test_inspector.gd").run(self)
	print("CURRENT UI ",one.passed,"/",one.failed," INSPECTOR ",two.passed,"/",two.failed.size())
	for failure: String in one.failures: printerr(failure)
	for failure: String in two.failed: printerr(failure)
	quit(0 if one.failed == 0 and two.failed.is_empty() else 1)
