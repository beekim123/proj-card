class_name RulesProgression
extends RefCounted
const RC: GDScript = preload("res://rules/run_config.gd")
static var last_error: String = ""
static func tier_multiplier(tier: Variant) -> float:
	last_error = ""
	if not (tier is int or tier is float) or not is_finite(float(tier)) or floor(float(tier)) != float(tier) or tier < 0 or tier > 5:
		last_error = "难度档位无效"; return -1.0
	return float(RC.DIFFICULTY_TIERS[int(tier)])
static func unlocked_tier(records: Dictionary) -> int:
	return 0 if int(records.get("fullWins",0)) == 0 else mini(5,int(records.get("bestClearedTier",-1))+2)
static func has_big_gem(records: Dictionary) -> bool:
	return int(records.get("fullWins",0)) > 0
static func can_start_tier(records: Dictionary, tier: Variant) -> Dictionary:
	if tier_multiplier(tier) < 0: return {"ok":false,"reason":last_error}
	return {"ok":tier <= unlocked_tier(records),"reason":"" if tier <= unlocked_tier(records) else "此加码尚未解锁"}
static func apply_clear(records: Dictionary, tier: int) -> Dictionary:
	var updated: Dictionary = records.duplicate(true)
	if tier_multiplier(tier) < 0: return updated
	updated.fullWins = int(records.get("fullWins",0))+1
	updated.bestClearedTier = maxi(int(records.get("bestClearedTier",-1)),tier)
	return updated
