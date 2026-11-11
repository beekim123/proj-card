extends RefCounted
const Core: GDScript = preload("res://rules/index.gd")
const Run: GDScript = preload("res://rules/run.gd")
const Save: GDScript = preload("res://rules/save_state.gd")
const Golden: GDScript = preload("res://tests/test_golden.gd")

func run() -> Dictionary:
	var index: Variant = JSON.parse_string(FileAccess.get_file_as_string("res://tests/historical-index.json"))
	if not index is Dictionary: return {"passed":0,"failed":1,"failures":["Historical fixed-seed traces missing"],"names":[]}
	var passed: int = 0
	var steps: int = 0
	var failures: Array[String] = []
	for filename: String in index.traces:
		var trace: Dictionary = Save.parse_json_exact(FileAccess.get_file_as_string("res://tests/historical/"+filename))
		var state: Dictionary = Run.create_run(trace.seed)
		for action: Dictionary in trace.actions:
			if action.name == "next_random": Core.next_random(state.game)
			else:
				var arguments: Array = [state]; arguments.append_array(action.args); Run.callv(action.name,arguments)
			steps += 1
		var difference: String = Golden.first_difference(state,trace.state)
		if not difference.is_empty(): failures.append(filename+": "+difference); break
		passed += 1
		if passed%50 == 0: print("HISTORICAL ",passed,"/",index.traces.size())
	var statistics: Variant = JSON.parse_string(FileAccess.get_file_as_string("res://artifacts/historical/report.json"))
	if not statistics is Dictionary or not statistics.get("failures",["missing"]).is_empty(): failures.append("Historical original statistical acceptance failed or missing")
	return {"passed":passed,"failed":failures.size(),"failures":failures,"names":index.traces,"steps":steps}
