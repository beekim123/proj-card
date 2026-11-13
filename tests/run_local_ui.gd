extends SceneTree
## Fast affected-surface regression; the separate full runner remains authoritative.
var report: Dictionary = {"suites":{},"passed":0,"failed":0,"failures":[]}

func _init() -> void:
	_run.call_deferred()

func _record(name: String, result: Dictionary) -> void:
	report.suites[name] = result
	report.passed += int(result.get("passed",0))
	var failed: Variant = result.get("failed",0)
	var count: int = failed.size() if failed is Array else int(failed)
	if count > 0:
		for failure: Variant in result.get("failures",failed if failed is Array else []): report.failures.append(name+": "+str(failure))
		if result.get("failures",failed if failed is Array else []).is_empty(): report.failures.append(name+": "+str(count)+" failures")
	print("LOCAL UI ",name,": ",result.get("passed",0)," passed, ",count," failed")

func _run() -> void:
	preload("res://rules/run_config.gd").use_batch_two()
	_record("preflight",await preload("res://tests/test_batch_three_preflight.gd").new().run())
	preload("res://rules/run_config.gd").use_current()
	_record("batch_two_ui",await preload("res://tests/test_batch_two_ui.gd").new().run())
	_record("batch_three_ui",await preload("res://tests/test_batch_three_ui.gd").new().run())
	_record("ui_smoke",await preload("res://tests/test_ui_smoke.gd").run(self))
	_record("inspector",await preload("res://tests/test_inspector.gd").run(self))
	_record("new_art_feedback",await preload("res://tests/test_new_art_feedback.gd").new().run())
	report.failed = report.failures.size()
	var file: FileAccess = FileAccess.open("res://artifacts/batch-3/local-ui-report.json",FileAccess.WRITE)
	if file != null: file.store_string(JSON.stringify(report,"\t",false,true))
	for failure: String in report.failures: printerr(failure)
	print("LOCAL UI TOTAL ",report.passed," passed, ",report.failed," failed")
	quit(0 if report.failed == 0 else 1)
