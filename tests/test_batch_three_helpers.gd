extends RefCounted
const R: GDScript = preload("res://rules/run.gd")
const RC: GDScript = preload("res://rules/run_config.gd")
static func full_victory(tier: int = 0) -> Dictionary:
	var state: Dictionary = R.create_run(1979,{"tier":tier,"unlockedTier":5,"tuningScale":1,"runId":"batch3-staged-tier-"+str(tier)})
	R.choose_relic(state,0); R.debug_jump_act_room(state,3,6)
	for id: String in RC.RELIC_IDS:
		if state.relics.size() >= 6: break
		R.acquire_relic(state,id)
	R.debug_set_monster_hp(state,0); R.end_run_turn(state)
	return state
