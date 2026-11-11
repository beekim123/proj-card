extends RefCounted
## Independent command policy, original authored stats and no balance overrides.
const R: GDScript = preload("res://rules/run.gd")
const S: GDScript = preload("res://rules/save_state.gd")
const G: GDScript = preload("res://tests/test_golden.gd")
var coverage: Dictionary = {}
var failures: Array[String] = []
func action(s: Dictionary, seed: int, step: int) -> Dictionary:
	match s.phase:
		"relic":
			var selected: int = 0
			for id: String in ["same","white","twice","same4","shun","grow","heart","rainbow","once"]:
				if s.relicOptions.has(id): selected = s.relicOptions.find(id); break
			return {"method":"choose_relic","args":[selected]}
		"act_choice": return {"method":"choose_act_exit","args":["retreat" if s.act == 2 or seed%4 == 0 else "continue"]}
		"doors": return {"method":"choose_door","args":[step%2]}
		"shop": return {"method":"shop_skip","args":[]}
		"loot":
			var order: Array = ["hammer","lens","palette","diamond","bag","stone","potion","mirror","whistle","seal","hourglass","shadow"]
			var index: int = 0
			for candidate: String in order:
				if s.loot.has(candidate): index = s.loot.find(candidate); break
			return {"method":"choose_loot","args":[index]} if not s.loot.is_empty() else {"method":"skip_loot","args":[]}
		"battle":
			if s.game.hand.is_empty() or not R.can_play_run_card(s).ok: return {"method":"end_run_turn","args":[]}
			var selected: int = 0
			var best: float = -1
			for index: int in range(s.game.hand.size()):
				var preview: Variant = R.preview_run_card(s,s.game.hand[index])
				if preview == null: continue
				var score: float = preview.damage + preview.m2*1000*maxi(0,s.game.hand.size()-1) + preview.get("heal",0)*1000
				if score > best: selected = index; best = score
			return {"method":"play_run_card","args":[selected]}
	return {"method":"abandon_run","args":[]}
func run() -> Dictionary:
	var passed: int = 0
	var total_steps: int = 0
	var summary: Array = []
	var outcomes: Dictionary = {}
	var seen_abandon: Dictionary = {}
	for seed: int in range(1,101):
		var s: Dictionary = R.create_run(seed*7919,{"runId":"fixed-replay-"+str(seed)})
		var steps: int = 0
		while s.result == null and steps < 1500:
			coverage[s.phase] = int(coverage.get(s.phase,0))+1
			if s.phase == "battle":
				var rule: Variant = R.current_rule(s)
				if rule != null: coverage[rule] = int(coverage.get(rule,0))+1
			if not seen_abandon.has(s.phase):
				var abandoned: Dictionary = s.duplicate(true); R.abandon_run(abandoned)
				if abandoned.phase != "defeat": failures.append("abandon " + str(s.phase))
				seen_abandon[s.phase] = true
			var raw: Variant = S.encode_run_save(s)
			if raw == null: failures.append("seed %d step %d invalid active %s" % [seed,steps,s.phase]); break
			var decoded: Dictionary = S.decode_run_save(raw)
			if decoded.state == null: failures.append("seed %d step %d decode" % [seed,steps]); break
			var restored: Dictionary = decoded.state
			var next: Dictionary = action(s,seed,steps)
			if seed%10 == 0 and steps == 4: next = {"method":"abandon_run","args":[]}
			coverage[next.method] = int(coverage.get(next.method,0))+1
			R.callv(next.method,[s]+next.args)
			if not R.last_error.is_empty(): failures.append("seed %d %s: %s" % [seed,next.method,R.last_error]); break
			R.callv(next.method,[restored]+next.args)
			var difference: String = G.first_difference(s,restored)
			if not difference.is_empty(): failures.append("seed %d step %d restored next %s" % [seed,steps,difference]); break
			steps += 1; total_steps += 1
		if not failures.is_empty(): break
		if s.result == null: failures.append("seed %d did not terminate" % seed); break
		var key: String = s.result.outcome+"-act"+str(s.act)
		outcomes[key] = int(outcomes.get(key,0))+1
		summary.append({"seed":seed*7919,"outcome":s.result.outcome,"fight":s.fight,"commands":steps})
		passed += 1
		if passed%10 == 0: print("BATCH TWO REPLAY ",passed,"/100; ",total_steps," commands")
	for phase: String in ["relic","battle","loot","doors","shop","act_choice"]:
		if not coverage.has(phase) or not seen_abandon.has(phase): failures.append("missing phase/abandon " + phase)
	for rule: String in ["duck","picky","six"]:
		if not coverage.has(rule): failures.append("missing rule " + rule)
	if not outcomes.has("retreat-act1"): failures.append("missing natural act1 retreat endpoint")
	# The greedy policy is not a balance/skill claim. Supplement the natural 100
	# with an explicitly staged final-boss checkpoint, never alter their outcomes.
	var endpoint: Dictionary = R.create_run(1007919,{"runId":"staged-final-endpoint"})
	R.choose_relic(endpoint,0)
	R.debug_jump_act_room(endpoint,2,6)
	preload("res://tests/test_batch_two_run.gd").new().win(endpoint)
	var checkpoint: Dictionary = S.decode_run_save(S.encode_run_save(endpoint)).state
	for command: Dictionary in [{"method":"choose_relic","args":[0]},{"method":"choose_act_exit","args":["retreat"]}]:
		R.callv(command.method,[endpoint]+command.args); R.callv(command.method,[checkpoint]+command.args)
		if not G.first_difference(endpoint,checkpoint).is_empty(): failures.append("staged final endpoint restore")
	if endpoint.result == null or endpoint.result.outcome != "retreat" or endpoint.result.reason != "act2": failures.append("staged final retreat endpoint")
	var report: Dictionary = {"passed":passed,"failed":failures.size(),"failures":failures,"commands":total_steps,"coverage":coverage,"outcomes":outcomes,"runs":summary,"supplementalCheckpoint":{"staged":true,"method":"debug final boss HP; reward and retreat commands replayed","outcome":endpoint.get("result")}}
	DirAccess.make_dir_recursive_absolute("res://artifacts/batch-2")
	var file: FileAccess = FileAccess.open("res://artifacts/batch-2/replay-report.json",FileAccess.WRITE)
	if file != null: file.store_string(JSON.stringify(report,"\t",false,true))
	return report
