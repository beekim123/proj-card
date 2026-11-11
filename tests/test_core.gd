extends RefCounted
## Direct ports of rules.test.ts (51), extra-cards.test.ts (30), rounding (10).
const Core = preload("res://rules/index.gd")
const Config = preload("res://rules/config.gd")
const Types = preload("res://rules/types.gd")
const RAINBOW: Array = [1, 3, 2, 6, 4, 5]
var _errors: Array[String] = []

func _eq(actual: Variant, expected: Variant, label: String = "") -> void:
	if not _same(actual,expected):
		_errors.append("%s expected %s, got %s" % [label, str(expected), str(actual)])

func _same(actual: Variant, expected: Variant) -> bool:
	if actual is Array and expected is Array:
		if actual.size() != expected.size(): return false
		for i: int in range(actual.size()):
			if not _same(actual[i],expected[i]): return false
		return true
	if actual is Dictionary and expected is Dictionary:
		if actual.size() != expected.size(): return false
		for key: Variant in expected:
			if not actual.has(key) or not _same(actual[key],expected[key]): return false
		return true
	if (actual is float or actual is int) and (expected is float or expected is int): return actual == expected
	return actual == expected

func _ok(value: bool, label: String = "") -> void:
	_eq(value, true, label)

func _inventory(state: Dictionary) -> Array:
	var ids: Array = []
	for pile: String in ["deck", "hand", "row", "discard"]:
		for card: Dictionary in state[pile]: ids.append(card.id)
	ids.sort()
	return ids

func _inventory_base(state: Dictionary) -> void:
	_eq(_inventory(state), range(1, 31), "inventory")
	for spec: Dictionary in Config.CONFIG.deck:
		var n: int = 0
		for pile: String in ["deck", "hand", "row", "discard"]:
			for card: Dictionary in state[pile]:
				if card.v == spec.v: n += 1
		_eq(n, spec.count, "mask count")

func _fixture(values: Array, grow: bool = true) -> Dictionary:
	var state: Dictionary = Core.create_game(73421, {"hand":7, "grow":grow})
	var pool: Array = state.deck + state.hand
	var next_id: int = 31
	for value: Variant in values:
		if value is String:
			pool.append(Core.create_tool_card(value, next_id)); next_id += 1
	state.hand = []
	for value: Variant in values:
		for i: int in range(pool.size()):
			var card: Dictionary = pool[i]
			if (value is String and card.get("type", "") == value) or (not value is String and not card.has("type") and card.v == value):
				state.hand.append(pool.pop_at(i)); break
	state.deck = pool
	return state

func _sequence(values: Array, extra: bool = false) -> Dictionary:
	var state: Dictionary = _fixture(values) if extra else Core.make_debug_game(values, 271828)
	var cards: Array = []
	var inventory: Array = _inventory(state)
	for _value: Variant in values:
		cards.append(Core.play_card(state, 0)); _eq(_inventory(state), inventory)
	return {"state":state, "cards":cards}

func _field(cards: Array, key: String) -> Array:
	var result: Array = []
	for card: Dictionary in cards: result.append(card[key])
	return result

func _forms(state: Dictionary) -> Array:
	return [Core.gem_form(state, 0), Core.gem_form(state, 1), Core.gem_form(state, 2)]

