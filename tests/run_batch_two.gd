extends SceneTree
const NAMES: Array[String] = ["cards", "run", "profile", "save", "ui"]
func _init() -> void:
	_run.call_deferred()
func _run() -> void:
	var selected: Array[String] = NAMES.duplicate()
	for arg: String in OS.get_cmdline_user_args():
		if not arg.begins_with("--suite=") or arg.substr(8) not in NAMES:
			printerr("Unknown suite: ", arg); quit(2); return
		selected = [arg.substr(8)]
	var failures: Array = []
	var passed: int = 0
	for name: String in selected:
		var path: String = "res://tests/test_batch_two_" + name + ".gd"
		if not ResourceLoader.exists(path):
			failures.append("Missing suite: " + name); continue
		var suite: GDScript = load(path)
		if suite == null or not suite.can_instantiate():
			failures.append("Cannot load suite: " + name); continue
		var result: Dictionary = await suite.new().run()
		if not result.has("passed") or not result.has("failures"):
			failures.append("Invalid suite result: " + name); continue
		passed += result.passed
		failures.append_array(result.failures)
		print(name, ": ", result.passed, " passed, ", result.failed, " failed")
	for failure: Variant in failures: printerr(failure)
	print("BATCH TWO: ", passed, " passed, ", failures.size(), " failed")
	quit(0 if failures.is_empty() else 1)
