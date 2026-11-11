extends RefCounted
var failures: Array[String] = []
var passed: int = 0
func check(ok: bool, label: String) -> void:
	if ok: passed += 1
	else: failures.append(label)
func run() -> Dictionary:
	if not ResourceLoader.exists("res://rules/profile.gd"):
		return {"passed":0,"failed":1,"failures":["profile module missing"]}
	var p: GDScript = load("res://rules/profile.gd")
	var old: Dictionary = p.create_profile()
	var saved: Dictionary = old.duplicate(true)
	check(p.starting_relics(old) == ["same","once","white","rainbow","heart","grow"],"initial six exact")
	var next: Dictionary = p.apply_retreat(old,["same","red","red","illegal"])
	check(p.starting_relics(next).size() == 7 and p.starting_relics(next).has("red"),"collection dedup and whitelist")
	check(old == saved,"profile immutable")
	var reverse: Dictionary = p.apply_retreat(old,["blue","red","start2"])
	check(p.starting_relics(reverse) == ["start2","same","once","white","rainbow","heart","grow","red","blue"],"canonical order not unlock order")
	return {"passed":passed,"failed":failures.size(),"failures":failures}