func _sequence_case(c: Dictionary, extra: bool) -> void:
	var result: Dictionary = _sequence(c.values, extra)
	var state: Dictionary = result.state
	var cards: Array = result.cards
	_eq(_field(cards, "dmg"), c.damage)
	_eq(state.m, c.multiplier); _eq(state.turnDmg, c.total); _eq(state.total, c.total)
	var bonus: float = 0.0
	var total: float = 0.0
	for card: Dictionary in cards: bonus += card.rainbow; total += card.damage
	_eq(bonus, c.get("bonus", 0)); _eq(total, c.total)
	if extra:
		if c.has("hammer"): _eq(_field(cards, "hammer"),c.hammer)
		else:
			for card: Dictionary in cards: _eq(card.hammer,0)
		match int(c.id):
			1: _eq(cards[1].k, "plain")
			2: _eq(cards[1].k, "white")
			5: _eq(cards[4].rb, true)
			6: _eq(cards[1].v, 6); _eq(state.xp, [1,1,1])
			7: _eq(cards[1].v, 7)
			8: _eq(cards[0].v, 0); _eq(state.xp, [0,0,0])
			9: _eq(cards[1].v, 0)
			10: _eq(cards[2].k, "white")
			14: _eq(cards[5].v, 3); _eq(cards[5].k, "white"); _eq(state.rainbow, false)
	else:
		_eq(state.rainbow, c.has("bonus"))
		var triggers: int = 0
		for card: Dictionary in cards:
			if card.rainbow > 0: triggers += 1
		_eq(triggers, 1 if c.has("bonus") else 0)
		if c.id in [9,10,13]: _eq(cards[5].rainbow, 188100)
		if c.id == 11:
			_eq(cards[7].rainbow, 778500); _eq(state.chainIdx, range(8))
			for card: Dictionary in cards: _ok(card.rb)
		if c.id == 12: _eq(state.chain, [5,4,6])
		if c.id == 13:
			for card: Dictionary in cards.slice(6): _eq(card.k, "shun")
		_inventory_base(state)

