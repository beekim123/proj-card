extends RefCounted
var passed: int = 0
var failures: Array[String] = []
func check(ok: bool, label: String) -> void:
	if ok: passed += 1
	else: failures.append(label)
func run() -> Dictionary:
	check(ResourceLoader.exists("res://rules/progression.gd"),"progression module exists")
	if not failures.is_empty(): return result()
	var p: GDScript = load("res://rules/progression.gd")
	var records: Dictionary = {"fullWins":0,"bestClearedTier":-1}
	check(p.unlocked_tier(records) == 0 and not p.has_big_gem(records),"fresh only base and no trophy")
	check(not p.can_start_tier(records,1).ok,"tier1 locked")
	var after: Dictionary = p.apply_clear(records,0)
	check(after.fullWins == 1 and after.bestClearedTier == 0 and records.fullWins == 0,"clear copy")
	check(p.unlocked_tier(after) == 2 and p.has_big_gem(after),"base unlock two and trophy")
	for tier: int in range(6): check(p.tier_multiplier(tier) == [1,1.5,2,3,4,6][tier],"tier multiplier "+str(tier))
	for invalid: Variant in [-1,6,1.5,"1",null]: check(p.tier_multiplier(invalid) == -1 and not p.can_start_tier(after,invalid).ok,"reject tier "+str(invalid))
	for best: int in [0,1,4,5]:
		after = p.apply_clear(after,best); check(p.unlocked_tier(after) == mini(5,best+2),"unlock boundary "+str(best))
	check(p.apply_clear(after,0).bestClearedTier == 5,"lower win never reduces highest")
	return result()
func result() -> Dictionary: return {"passed":passed,"failed":failures.size(),"failures":failures}
