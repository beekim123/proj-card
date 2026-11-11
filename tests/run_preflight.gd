extends SceneTree
func _init() -> void: _run.call_deferred()
func _run() -> void:
	var result: Dictionary = await preload("res://tests/test_batch_three_preflight.gd").new().run()
	print(JSON.stringify(result))
	quit(0 if result.failed == 0 else 1)
