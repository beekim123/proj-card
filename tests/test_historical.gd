extends RefCounted
const Core: GDScript = preload("res://rules/index.gd")
const Run: GDScript = preload("res://rules/run.gd")
const Save: GDScript = preload("res://rules/save_state.gd")
const Golden: GDScript = preload("res://tests/test_golden.gd")

func run() -> Dictionary:
	var index: Variant = JSON.parse_string(FileAccess.get_file_as_string("res://tests/historical-index.json"))
	if not index is Dictionary: return {"passed":0,"failed":1,"failures":["Historical fixed-seed traces missing"],"names":[]}
	var production: Variant = Save.parse_json_exact(FileAccess.get_file_as_string("res://h5/verification/batch-one-bot-results.json"))
	var reference: Variant = Save.parse_json_exact(FileAccess.get_file_as_string("res://h5/verification/batch-one-reference-results.json"))
	if not production is Dictionary or not reference is Dictionary:
		return {"passed":0,"failed":1,"failures":["Frozen historical statistics missing"],"names":[]}
	var passed: int = 0
	var wins: Array[int] = [0,0]
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
		var difference: String = Golden.first_difference(preload("res://tests/legacy_projection.gd").strip(state),trace.state)
		if not difference.is_empty(): failures.append(filename+": "+difference); break
		var mode: int = 0 if passed < 300 else 1
		var label: String = "hintRandom" if mode == 0 else "planSmart"
		var row: Dictionary = production[label].rows[passed if mode == 0 else passed-300]
		if trace.seed != row.seed or (state.phase == "victory") != row.win or state.fight != row.room or state.stats.turns != row.turns or state.relics != row.relics or state.cards.size() != row.deck:
			failures.append(filename+": archived production row differs"); break
		if state.phase == "victory": wins[mode] += 1
		passed += 1
		if passed%50 == 0: print("HISTORICAL ",passed,"/",index.traces.size())
	# Original reports were generated on the author machine under artifacts/ and
	# never tracked. Verify native replay against the immutable committed rows;
	# the independent simulator's archived statistics are reference evidence,
	# not a claim that its external source was rerun on this machine.
	for mode: int in range(2):
		var label: String = "hintRandom" if mode == 0 else "planSmart"
		var count: int = 300 if mode == 0 else 100
		var rate: float = Core.js_round(float(wins[mode])*1000.0/count)/10.0
		if production[label].n != count or reference[label].n != count or rate != production[label].win or absf(rate-reference[label].win) > 10:
			failures.append(label+": frozen original statistical acceptance differs")
	return {"passed":passed,"failed":failures.size(),"failures":failures,"names":index.traces,"steps":steps}