func _rules_case(id: int) -> void:
	var s: Dictionary = {}
	var before: Dictionary = {}
	var c: Dictionary = {}
	match id:
		14:
			s = Core.make_debug_game([1],271828); s.xp[0] = 14
			_eq(Core.gem_form(s,0),0); c = Core.play_card(s,0)
			_eq([c.dmg,c.gemValues[0],c.grown,s.xp[0],Core.gem_form(s,0)],[100,100,[0],15,1])
		15:
			s = Core.make_debug_game([3],271828); s.xp = [15,0,0]
			_eq(Core.play_card(s,0).b,250); _eq(s.xp,[16,1,0])
		16,17:
			s = Core.make_debug_game([7],271828,{"grow":id == 16}); s.xp = [15,45,0]
			c = Core.play_card(s,0); _eq(c.b,450 if id == 16 else 300)
			if id == 17: _eq(c.grown,[]); _eq(s.xp,[16,46,1]); _eq(_forms(s),[0,0,0])
		18:
			s = Core.make_debug_game([1,3],271828); Core.play_card(s,0); before = Core.clone_game(s)
			Core.play_card(s,0); _ok(Core.undo(s)); _eq(s,before); _eq([s.row[0].v,s.m,s.turnDmg,s.xp],[1,2,100,[1,0,0]])
		19:
			s = Core.create_game(271828); _eq([s.deck.size(),s.hand.size(),s.turn,s.total,s.best,s.last,s.xp],[24,6,1,0,0,0,[0,0,0]]); _inventory_base(s)
		20:
			s = Core.create_game(271828)
			for _i: int in range(3): Core.play_card(s,0)
			var retained: Array = _field(s.hand,"id")
			var damage: float = s.turnDmg
			Core.end_turn(s); _eq([s.discard.size(),s.hand.size(),s.deck.size(),s.turn],[3,6,21,2]); _eq(_field(s.hand.slice(0,3),"id"),retained); _eq(s.last,damage); _eq(Core.undo(s),false); _inventory_base(s)
		21:
			s = Core.create_game(271828); before = Core.clone_game(s); Core.end_turn(s); _eq(s,before)
		22:
			s = Core.create_game(271828)
			var recycled: int = 0
			for _turn: int in range(300):
				while not s.hand.is_empty(): Core.play_card(s,0); _inventory_base(s)
				if s.deck.is_empty(): recycled += 1
				Core.end_turn(s); _inventory_base(s); _eq(s.hand.size(),6)
			_ok(recycled > 1); _eq(s.turn,301)
		23:
			s = Core.make_debug_game(RAINBOW + RAINBOW,271828)
			for _i: int in range(6): Core.play_card(s,0)
			_eq(s.turnDmg,209000); Core.end_turn(s)
			_eq([s.last,s.best,s.m,s.rainbow,s.chain,s.chainIdx,s.hist],[209000,209000,1,false,[],[],[]])
			for _i: int in range(6): Core.play_card(s,0)
			_eq([s.row[5].rainbow,s.turnDmg,s.total],[188100,209000,418000]); _inventory_base(s)
		24: _eq(Core.create_deck().size(),30); _inventory_base(Core.create_game(271828))
		25:
			s = Core.create_game(1234); var b: Dictionary = Core.create_game(1234)
			for _round: int in range(12):
				_eq(s,b)
				while not s.hand.is_empty(): Core.play_card(s,0); Core.play_card(b,0)
				Core.end_turn(s); Core.end_turn(b)
			_eq(s,b); _ok(Core.create_game(1235).hand != Core.create_game(1234).hand)
		26:
			for a: int in range(8):
				_eq(Core.reaction(null,a),"plain")
				for b: int in range(8):
					var x: int = a ^ b; var n: int = (x&1)+((x>>1)&1)+((x>>2)&1)
					_eq(Core.reaction(a,b),["same","shun","plain","white"][n])
		27:
			var r: Dictionary = _sequence([1,0,2,3,7,5,4,6]); s = r.state
			for card: Dictionary in r.cards.slice(1): _eq(card.k,"shun")
			_eq([s.chain.size(),s.chainIdx.size(),s.rainbow,r.cards[1].dmg],[6,8,true,0]); _ok(r.cards[7].rainbow > 0)
		28:
			s = _sequence([1,3,3,2]).state; _eq([s.chain,s.chainIdx],[[3,2],[2,3]])
			s = _sequence([1,3,6,4]).state; _eq([s.chain,s.chainIdx],[[6,4],[2,3]])
		29:
			s = Core.make_debug_game(RAINBOW,271828)
			for _i: int in range(5): Core.play_card(s,0)
			s.xp[0] = 14; before = Core.clone_game(s); c = Core.preview_card(s,s.hand[0]); _eq(s,before)
			_eq([c.rainbow,c.grown],[188100,[0]]); _eq(Core.play_card(s,0),c); _eq(Core.gem_form(s,0),1)
		30:
			s = Core.make_debug_game(RAINBOW+[5,2],271828); s.xp = [13,44,14]
			var checkpoints: Array = []
			while not s.hand.is_empty(): checkpoints.append(Core.clone_game(s)); Core.play_card(s,0)
			while not checkpoints.is_empty(): _ok(Core.undo(s)); _eq(s,checkpoints.pop_back()); _inventory_base(s)
			_eq(Core.undo(s),false); _eq(s.row,[])
		31:
			s = _sequence([1,3]).state; _eq(JSON.parse_string(JSON.stringify(s)),s)
			before = Core.clone_game(s); before.row[0].gemValues[0] = 999; before.hist[0].hand[0].v = 0; before.opts.hint = false
			_eq([s.row[0].gemValues[0],s.hist[0].hand[0].v,s.opts.hint],[100,1,true]); _eq(Core.snapshot(s).has("hist"),false)
		32:
			s = Core.create_game(271828); Core.set_hand_limit(s,8); _eq([s.hand.size(),s.deck.size()],[8,22]); Core.set_hand_limit(s,6); _eq(s.hand.size(),8)
			for _i: int in range(3): Core.play_card(s,0)
			Core.end_turn(s); _eq([s.hand.size(),s.deck.size()],[6,21]); _inventory_base(s)
		33:
			s = Core.create_game(271828,{"hand":8})
			for _i: int in range(7): Core.play_card(s,0)
			Core.set_hand_limit(s,6); _eq(s.hand.size(),1); Core.update_settings(s,{"hand":6}); _eq(s.hand.size(),1); Core.end_turn(s); _eq(s.hand.size(),6); _inventory_base(s)
			s = Core.create_game(271828,{"hand":8})
			for _i: int in range(3): Core.play_card(s,0)
			Core.update_settings(s,{"hand":6}); _eq(s.hand.size(),5)
		34:
			s = Core.make_debug_game([7],271828); s.xp = [44,14,45]; c = Core.play_card(s,0)
			_eq([c.b,c.grown,_forms(s)],[450,[0,1],[2,1,2]])
			Core.update_settings(s,{"grow":false,"hint":false}); _eq(Core.base_value(s,7),300); _eq(s.xp,[45,15,46]); Core.update_settings(s,{"grow":true}); _eq(Core.base_value(s,7),550); Core.reset_growth(s); _eq([s.xp,Core.base_value(s,7)],[[0,0,0],300])
		35:
			s = Core.create_game(271828); before = Core.clone_game(s); Core.play_card(s,0); Core.update_settings(s,{"hand":8,"hint":false,"grow":false}); Core.reset_growth(s); Core.undo(s); _eq(s,before)
		36:
			var values: Array = _field(Core.create_deck(),"v"); s = Core.make_debug_game(values,271828)
			while not s.hand.is_empty(): Core.play_card(s,0)
			Core.set_hand_limit(s,8); _eq([s.hand.size(),s.row.size()],[0,30]); Core.end_turn(s); _eq(s.hand.size(),8); _inventory_base(s)
		37:
			s = Core.create_game(271828); before = Core.clone_game(s)
			for index: Variant in [-1,6,0.5,NAN]: Core.last_error = ""; Core.play_card(s,index); _ok(not Core.last_error.is_empty())
			_eq(s,before); Core.last_error = ""; Core.preview_card(s,8); _ok(not Core.last_error.is_empty())
			Core.last_error = ""; Core.make_debug_game([0,0],271828); _ok(not Core.last_error.is_empty())
			Core.last_error = ""; Core.shuffle([1,2],func() -> float: return 1.0); _ok(not Core.last_error.is_empty())
			Core.last_error = ""; Core.create_game(271828,{"hand":9}); _ok(not Core.last_error.is_empty()); Core.last_error = ""
		38:
			c = _sequence([1]).cards[0]; _eq(Core.format_formula(c),"红宝石：100 × 倍率 1 = 100"); _eq(Core.format_formula(c,true),"预计 红宝石：100 × 倍率 1 = 100")
			_eq(Core.format_formula(_sequence([1,0]).cards[1]),"空托：0 × 倍率 2 × 顺色 2 = 0")
		39:
			s = Core.make_debug_game([3],271828); s.xp = [15,14,0]; s.m = 4; c = Core.preview_card(s,1); c.id = -1; s.row.append(c); c = Core.play_card(s,0)
			_eq(Core.format_formula(c),"黄宝石：红 150 + 绿 100 = 250 × 倍率 4 × 顺色 2 = 2,000"); _eq([Core.gem_form(s,1),c.gemValues[1]],[1,100])
		40:
			s = Core.make_debug_game([7],271828); s.xp = [15,0,45]; s.m = 8; c = Core.preview_card(s,0); c.id = -1; s.row.append(c)
			_eq(Core.format_formula(Core.play_card(s,0)),"白宝石：红 150 + 绿 100 + 蓝 200 = 450 × 倍率 8 × 凑白 5 = 1.8万")
			_eq(Core.format_formula(_sequence(RAINBOW).cards[5]),"品红宝石：红 100 + 蓝 100 = 200 × 倍率 32 × 顺色 2 = 1.28万　彩虹！这回合 ×10　+18.81万")

