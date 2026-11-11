extends RefCounted
const C = preload("res://rules/index.gd")
const E = preload("res://rules/effects.gd")
const RC = preload("res://rules/run_config.gd")
var failures: Array[String] = []
var passed: int = 0
func check(ok: bool, label: String) -> void:
	if ok: passed += 1
	else: failures.append(label)
func hand(types: Array, relics: Array = []) -> Dictionary:
	var g: Dictionary = C.create_game(1979)
	g.hand = []; g.deck = []; g.discard = []; g.relics = relics
	for value: Variant in types:
		g.hand.append(C.create_tool_card(value, 501 + g.hand.size()) if value is String else {"id":501 + g.hand.size(),"v":value})
	return g
func run() -> Dictionary:
	for id: String in ["palette", "potion", "diamond"]: check(C.TOOL_TYPES.has(id), "registered tool " + id)
	for id: String in ["red", "green", "blue", "shun", "same4", "duck", "picky", "six", "palette", "potion", "diamond"]: check(E.EFFECTS.has(id), "registered effect " + id)
	# Guard absent content so the red test reports assertions, not runtime errors.
	if not failures.is_empty(): return result()
	var g: Dictionary = hand(["diamond"])
	var out: Dictionary = C.play_card(g, 0)
	check(out.b == 600 and out.damage == 600 and g.xp == [1,1,1], "diamond 600 and one growth each")
	g = hand(["diamond"], ["red"]); out = C.play_card(g,0)
	check(out.b == 800 and g.xp == [1,1,1], "red diamond 800")
	g = hand(["diamond"], ["twice"]); out = C.play_card(g,0)
	check(out.b == 600, "diamond not repeated")
	g = hand([1,1], ["same4"]); C.play_card(g,0); out = C.play_card(g,0)
	check(out.cm == 4 and out.damage == 800 and g.m == 3, "same4 independent multiplier")
	g = hand([1,1], ["same4","same"]); C.play_card(g,0); out = C.play_card(g,0)
	check(out.damage == 800 and g.m == 4, "same4 plus same")
	g = hand([1,3], ["shun"]); C.play_card(g,0); out = C.play_card(g,0)
	check(out.damage == 1200 and g.m == 4, "shun3 independent growth")
	g = hand(["palette"], ["once"]); out = C.play_card(g,0)
	check(out.v == 0 and out.k == "plain" and g.chain == [] and not g.onceUsed, "first palette empty")
	g = hand([1,"palette"], ["once","twice"]); C.play_card(g,0); out = C.play_card(g,0)
	check(out.v == 1 and out.k == "shun" and g.chain == [1,3] and not g.onceUsed, "palette one missing color and no once")
	g = hand([0,"palette"]); C.play_card(g,0); out = C.play_card(g,0)
	check(out.v == 0 and out.k == "shun" and g.chain == [1], "palette after empty")
	g = hand([1,3,2,6,"palette"], ["rainbow"])
	for i: int in range(5): out = C.play_card(g,0)
	check(out.rb and g.chain == [1,3,2,6,4], "palette five color rainbow")
	g = hand(["potion"]); out = C.play_card(g,0)
	check(out.get("spent",false) and out.get("heal",0) == 1 and out.damage == 100, "potion consumption intent")
	check(C.undo(g) and g.hand.size() == 1 and g.row.is_empty(), "potion undo")
	C.play_card(g,0); C.end_turn(g)
	check(g.hand.is_empty() and g.deck.is_empty() and g.discard.is_empty(), "potion not reshuffled")
	g = hand(["potion","shadow"], ["twice"]); out = C.play_card(g,0)
	check(out.get("heal",0) == 2, "first potion doubled")
	out = C.play_card(g,0)
	check(not out.get("spent",false) and out.get("heal",0) == 0, "shadow not consumable or healing")
	for rule: String in ["duck","picky"]:
		var m: Dictionary = {"rule":rule,"broken":false,"hp":1000000,"maxHp":1000000}
		g = hand([1,"hammer"]); C.play_card(g,0,m); out = C.play_card(g,0,m)
		check(out.damage == 0 if rule == "duck" else out.damage == 0, rule + " hammer suppression")
		check(g.xp == [2,0,0] and g.row.size() == 2, rule + " non damage effects remain")
	var duck: Dictionary = {"rule":"duck","broken":false,"hp":10000000,"maxHp":10000000}
	g = hand([1,3,2,6,4,5])
	for i: int in range(5): C.play_card(g,0,duck)
	var old_total: Variant = g.turnDmg
	out = C.play_card(g,0,duck)
	check(out.rb and g.rainbow and out.damage == 0 and g.turnDmg == old_total,"duck rainbow consumed without damage")
	check(C.undo(g) and not g.rainbow and g.row.size() == 5,"duck undo restores count and rainbow")
	var picky: Dictionary = {"rule":"picky","broken":false,"hp":10000000,"maxHp":10000000}
	g = hand([6,"hammer"]); C.play_card(g,0,picky); out = C.play_card(g,0,picky)
	check(out.b == 0 and out.hammer == 400 and out.damage == 400,"picky keeps accumulated hammer algorithm")
	g = hand([1,"palette"], ["once"]); C.play_card(g,0,picky); out = C.play_card(g,0,picky)
	check(out.v == 1 and out.b == 0 and out.k == "shun" and not g.onceUsed,"picky uses resolved palette mask")
	g = hand([1,3,2,6,4,"palette"])
	for i: int in range(6): out = C.play_card(g,0)
	check(out.rb and g.chain == [1,3,2,6,4,5],"palette sixth missing color")
	g = hand([1,3,2,6,4,5,"palette"], ["twice"])
	for i: int in range(7): out = C.play_card(g,0)
	check(g.chain == [1,3,2,6,4,5] and not out.rb,"full chain palette adds no color")
	for first: String in ["palette","diamond"]:
		g = hand([first,"potion"], ["twice"]); C.play_card(g,0); out = C.play_card(g,0)
		check(out.heal == 1,"first nonrepeatable tool occupies twice " + first)
	g = hand(["diamond"], ["red"])
	var hug: Dictionary = {"rule":"hug","broken":false,"hp":10000000,"maxHp":10000000}
	out = C.play_card(g,0,hug)
	check(out.b == 400 and g.xp == [1,1,1],"hug red diamond zero red growth remains")
	for mask: int in [1,2,4,3,5,6,7]:
		for tool: String in ["mirror","shadow","palette","diamond"]:
			g = hand([mask,tool]); C.play_card(g,0,picky)
			var before: Dictionary = g.duplicate(true)
			var preview: Dictionary = C.evaluate_card(g,g.hand[0],picky).entry
			check(g == before,"pure new rule preview " + tool + str(mask))
			out = C.play_card(g,0,picky)
			check(preview == out,"resolved preview equals played " + tool + str(mask))
	g = hand([1,3,2,6,4,5])
	for position: int in range(6):
		out = C.play_card(g,0,duck)
		check(out.damage == 0 if position%2 == 1 else out.damage > 0,"duck alternating " + str(position+1))
	return result()
func result() -> Dictionary:
	return {"passed":passed,"failed":failures.size(),"failures":failures}
