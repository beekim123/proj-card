extends RefCounted
const R: GDScript = preload("res://rules/run.gd")
const S: GDScript = preload("res://rules/save_state.gd")
const G: GDScript = preload("res://tests/test_golden.gd")
const Policy: GDScript = preload("res://tests/test_batch_two_replay.gd")
const H: GDScript = preload("res://tests/test_batch_three_helpers.gd")
func run() -> Dictionary:
	var failures: Array[String] = []
	var passed: int = 0
	var commands: int = 0
	var coverage: Dictionary = {}
	var outcomes: Dictionary = {}
	var summaries: Array = []
	var folder: String = "res://artifacts/batch-3/replay"
	DirAccess.make_dir_recursive_absolute(folder)
	for seed: int in range(1,101):
		# This explicit unlock fixture permits coverage; it is not earned progress.
		var tier: int = (seed-1)%6
		var state: Dictionary = R.create_run(seed,{"runId":"b3-natural-"+str(seed),"tier":tier,"unlockedTier":5,"tuningScale":1})
		var steps: int = 0
		var evidence: FileAccess = FileAccess.open(folder+"/seed-%03d.jsonl" % seed,FileAccess.WRITE)
		while state.result == null and steps < 2000:
			coverage[state.phase] = int(coverage.get(state.phase,0))+1
			if state.phase == "battle":
				var rule: Variant = R.current_rule(state)
				if rule != null: coverage[rule] = int(coverage.get(rule,0))+1
			var raw: Variant = S.encode_run_save(state)
			if raw == null: failures.append("seed %d step%d encode %s" % [seed,steps,S.last_error]); break
			var decoded: Dictionary = S.decode_run_save(raw)
			if decoded.state == null: failures.append("seed %d step%d decode %s" % [seed,steps,decoded.reason]); break
			var difference: String = G.first_difference(state,decoded.state)
			if not difference.is_empty(): failures.append("seed %d step%d before %s" % [seed,steps,difference]); break
			var next: Dictionary = Policy.new().action(state,seed,steps)
			if state.phase == "act_choice": next = {"method":"choose_act_exit","args":["retreat" if seed%4 == 0 else "continue"]}
			evidence.store_line(JSON.stringify({"step":steps,"command":next,"save":raw},"",false,true))
			R.callv(next.method,[state]+next.args)
			if not R.last_error.is_empty(): failures.append("seed %d step%d command %s" % [seed,steps,R.last_error]); break
			R.callv(next.method,[decoded.state]+next.args)
			difference = G.first_difference(state,decoded.state)
			if not difference.is_empty(): failures.append("seed %d step%d after %s" % [seed,steps,difference]); break
			steps += 1; commands += 1
		evidence.close()
		if not failures.is_empty():
			var broken: FileAccess = FileAccess.open(folder+"/failure-state.json",FileAccess.WRITE); broken.store_string(JSON.stringify(state,"\t",false,true)); broken.close(); break
		if state.result == null: failures.append("seed %d did not terminate" % seed); break
		var outcome: String = state.phase+"-act"+str(state.act)
		outcomes[outcome] = int(outcomes.get(outcome,0))+1
		summaries.append({"seed":seed,"tier":tier,"outcome":outcome,"fight":state.fight,"commands":steps}); passed += 1
		if passed%10 == 0: print("BATCH THREE REPLAY ",passed,"/100; ",commands," commands")
	var staged: Array = []
	for tier: int in range(6):
		var won: Dictionary = H.full_victory(tier)
		if won.phase != "victory" or won.relics.size() != 6 or won.difficulty.tier != tier: failures.append("staged six relic victory tier"+str(tier))
		staged.append({"tier":tier,"method":"debug final dragon checkpoint, six relics, HP0 then end turn","outcome":won.result})
	var report: Dictionary = {"passed":passed,"failed":failures.size(),"failures":failures,"commands":commands,"coverage":coverage,"naturalOutcomes":outcomes,"runs":summaries,"unlockedFixture":{"unlockedTier":5,"earned":false},"staged":staged}
	var file: FileAccess = FileAccess.open(folder+"/report.json",FileAccess.WRITE); file.store_string(JSON.stringify(report,"\t",false,true)); file.close()
	return report