func _extra_case(id: int) -> void:
	var s: Dictionary = {}
	var before: Dictionary = {}
	var after: Dictionary = {}
	var c: Dictionary = {}
	match id:
		11:
			s = _fixture(["stone",1]); s.xp = [10,0,0]; c = Core.play_card(s,0); _eq([c.dmg,c.grown,Core.gem_form(s,0)],[0,[0],1]); _eq(Core.play_card(s,0).dmg,600); _eq([s.m,s.turnDmg,s.xp],[4,600,[16,5,5]])
		13:
			s = _fixture([1,"bag"]); Core.play_card(s,0); var n: int = s.hand.size(); var deck: Array = s.deck.duplicate(true); var ids: Array = _inventory(s)
			c = Core.play_card(s,0); _eq([c.dmg,c.k,s.m,s.turnDmg],[200,"plain",3,300]); _eq(s.hand.size(),n+1); _eq(s.deck,deck.slice(0,-2)); _eq(s.hand.slice(-2),[deck[-1],deck[-2]]); _eq(_inventory(s),ids)
		15:
			s = _fixture(["bag"]); s.discard = s.deck.slice(0,3); s.deck = s.deck.slice(-1); var top: Dictionary = s.deck[0]; var discards: Array = _field(s.discard,"id"); var ids: Array = _inventory(s); var n: int = s.hand.size()
			Core.play_card(s,0); _eq(s.hand.size(),n+1); _eq(s.hand[-2],top); _ok(discards.has(s.hand[-1].id)); _eq([s.deck.size(),s.discard.size()],[2,0]); _eq(_inventory(s),ids)
		16:
			s = _sequence(RAINBOW+["hammer"],true).state; _ok(Core.undo(s)); _eq([s.m,s.turnDmg,s.total,s.rainbow,s.hand[0].type],[64,209000,209000,true,"hammer"])
			for entry: Dictionary in s.row: _ok(entry.rb)
		17,19:
			s = _fixture([1,"bag"] if id == 17 else ["bag"])
			if id == 17: Core.play_card(s,0)
			else: s.discard = s.deck.slice(0,6); s.deck = []
			before = Core.clone_game(s); Core.play_card(s,0); after = Core.clone_game(s)
			if id == 19: _ok(after.rngState != before.rngState)
			_ok(Core.undo(s)); _eq(s,before); Core.play_card(s,0); _eq(s,after)
		18:
			s = _fixture(["stone"]); s.xp = [44,14,0]; _eq(Core.play_card(s,0).grown,[0,1]); _eq([s.xp,_forms(s)],[[49,19,5],[2,1,0]])
		20:
			s = _fixture([1,"mirror"]); Core.play_card(s,0); before = Core.clone_game(s); Core.play_card(s,0); _eq(s.row[-1].v,6); _ok(Core.undo(s)); _eq(s,before); _eq(s.hand[0].v,0); var mirror_id: int = s.hand[0].id
			Core.play_card(s,0); Core.end_turn(s)
			for card: Dictionary in s.discard:
				if card.id == mirror_id: _eq(card.v,0)
		21:
			s = _fixture(["stone",1],false); s.xp = [44,14,0]; before = Core.clone_game(s); _eq(Core.play_card(s,0).grown,[]); _eq(s.xp,[49,19,5]); _eq(Core.play_card(s,0).dmg,400); Core.undo(s); Core.undo(s); _eq(s,before)
		22:
			s = _fixture([5,4,6,2,3,"hammer"])
			for _i: int in range(5): Core.play_card(s,0)
			before = Core.clone_game(s); c = Core.preview_card(s,s.hand[0]); _ok(c.rainbow > 0); _eq(c.hammer,(s.turnDmg+c.dmg)*20); _eq(c.damage,c.dmg+c.rainbow+c.hammer); _eq(s,before); _eq(Core.play_card(s,0),c)
			var formula: String = Core.format_formula(c); _ok(formula.find("彩虹！") < formula.find("锤子！"))
		23:
			for tool: String in ["bag","lens","hammer","mirror","stone"]:
				s = _fixture([1,tool]); Core.play_card(s,0); before = Core.clone_game(s); c = Core.preview_card(s,s.hand[0]); _eq(s,before); _eq(Core.play_card(s,0),c)
		24:
			s = _fixture(["bag"]); s.hand.append_array(s.deck); s.deck = []; var n: int = s.hand.size(); Core.play_card(s,0); _eq([s.hand.size(),s.row.size(),s.deck.size()],[n-1,1,0])
		25:
			s = _fixture(["bag"])
			while s.hand.size() < 8: s.hand.append(s.deck.pop_back())
			Core.play_card(s,0); _eq(s.hand.size(),9); var hand: Array = s.hand.duplicate(true); var deck: Array = s.deck.duplicate(true); Core.end_turn(s); _eq(s.hand,hand); _eq(s.deck,deck)
		26:
			s = Core.create_game(123,{"hand":7,"tools":true}); var all: Array = s.deck+s.hand; var tools: Array = []
			for card: Dictionary in all:
				if card.has("type"): tools.append(card.type)
			_eq([all.size(),tools.size(),s.hand.size()],[39,9,7]); _eq(tools.size(),9); Core.end_turn(s); _eq(s.turn,1)
		27:
			var values: Array = [[6,3,"bag"],[1,"lens"],[1,3,"hammer"],[1,"mirror"],["mirror"],[1,"stone"]]
			var expected: Array = ["口袋：绿 100 × 倍率 3 × 顺色 2 = 600　摸 2 张","放大镜：蓝 100 × 倍率 2 = 200　倍率再 ×2 → 6","锤子：红 100 × 倍率 4 × 顺色 2 = 800　锤子！这回合 ×3　+3,400","镜子（变成青宝石）：绿 100 + 蓝 100 = 200 × 倍率 2 × 凑白 5 = 2,000","镜子：0 × 倍率 1 = 0","磨石：0 × 倍率 2 × 顺色 2 = 0　三颗宝石各 +5 次"]
			for i: int in range(values.size()): _eq(Core.format_formula(_sequence(values[i],true).cards[-1]),expected[i])
		28:
			var values: Array = [[6,"bag"],[3,"lens"],[3,"hammer"],[1,"mirror"],[1,"stone"]]; var expected: Array = ["顺色 · 摸 2","凑白 · 倍率 ×2","顺色 · 这回合 ×3","凑白","顺色 · 宝石 +5"]
			for i: int in range(values.size()): _eq(Core.format_card_hint(_sequence(values[i],true).cards[-1]),expected[i])
		29:
			s = _fixture([1]); Core.play_card(s,0); Core.update_settings(s,{"tools":true}); _eq([_inventory(s).size(),s.turn,s.total,s.turnDmg,s.xp,s.row,s.hist,s.hand.size()],[39,1,0,0,[0,0,0],[],[],7]); Core.update_settings(s,{"tools":false}); _eq(_inventory(s).size(),30)
			for card: Dictionary in s.deck+s.hand: _eq(card.has("type"),false)
		30:
			var rng: Variant = Core.seeded_rng(123456)
			for _i: int in range(17): rng.next_value()
			var saved: int = rng.get_state(); _ok(saved >= 0 and saved < 4294967296)
			var restored: Variant = Core.seeded_rng(0); restored.set_state(JSON.parse_string(JSON.stringify(saved)))
			for _i: int in range(100): _eq(restored.next_value(),rng.next_value())

