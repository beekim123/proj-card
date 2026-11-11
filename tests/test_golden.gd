extends RefCounted
## Fixed-seed full adventures. Every action checks the complete raw state and save.
const LegacyProjection = preload("res://tests/legacy_projection.gd")
const RC = preload("res://rules/run_config.gd")
const Core: GDScript = preload("res://rules/index.gd")
const Run: GDScript = preload("res://rules/run.gd")
const Save: GDScript = preload("res://rules/save_state.gd")

static func first_difference(actual: Variant, expected: Variant, path: String = "$", bits: Dictionary = {}) -> String:
	if actual is Dictionary and expected is Dictionary:
		for key: Variant in expected:
			if not actual.has(key): return path+"."+str(key)+" missing"
			var difference: String = first_difference(actual[key],expected[key],path+"."+str(key),bits)
			if not difference.is_empty(): return difference
		for key: Variant in actual:
			if not expected.has(key): return path+"."+str(key)+" unexpected"
		return ""
	if actual is Array and expected is Array:
		if actual.size() != expected.size(): return path+".length: %d != %d" % [actual.size(),expected.size()]
		for index: int in range(expected.size()):
			var difference: String = first_difference(actual[index],expected[index],path+"[%d]" % index,bits)
			if not difference.is_empty(): return difference
		return ""
	if (actual is int or actual is float) and (expected is int or expected is float):
		if bits.has(path):
			var actual_bits: PackedByteArray = PackedByteArray(); actual_bits.resize(8); actual_bits.encode_double(0,float(actual))
			if actual_bits.hex_encode() == str(bits[path]): return ""
		else:
			if actual == expected: return ""
	elif typeof(actual) == typeof(expected) and actual == expected: return ""
	return path+": "+str(actual)+" != "+str(expected)

func run() -> Dictionary:
	var previous: Dictionary = RC.RUN
	RC.use_legacy()
	var index: Variant = JSON.parse_string(FileAccess.get_file_as_string("res://tests/golden-index.json"))
	if not index is Dictionary: return {"passed":0,"failed":1,"failures":["golden-index.json missing"],"steps":0,"names":[]}
	var passed: int = 0
	var steps: int = 0
	var failures: Array[String] = []
	var names: Array[String] = []
	for filename: String in index.traces:
		var trace: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://tests/golden/"+filename))
		var state: Dictionary = {}
		var difference: String = ""
		for step_index: int in range(trace.steps.size()):
			var step: Dictionary = trace.steps[step_index]
			var action: Dictionary = step.action
			if action.name == "create_run": state = Run.create_run(action.args[0])
			elif action.name == "create_game": state = Core.create_game(action.args[0],action.args[1])
			else:
				var arguments: Array = [state]; arguments.append_array(action.args)
				var module: GDScript = Run if trace.kind == "adventure" else Core
				module.set("last_error","")
				module.callv(action.name,arguments)
				if not str(module.get("last_error")).is_empty(): difference = "unexpected rule error: "+str(module.get("last_error"))
			if difference.is_empty(): difference = first_difference(LegacyProjection.strip(state),step.state,"$",step.get("float64",{}))
			if difference.is_empty() and trace.kind == "adventure":
				var native_save: Variant = Save.encode_run_save(state)
				if native_save == null or step.save == null:
					if native_save != step.save: difference = "$.encodeRunSave null differs"
				else:
					var actual_envelope: Variant = Save.parse_json_exact(native_save)
					var expected_envelope: Variant = Save.parse_json_exact(step.save)
					if not actual_envelope is Dictionary or not expected_envelope is Dictionary: difference = "$.encodeRunSave invalid JSON"
					else:
						# Compare the saved numbers against the original binary64 bits.
						var corrected_bits: Dictionary = {}
						for path: String in step.get("float64",{}): corrected_bits["$.state"+path.substr(1)] = step.float64[path]
						difference = _save_difference(LegacyProjection.strip(actual_envelope),expected_envelope,"$",corrected_bits)
			if difference.is_empty() and trace.kind == "adventure" and step.save != null:
				difference = migration_difference(step.save)
			steps += 1
			if not difference.is_empty():
				failures.append("%s step %d %s: %s" % [filename,step_index,action.name,difference]); break
		names.append(filename)
		if difference.is_empty(): passed += 1
		if passed%25 == 0: print("GOLDEN ",passed,"/",index.traces.size()," traces; ",steps," steps")
		if not failures.is_empty(): break
	RC.RUN = previous
	return {"passed":passed,"failed":failures.size(),"failures":failures,"names":names,"steps":steps,"adventures":index.adventures,"practice":index.practice,"victory":index.victory,"defeat":index.defeat,"coverage":index.coverage}

static func _save_difference(actual: Variant, expected: Variant, path: String, bits: Dictionary) -> String:
	return first_difference(actual,expected,path,bits)

static func migration_difference(raw: String) -> String:
	var previous: Dictionary = RC.RUN
	# Preserve the frozen batch-two v4-to-v5 contract; v6 migration has its own suite.
	RC.use_batch_two()
	var migrated: Dictionary = Save.decode_run_save(raw)
	var difference: String = ""
	if migrated.state == null or not migrated.get("migrated",false): difference = "v4 migration rejected"
	else:
		migrated.state.runId = "golden-migration"
		if not Save.is_active_run_state(migrated.state): difference = "migrated v4 fails v5 validation"
		else:
			# Only spec-defined structural additions. All old fields remain exact.
			var expected: Dictionary = Save.parse_json_exact(raw).state
			expected.monsters.append_array(["box","box","lock","box","box","dragon"])
			for history: Dictionary in expected.hist: history.hearts = expected.hearts
			difference = first_difference(LegacyProjection.strip(migrated.state),expected)
	RC.RUN = previous
	return difference
