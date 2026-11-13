extends SceneTree
func _init() -> void: _run.call_deferred()
func _run() -> void:
	preload("res://rules/run_config.gd").use_current()
	var result: Dictionary = await preload("res://tests/test_new_art_feedback.gd").new().run()
	print(JSON.stringify(result))
	for failure: String in result.failures: printerr(failure)
	quit(0 if result.failed == 0 else 1)
