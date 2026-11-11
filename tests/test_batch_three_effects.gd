extends RefCounted
const RC: GDScript = preload("res://rules/run_config.gd")
const C: GDScript = preload("res://rules/index.gd")
const R: GDScript = preload("res://rules/run.gd")
const E: GDScript = preload("res://rules/effects.gd")
var passed: int = 0
var failures: Array[String] = []
func check(ok: bool, label: String) -> void:
	if ok: passed += 1
	else: failures.append(label)
func result() -> Dictionary: return {"passed":passed,"failed":failures.size(),"failures":failures}
func run() -> Dictionary:
	check(RC.RUN.acts.size() == 3 and RC.RUN.fights.size() == 18,"three acts eighteen fights")
	check(RC.RUN.relicPool.size() == 19 and RC.RUN.toolPool.size() == 12 and RC.MONSTERS.size() == 10,"19 relics 12 tools 10 monsters")
	for id: String in ["regrow","cap","link","shine","guard","rbheal"]: check(E.EFFECTS.has(id),"registered "+id)
	if not failures.is_empty(): return result()
	var vault: Dictionary = RC.RUN.acts[2]
	check(vault.normalMonsters == ["tree","box","portrait","chest","bear"],"vault monster order")
	check(vault.dragonRules == ["bell","duck","cap"] and not vault.rooms[5].relic,"vault dragon contract")
	for i: int in range(6): check(vault.rooms[i].hp == [4000000,5500000,4000000,9000000,14000000,25000000][i],"vault hp "+str(i))
	var game: Dictionary = C.create_game(1979); game.relics = ["shine"]; game.xp = [45,45,45]
	check(C.gem_value(game,0) == 300,"shine base300")
	game.relics = ["shine","red"]; var diamond: Dictionary = C.evaluate_card(game,C.create_tool_card("diamond",-1)).entry
	check(diamond.gemValues[0] == 1200,"shine then red then diamond")
	game.relics = []; game.xp = [0,0,0]; game.m = 64
	var armor: Dictionary = R.make_monster("armor",15)
	var before: Dictionary = game.duplicate(true)
	var entry: Dictionary = C.evaluate_card(game,{"id":-1,"v":1},armor).entry
	check(entry.m == 32 and entry.damage == 3200 and entry.m2 == 32,"cap current and next")
	check(game == before,"preview immutable")
	for type: String in ["lens","seal"]:
		entry = C.evaluate_card(game,C.create_tool_card(type,-1),armor).entry
		check(entry.m == 32 and entry.m2 <= 32,"cap tool "+type)
	game.relics = ["link"]; game.chain = [1,3]; game.chainIdx = [0,1]; game.row = [{"id":1,"v":1},{"id":2,"v":3}]
	var chain: Dictionary = C.next_chain(game,4,"white")
	check(chain.colors == [1,3,4] and chain.indices == [0,1,2],"white preserves chain and indices")
	game = C.create_game(1979); game.relics = []; game.m = 64
	var dragon: Dictionary = R.make_monster("dragon",18)
	for hp: float in [dragon.maxHp*2.0/3.0,dragon.maxHp/3.0]:
		dragon.hp = hp; dragon.layer = E.monster_layer(dragon)
		check(E.active_monster_rule(dragon) == ("duck" if hp > dragon.maxHp/3.0 else "cap"),"exact dragon boundary "+str(hp))
	dragon.hp = dragon.maxHp/3.0+1000; dragon.layer = 2
	entry = C.evaluate_card(game,{"id":1,"v":1},dragon).entry
	check(entry.m == 64 and entry.damage == 6400 and entry.m2 == 32,"crossing card old64 next32")
	game.hand = [C.create_tool_card("seal",1),{"id":2,"v":2}]
	C.play_card(game,0,armor)
	check(game.m == 32 and armor.sealed,"seal current capped")
	entry = C.play_card(game,0,armor)
	check(entry.m == 32 and entry.m2 > 32,"after seal can grow without refund")
	game = C.create_game(1979); game.relics = ["twice"]; game.m = 1000
	entry = C.evaluate_card(game,C.create_tool_card("lens",1),R.make_monster("armor",15)).entry
	check(entry.m == 32 and entry.m2 == 32,"twice lens cannot bypass cap")
	game = C.create_game(17); game.relics = ["link","white","shun","once"]; game.chain = [1,3]; game.chainIdx = [0,1]; game.row = [{"id":1,"v":1},{"id":2,"v":3}]
	for mask: int in [0,7]:
		chain = C.next_chain(game,mask,"white"); check(chain.colors == [1,3] and chain.indices == [0,1,2],"link never fabricates color "+str(mask))
	entry = C.evaluate_card(game,{"id":3,"v":4},R.make_monster("clock",3)).entry
	check(entry.k == "white" and entry.cm == 8 and entry.m2 == 2 and not game.onceUsed,"link keeps white and white8 not shun3")
	check(entry.effects.any(func(effect: Dictionary) -> bool: return effect.id == "bell"),"white link still rings bell")
	game = C.create_game(17); game.xp = [45,45,45]
	game.relics = ["shine","red"]; var first: Dictionary = C.evaluate_card(game,C.create_tool_card("diamond",1)).entry
	game.relics = ["red","shine"]; entry = C.evaluate_card(game,C.create_tool_card("diamond",1)).entry
	check(first.gemValues == entry.gemValues,"shine independent of acquisition order")
	var current: Dictionary = RC.RUN; RC.use_batch_two()
	check(RC.RUN.fights.size() == 12 and RC.RUN.relicPool.size() == 15,"frozen two act contract"); RC.set("RUN",current)
	return result()
