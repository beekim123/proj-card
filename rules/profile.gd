class_name RulesProfile
extends RefCounted
const RC = preload("res://rules/run_config.gd")
static func create_profile() -> Dictionary:
	return {"version":1,"collected":RC.INITIAL_COLLECTION.duplicate()}
static func starting_relics(profile: Dictionary) -> Array:
	var result: Array = []
	var source: Variant = profile.get("collected",[])
	if source is Array:
		for id: String in RC.RELIC_IDS:
			if source.has(id): result.append(id)
	return result
static func apply_retreat(profile: Dictionary, relics: Array) -> Dictionary:
	return {"version":1,"collected":starting_relics({"collected":starting_relics(profile)+relics})}
static func valid(profile: Variant) -> bool:
	if not profile is Dictionary or profile.get("version") != 1 or not profile.get("collected") is Array: return false
	var ordered: Array = starting_relics(profile)
	if ordered != profile.collected: return false
	for id: String in RC.INITIAL_COLLECTION:
		if not ordered.has(id): return false
	return true