func _execute(name: String, test: Callable, report: Dictionary) -> void:
	_errors = []; Core.last_error = ""; test.call()
	if not Core.last_error.is_empty(): _errors.append(Core.last_error)
	if _errors.is_empty(): report.passed += 1; report.passed_names.append(name)
	else: report.failed += 1; report.failed_names.append(name); report.errors[name] = _errors.duplicate()

func run() -> Dictionary:
	var report: Dictionary = {"passed":0,"failed":0,"passed_names":[],"failed_names":[],"errors":{}}
	var base: Array = [
		[1,[1],[100],2,100,0],[2,[1,1],[100,400],3,500,0],[3,[1,3],[100,800],4,900,0],[4,[1,6],[100,2000],4,2100,0],[5,[1,2],[100,200],3,300,0],[6,[0,1],[0,400],4,400,0],[7,[7,0],[300,0],4,300,0],[8,[3,6],[200,400],3,600,0],
		[9,RAINBOW,[100,800,800,3200,3200,12800],64,209000,188100],[10,RAINBOW+[5,2],[100,800,800,3200,3200,12800,25600,32500],130,267100,188100],[11,[1,3,7,3,2,6,4,5],[100,800,2400,3200,3200,12800,12800,51200],256,865000,778500],[12,[1,3,2,5,4,6],[100,800,800,8000,3200,12800],64,25700,0],[13,RAINBOW+[4,6,2,3,1,5],[100,800,800,3200,3200,12800,12800,51200,51200,204800,204800,819200],4096,1553000,188100]]
	for item: Array in base:
		var c: Dictionary = {"id":item[0],"values":item[1],"damage":item[2],"multiplier":item[3],"total":item[4]}
		if item[5] > 0: c.bonus = item[5]
		_execute("rules.test.ts #%d: %s" % [item[0],str(item[1])],_sequence_case.bind(c,false),report)
	var names: Array = ["#14: 第 15 次红宝石先按 100 结算，再变切好","#15: 红 15、绿 0，黄底数 250","#16: 红 15、绿 45、蓝 0，白底数 450","#17: 同 #16，成长关闭时按原石算，次数仍累计","#18: 用例 3 撤回黄色，整个状态恢复","#19: 开局牌库 24、手牌 6、回合 1，所有数值清零","#20: 出 3 张结束回合，弃牌 3、手牌 6、牌库 21、回合 2","#21: 空回合不加回合数，不摸多余牌","#22: 牌库空后只洗实际弃牌，长期 300 回合始终同一组 30 张","#23: 彩虹回合结算上回合/最高 209,000，下一回合可以再触发","牌组数量、宝石位、唯一标识严格符合配置","相同种子能复现开局与回收洗牌","64 种有前牌的反应都符合异或分类，第一张始终普通","空托能通过顺色留在链里，不增加颜色且不打断彩虹","同色及普通会重置顺色链，不能跨越反应拼彩虹","预览包含彩虹和成长、无任何副作用，和实算完全一致","彩虹后可逐张撤回至回合开始，所有字段及历史逐次相等","快照不共享引用，普通 JSON 完整复制状态","手牌上限增大即补，减小不弃，之后只补到新上限","手牌上限减小或不变不会在回合中补牌，只在下回合补到新上限","成长 44 → 45 先按切好结算；成长开关及清零不丢计数","撤回也恢复出牌前设置和牌堆（设置变化后仍是整个状态恢复）","没有可摸牌时不制造牌、不陷入循环","非法输入明确报错且非法出牌不会增加撤回历史","单颗、普通、空托及预计算式","混色拆分是出牌前底数，后续成长不能改写旧算式","白牌与彩虹末尾所有数字统一采用 §8 单位"]
	for i: int in range(names.size()): _execute("rules.test.ts " + names[i],_rules_case.bind(i+14),report)
	var formats: Array = [[0,"0"],[9999,"9,999"],[10000,"1万"],[12000,"1.2万"],[267100,"26.71万"],[1000000,"100万"],[12300000,"1230万"],[99990000,"9999万"],[123456789,"1.235亿"],[1e12,"1兆"],[2.5e16,"2.5京"]]
	for item: Array in formats: _execute("rules.test.ts %s → %s" % [str(item[0]),item[1]],func() -> void: _eq(Core.format_number(item[0]),item[1]),report)
	var extras: Array = [[1,[1,"lens"],[100,200],6,300,0,[]],[2,[3,"lens"],[200,1000],8,1200,0,[]],[3,[1,3,"hammer"],[100,800,800],8,5100,0,[0,0,3400]],[4,RAINBOW+["hammer"],[100,800,800,3200,3200,12800,12800],128,665400,188100,[0,0,0,0,0,0,443600]],[5,[1,3,2,6,"lens",5],[100,800,800,3200,3200,25600],128,337000,303300,[]],[6,[1,"mirror"],[100,2000],4,2100,0,[]],[7,[0,"mirror"],[0,3000],4,3000,0,[]],[8,["mirror"],[0],2,0,0,[]],[9,[7,"mirror"],[300,0],4,300,0,[]],[10,[1,"mirror",1],[100,2000,2000],8,4100,0,[]],[12,["hammer","hammer"],[100,400],3,2100,0,[200,1400]],[14,[1,3,2,6,4,"mirror"],[100,800,800,3200,3200,32000],64,40100,0,[]]]
	for item: Array in extras:
		var c: Dictionary = {"id":item[0],"values":item[1],"damage":item[2],"multiplier":item[3],"total":item[4],"bonus":item[5]}
		if not item[6].is_empty(): c.hammer = item[6]
		_execute("extra-cards.test.ts #%d: %s" % [item[0],str(item[1])],_sequence_case.bind(c,true),report)
	var extra_ids: Array = [11,13,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30]
	var extra_names: Array = ["#11: 磨石先把红从10次升到15次，下一张红使用150底数","#13: 口袋从牌库末尾摸两张，出一摸二，手牌净增一","#15: 口袋牌库1张、弃牌3张时先摸1再洗弃牌摸1，卡牌守恒","#16: 彩虹之后的锤子撤回，回到64倍率、209000伤害，彩虹保留","#17: 口袋撤回复原两张牌的位置，再打摸到同样的牌","#18: 磨石同时使红44→49闪光、绿14→19切好，蓝0→5","口袋洗弃牌后撤回也恢复随机数，再次出牌结果完全相同","镜子桌面使用有效宝石，进弃牌时恢复无宝石，撤回回到手牌原样","磨石升级可完整撤回，成长关闭仍增加次数而不提升底数或升级特效","锤子恰好触发彩虹时先算彩虹再翻倍，预览包含二者且不改变状态","所有额外牌预览与实际结算一致，预览不摸口袋牌、不改成长或随机数","两堆均空时口袋少摸，桌面牌不回收","口袋可越过手牌上限，下一回合保留超出的手牌且不再补牌","练习支持手牌7及每种额外牌1张，空过回合不增加回合数","§3.5算式完整展示工具、变色和加成，并固定出牌时的底数","提示沿用反应名并接上工具效果，镜子只显示凑白","练习切换额外牌后重开，清除旧伤害、成长、桌面和撤回","种子随机整数状态可取出和恢复，之后100次抽样逐个一致"]
	for i: int in range(extra_ids.size()): _execute("extra-cards.test.ts " + extra_names[i],_extra_case.bind(extra_ids[i]),report)
	var rounding: Array = [[12344,"1.234万"],[12345,"1.235万"],[12346,"1.235万"],[-12345,"-1.235万"],[123450,"12.35万"],[1234500,"123.5万"],[123450000,"1.235亿"],[1234500000000,"1.235兆"],[1234567,"123.5万"],[1500000,"150万"]]
	for item: Array in rounding: _execute("number-rounding.test.ts %s → %s" % [str(item[0]),item[1]],func() -> void: _eq(Core.format_number(item[0]),item[1]),report)
	return report

