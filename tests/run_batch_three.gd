extends SceneTree
const NAMES: Array[String] = ["effects","run","progression","save","ui","replay"]
func _init() -> void: _run.call_deferred()
func _run() -> void:
	preload("res://rules/run_config.gd").use_current()
	var names: Array[String] = NAMES.duplicate()
	for arg: String in OS.get_cmdline_user_args():
		if not arg.begins_with("--suite=") or arg.substr(8) not in NAMES: printerr("Unknown suite: ",arg); quit(2); return
		names = [arg.substr(8)]
	var total: int = 0
	var failures: Array = []
	for name: String in names:
		var path: String = "res://tests/test_batch_three_"+name+".gd"
		if not ResourceLoader.exists(path): failures.append("Missing suite "+name); continue
		var suite: GDScript = load(path)
		if suite == null or not suite.can_instantiate(): failures.append("Cannot instantiate "+name); continue
		var result: Dictionary = await suite.new().run()
		if not result.has("passed") or not result.has("failures"): failures.append("Invalid suite result "+name); continue
		total += result.passed; failures.append_array(result.failures)
		print(name,": ",result.passed," passed, ",result.failed," failed")
	print(JSON.stringify({"passed":total,"failed":failures.size(),"failures":failures}))
	quit(0 if failures.is_empty() else 1)
