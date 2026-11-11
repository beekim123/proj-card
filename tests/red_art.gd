extends SceneTree

func _init() -> void:
	var suite: GDScript = load("res://tests/test_art.gd") as GDScript
	var result: Dictionary = suite.run()
	print(JSON.stringify(result))
	quit(0 if result.failed.is_empty() else 1)