## Extra platform regression tests; deliberately separate from the 91 H5 cases.
## The expected RNG numerator is an exact u32, avoiding decimal-parser bias.
func run_precision() -> Dictionary:
	var report: Dictionary = {"passed":0,"failed":0,"passed_names":[],"failed_names":[],"errors":{}}
	var raw: String = FileAccess.get_file_as_string("res://tests/rng.json")
	var samples: Variant = JSON.parse_string(raw)
	var pattern: RegEx = RegEx.new()
	pattern.compile('"values"\\s*:\\s*\\[([^\\]]+)\\]')
	var matches: Array[RegExMatch] = pattern.search_all(raw)
	if not samples is Array or samples.size() != 3 or matches.size() != 3:
		_execute("exact RNG decimal fixture exists",func() -> void: _ok(false,"tests/rng.json"),report)
		return report
	for sample_index: int in range(samples.size()):
		var sample: Dictionary = samples[sample_index]
		var tokens: PackedStringArray = matches[sample_index].get_string(1).split(",")
		if tokens.size() != 1000 or not sample.get("u32") is Array or sample.u32.size() != 1000:
			_execute("exact RNG fixture has 1000 samples",func() -> void: _ok(false),report)
			continue
		for index: int in range(tokens.size()):
			var expected: float = float(sample.u32[index])/4294967296.0
			_execute("exact decimal seed %s sample %s" % [sample.seed,index],func() -> void: _eq(Types.parse_json_number(tokens[index]),expected),report)
	var boundaries: Array = [["0","0000000000000000"],["-0","0000000000000080"],["4.9406564584124654e-324","0100000000000000"],["2.4703282292062327e-324","0000000000000000"],["2.4703282292062328e-324","0100000000000000"],["1.7976931348623157e308","ffffffffffffef7f"],["1.7976931348623159e308","000000000000f07f"],["-1e400","000000000000f0ff"],["-1e-400","0000000000000080"],["9007199254740993","0000000000004043"],["1.00000000000000011102230246251565404236316680908203125","000000000000f03f"],["1.00000000000000033306690738754696212708950042724609375","020000000000f03f"]]
	for item: Array in boundaries:
		_execute("exact decimal boundary "+item[0],func() -> void:
			var bytes: PackedByteArray = PackedByteArray(); bytes.resize(8); bytes.encode_double(0,Types.parse_json_number(item[0])); _eq(bytes.hex_encode(),item[1]),report)
	_execute("JS Math.round negative half",func() -> void: _eq(Core.js_round(-2.5),-2.0),report)
	_execute("JS Math.round 2^52 odd integer",func() -> void: _eq(Core.js_round(4503599627370497.0),4503599627370497.0),report)
	_execute("JS Math.round preserves negative zero",func() -> void:
		var bytes: PackedByteArray = PackedByteArray(); bytes.resize(8); bytes.encode_double(0,Core.js_round(-0.5)); _eq(bytes.hex_encode(),"0000000000000080"),report)
	return report
