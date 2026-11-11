extends SceneTree
## Small dependency-free runner; a failed suite prevents the success marker.
var suites: Array[String] = ["test_core","test_oracle_remaining","test_run","test_save","test_layout","test_art","test_persistence","test_golden","test_historical"]

func _init() -> void:
	_run.call_deferred()

func _run() -> void:
	preload("res://rules/run_config.gd").use_legacy()
	var failures: Array[String] = []
	var total: int = 0
	var report: Dictionary = {"suites":{},"passed":0,"failed":0}
	for name: String in suites:
		var script: GDScript = load("res://tests/"+name+".gd") as GDScript
		if script == null or not script.can_instantiate(): failures.append(name+": cannot load suite"); continue
		var result: Dictionary = script.new().run() if not name == "test_art" else script.run()
		report.suites[name] = result
		total += int(result.get("passed",0))
		var failed: Variant = result.get("failed",0)
		var count: int = failed.size() if failed is Array else int(failed)
		if count > 0:
			var previous_count: int = failures.size()
			for failure: Variant in result.get("failures",failed if failed is Array else []): failures.append(name+": "+str(failure))
			for case_name: String in result.get("failed_names",[]): failures.append(name+": "+case_name+": "+str(result.get("errors",{}).get(case_name,[])))
			if failures.size() == previous_count: failures.append(name+": "+str(count)+" failed")
		print("SUITE ",name,": ",result.get("passed",0)," passed, ",count," failed")
		await process_frame
	var core: RefCounted = load("res://tests/test_core.gd").new()
	var precision: Dictionary = core.run_precision()
	report.suites["precision"] = precision
	total += int(precision.get("passed",0))
	if int(precision.get("failed",0)) > 0:
		for case_name: String in precision.get("failed_names",[]): failures.append("precision: "+case_name+": "+str(precision.get("errors",{}).get(case_name,[])))
		if precision.get("failed_names",[]).is_empty(): failures.append("precision: "+str(precision.failed)+" failed")
	preload("res://rules/run_config.gd").use_batch_two()
	for name: String in ["cards","run","profile","save","ui","replay"]:
		var batch: GDScript = load("res://tests/test_batch_two_"+name+".gd")
		if batch == null or not batch.can_instantiate(): failures.append("batch_two_"+name+": cannot load"); continue
		var result: Dictionary = await batch.new().run()
		report.suites["batch_two_"+name] = result
		total += int(result.get("passed",0))
		for failure: Variant in result.get("failures",[]): failures.append("batch_two_"+name+": "+str(failure))
		print("SUITE batch_two_",name,": ",result.get("passed",0)," passed, ",result.get("failed",0)," failed")
	var preflight: Dictionary = await preload("res://tests/test_batch_three_preflight.gd").new().run()
	report.suites["batch_three_preflight"] = preflight
	total += int(preflight.passed)
	for failure: String in preflight.failures: failures.append("preflight: "+failure)
	print("SUITE preflight: ",preflight.passed," passed, ",preflight.failed," failed")
	preload("res://rules/run_config.gd").use_current()
	var smoke: GDScript = load("res://tests/test_ui_smoke.gd") as GDScript
	if smoke == null: failures.append("UI smoke missing")
	else:
		var smoke_result: Dictionary = await smoke.run(self)
		report.suites["ui_smoke"] = smoke_result
		total += int(smoke_result.get("passed",0))
		var smoke_failed: Variant = smoke_result.get("failed",0)
		if (smoke_failed.size() if smoke_failed is Array else int(smoke_failed)) > 0:
			for failure: Variant in smoke_result.get("failures",smoke_failed if smoke_failed is Array else []): failures.append("ui_smoke: "+str(failure))
	var inspector: GDScript = load("res://tests/test_inspector.gd") as GDScript
	if inspector == null: failures.append("Inspector suite missing")
	else:
		var inspector_result: Dictionary = await inspector.run(self)
		report.suites["inspector"] = inspector_result
		total += int(inspector_result.get("passed",0))
		for failure: Variant in inspector_result.get("failed",[]): failures.append("inspector: "+str(failure))
	report.passed = total; report.failed = failures.size(); report.failures = failures
	var file: FileAccess = FileAccess.open("res://artifacts/test-report.json",FileAccess.WRITE)
	if file != null: file.store_string(JSON.stringify(report,"\t",false,true))
	for failure: String in failures: printerr(failure)
	if failures.is_empty(): print("原生检查完成 — ",total," native checks")
	else: printerr("验证未通过 — ",failures.size()," failures")
	quit(0 if failures.is_empty() else 1)
