class_name TestRun
extends RefCounted
## Oracle records use the original Vitest case names; missing records fail loudly.
const R: GDScript = preload("res://rules/run.gd")
const S: GDScript = preload("res://rules/save_state.gd")
const C: GDScript = preload("res://rules/index.gd")
const RC: GDScript = preload("res://rules/run_config.gd")
const E: GDScript = preload("res://rules/effects.gd")
const Oracle: GDScript = preload("res://tests/oracle_runner.gd")
var passed: int = 0
var failed: int = 0
var names: Array[String] = []
var failures: Array[String] = []

func _check(name: String, condition: bool, detail: String = "") -> void:
	names.append(name)
	if condition: passed += 1
	else:
		failed += 1
		failures.append(name + (": " + detail if not detail.is_empty() else ""))

func first_difference(actual: Variant, expected: Variant, path: String = "$") -> String:
	if actual is Dictionary and expected is Dictionary:
		for key: Variant in expected:
			if not actual.has(key): return path + "." + str(key) + " missing"
			var difference: String = first_difference(actual[key], expected[key], path + "." + str(key))
			if not difference.is_empty(): return difference
		for key: Variant in actual:
			if not expected.has(key): return path + "." + str(key) + " unexpected"
		return ""
	if actual is Array and expected is Array:
		if actual.size() != expected.size(): return path + ".length: %s != %s" % [actual.size(), expected.size()]
		for index: int in range(actual.size()):
			var difference: String = first_difference(actual[index], expected[index], path + "[%s]" % index)
			if not difference.is_empty(): return difference
		return ""
	if (actual is int or actual is float) and (expected is int or expected is float):
		if actual == expected: return ""
	elif typeof(actual) == typeof(expected) and actual == expected: return ""
	return "%s: %s != %s" % [path, JSON.stringify(actual), JSON.stringify(expected)]

func _inventory(state: Dictionary) -> bool:
	var ids: Array = []
	for pile: String in ["deck", "hand", "row", "discard"]:
		for card: Dictionary in state.game[pile]: ids.append(card.id)
	var canonical: Array = []
	for card: Dictionary in state.cards: canonical.append(card.id)
	ids.sort(); canonical.sort()
	return ids == canonical and state.hist.size() == state.game.hist.size()

func run() -> Dictionary:
	passed = 0; failed = 0; names.clear(); failures.clear()
	var state: Dictionary = R.create_run(123)
	state.relicOptions = ["same", "once", "white"]
	R.choose_relic(state, 0)
	_check("native adventure initial card identity and paired history conservation", _inventory(state) and state.cards.size() == 30 and state.game.hand.size() == 7)
	var before: Dictionary = state.duplicate(true)
	R.play_run_card(state, 0)
	_check("native adventure undo restores complete state", R.undo_run(state) and first_difference(state, before).is_empty())
	R.play_run_card(state, -1)
	_check("native invalid command leaves state unchanged", not R.last_error.is_empty() and first_difference(state, before).is_empty())
	var oracle: Dictionary = Oracle.new().run_files(["run.test.ts", "run-invariants.test.ts", "integration.test.ts", "v2-rules.test.ts", "batch-one-cards.test.ts", "batch-one-run.test.ts", "batch-one-save.test.ts"])
	passed += oracle.passed; failed += oracle.failed
	names.append_array(oracle.names); failures.append_array(oracle.failures)
	return {"passed": passed, "failed": failed, "names": names.duplicate(), "failures": failures.duplicate(), "oracle_calls": oracle.oracle_calls}
