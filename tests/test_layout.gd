class_name TestLayout
extends RefCounted
## Named cases from H5 layout/fit.test.ts and ui/geometry.test.ts.
const L: GDScript = preload("res://scripts/ui/layout.gd")
var passed: int = 0
var failed: int = 0
var names: Array[String] = []
var failures: Array[String] = []

func _check(name: String, condition: bool) -> void:
	names.append(name)
	if condition: passed += 1
	else: failed += 1; failures.append(name)

func _close(a: float, b: float, tolerance: float = 0.000001) -> bool:
	return absf(a - b) < tolerance

func _inside(layout: Dictionary, rect: Dictionary) -> bool:
	return rect.x >= 0 and rect.y >= 0 and rect.x + rect.w <= layout.width and rect.y + rect.h <= layout.height

func _overlap(a: Dictionary, b: Dictionary) -> bool:
	return a.x < b.x + b.w and a.x + a.w > b.x and a.y < b.y + b.h and a.y + a.h > b.y

func _hearts(layout: Dictionary) -> Dictionary:
	return {"x": layout.hearts.x, "y": layout.hearts.y, "w": layout.hearts.size * 3 + layout.hearts.gap * 2, "h": layout.hearts.size}

func _progress(layout: Dictionary) -> Dictionary:
	return {"x": layout.progress.x - layout.progress.node * 0.625, "y": layout.progress.y - layout.progress.node * 0.625,
		"w": layout.progress.w + layout.progress.node * 1.25, "h": layout.progress.node * 1.25}

func _chest(layout: Dictionary) -> Dictionary:
	return {"x": layout.loot.chest.x - 120, "y": layout.loot.chest.y - 200, "w": 240, "h": 200}

func _card_rect(point: Dictionary, scale_value: float) -> Dictionary:
	return {"x": point.x, "y": point.y, "w": 200 * scale_value, "h": 300 * scale_value}

func _new_rects(layout: Dictionary) -> Array:
	var result: Array = [_hearts(layout), _progress(layout), layout.hpBar, layout.ruleSign, layout.rainbowReady,
		{"x": layout.rainbow.x, "y": layout.rainbow.y, "w": layout.rainbow.slot * 6 + layout.rainbow.gap * 5, "h": layout.rainbow.slot},
		{"x": layout.countdown.x - layout.countdown.size / 2.0, "y": layout.countdown.y - layout.countdown.size / 2.0, "w": layout.countdown.size, "h": layout.countdown.size},
		layout.banner, layout.loot.hint, layout.loot.skip, layout.loot.take, _chest(layout)]
	result.append_array(layout.result.values())
	for key: String in ["name", "start", "resume", "practice", "record"]: result.append(layout.title[key])
	result.append({"x": layout.title.emblem.x - 200 * layout.title.emblemScale, "y": layout.title.emblem.y - 340 * layout.title.emblemScale,
		"w": 400 * layout.title.emblemScale, "h": 340 * layout.title.emblemScale})
	for point: Dictionary in layout.loot.three + layout.loot.four: result.append(_card_rect(point, layout.loot.scale))
	return result

func _adventure(layout: Dictionary) -> bool:
	for rect: Dictionary in _new_rects(layout):
		if not _inside(layout, rect): return false
	for pair: Array in [[_hearts(layout), layout.turn], [_hearts(layout), _progress(layout)], [_progress(layout), layout.rules],
		[layout.hpBar, layout.damage], [layout.hpBar, layout.ruleSign], [layout.loot.skip, layout.loot.take],
		[_hearts(layout), layout.loot.skip], [_hearts(layout), layout.loot.take], [layout.doors.enter, layout.doors.detail],
		[layout.doors.enter, layout.doors.hint], [layout.banner, _chest(layout)], [layout.result.panel, layout.result.home], [layout.result.panel, layout.result.again]]:
		if _overlap(pair[0], pair[1]): return false
	for definition: Array in [[320, layout.monsterScale.normal], [520, layout.monsterScale.boss]]:
		var monster: Dictionary = {"x": layout.dummyAnchor.x - definition[0] / 2.0 * definition[1], "y": layout.dummyAnchor.y - 400 * definition[1],
			"w": definition[0] * definition[1], "h": 400 * definition[1]}
		if _overlap(layout.ruleSign, monster): return false
	if layout.inspect.bottom > layout.hand.top or layout.inspect.bottom - 300 * layout.inspect.scale < 0: return false
	for cards: Array in [layout.loot.three, layout.loot.four]:
		for index: int in range(cards.size()):
			var rect: Dictionary = _card_rect(cards[index], layout.loot.scale)
			for other: Dictionary in [layout.loot.hint, layout.loot.skip, layout.loot.take, _hearts(layout)]:
				if _overlap(rect, other): return false
			for following: int in range(index + 1, cards.size()):
				if _overlap(rect, _card_rect(cards[following], layout.loot.scale)): return false
	var title: Array = [layout.title.start, layout.title.resume, layout.title.practice, layout.title.record]
	for index: int in range(title.size()):
		for following: int in range(index + 1, title.size()):
			if _overlap(title[index], title[following]): return false
	return true

func _fit_tests() -> void:
	for orientation: String in ["portrait", "landscape"]:
		var source: Dictionary = L.base(orientation)
		_check(orientation + " fit > returns the base layout when nothing is extra", L.fit_layout(source, 0) == source and L.fit_layout(source, -50) == source)
		for extra: int in [120, 417, 640, 2000]:
			var layout: Dictionary = L.fit_layout(source, extra)
			var grown: int = mini(extra, L.MAX_EXTRA)
			var ok: bool = layout.height == source.height + grown if orientation == "portrait" else layout.width == source.width + grown
			for key: String in ["undo", "deck", "end", "rules", "settings", "turn", "records"]: ok = ok and _inside(layout, layout[key])
			var hand: Array = L.hand_positions(8, layout)
			ok = ok and hand[0].x >= 0 and hand.back().x + L.hand_size(layout).w <= layout.width and layout.hand.top + L.hand_size(layout).h <= layout.height
			if orientation == "portrait": ok = ok and layout.table.y < layout.dummyAnchor.y and layout.table.y + layout.table.h > layout.undo.y + layout.undo.h / 2.0
			_check("%s fit > keeps buttons and the hand inside the stage with %s extra" % [orientation, extra], ok)
	for orientation: String in ["portrait", "landscape"]:
		for extra: int in [0, 1, 120, 417, 640, 2000]:
			_check("adventure layout data > %s keeps new scenes in bounds without overlapping at extra %s" % [orientation, extra], _adventure(L.fit_layout(L.base(orientation), extra)))
	for viewport: Array in [[390, 844], [360, 800], [430, 932], [405, 810], [1280, 720], [1920, 1080], [844, 390]]:
		var width: float = viewport[0]
		var height: float = viewport[1]
		var source: Dictionary = L.base("landscape" if width > height else "portrait")
		var extra: float = height / width * source.width - source.height if source.name == "portrait" else width / height * source.height - source.width
		var layout: Dictionary = L.fit_layout(source, extra)
		var scale_value: float = minf(width / layout.width, height / layout.height)
		var ok: bool = _adventure(layout)
		for rect: Dictionary in _new_rects(layout): ok = ok and (rect.x + rect.w) * scale_value <= width + 0.00000001 and (rect.y + rect.h) * scale_value <= height + 0.00000001
		_check("adventure layout data > fits adventure controls at %s×%s" % [int(width), int(height)], ok)
	var portrait: Dictionary = L.base("portrait")
	var fitted: Dictionary = L.fit_layout(portrait, 417)
	var rest: float = 417 - 300 * (fitted.hand.scale - portrait.hand.scale)
	var scene: float = rest * 0.5
	var table: float = rest - scene
	var ok: bool = fitted.progress == portrait.progress and fitted.turn == portrait.turn and _close(fitted.hpBar.y - portrait.hpBar.y, scene / 2.0) and _close(fitted.countdown.y - portrait.countdown.y, scene / 2.0)
	for key: String in ["dummyAnchor", "rackAnchor", "table", "rowStart", "formula", "turnLabel", "damage"]: ok = ok and _close(fitted[key].y - portrait[key].y, scene)
	for key: String in ["undo", "deck", "end", "hearts"]: ok = ok and _close(fitted[key].y - portrait[key].y, rest)
	for index: int in range(fitted.growth.centers.size()): ok = ok and _close(fitted.growth.centers[index].y - portrait.growth.centers[index].y, rest)
	ok = ok and _close(fitted.loot.chest.y - portrait.loot.chest.y, scene) and _close(fitted.loot.skip.y - portrait.loot.skip.y, rest) and _close(fitted.title.emblem.y - portrait.title.emblem.y, scene)
	for key: String in ["three", "four"]:
		for index: int in range(fitted.loot[key].size()): ok = ok and _close(fitted.loot[key][index].y - portrait.loot[key][index].y, scene + table / 2.0)
	_check("adventure layout data > portrait: the monster part (and damage panel) moves with the table edge, the controls stick to the bottom", ok)
	var landscape: Dictionary = L.base("landscape")
	fitted = L.fit_layout(landscape, 417)
	ok = fitted.hearts == landscape.hearts and fitted.growth == landscape.growth and fitted.turn == landscape.turn
	for key: String in ["dummyAnchor", "rackAnchor", "rowStart", "floating", "toast", "hpBar", "banner", "multiplier", "countdown"]: ok = ok and fitted[key].x - landscape[key].x == 208.5
	for key: String in ["formula", "turnLabel", "damage", "undo", "deck", "end", "rules", "settings"]: ok = ok and fitted[key].x - landscape[key].x == 417
	ok = ok and fitted.rowRight - landscape.rowRight == 417 and fitted.loot.chest.x - landscape.loot.chest.x == 208.5 and fitted.loot.skip.x - landscape.loot.skip.x == 417
	for key: String in ["three", "four"]:
		for index: int in range(fitted.loot[key].size()): ok = ok and fitted.loot[key][index].x - landscape.loot[key][index].x == 208.5
	for key: String in ["name", "start", "resume", "practice", "record"]: ok = ok and fitted.title[key].x - landscape.title[key].x == 208.5
	for key: String in ["home", "again"]: ok = ok and fitted.result[key].x - landscape.result[key].x == 417
	_check("adventure layout data > landscape: left stays, the middle moves half, the right moves all the way", ok)
	ok = true
	for source: Dictionary in [portrait, landscape]:
		var before: Dictionary = source.duplicate(true)
		L.fit_layout(source, 640); L.fit_layout(source, 120)
		ok = ok and before == source
	_check("adventure layout data > does not mutate the accepted base layout data", ok)
	ok = true
	for source: Dictionary in [portrait, landscape]:
		for value: float in [NAN, INF, -INF]: ok = ok and L.fit_layout(source, value) == source
	_check("adventure layout data > ignores invalid measurements instead of producing NaN positions", ok)

func _row_fixture(count: int, reaction: String = "plain", rainbow: bool = false) -> Array:
	var row: Array = []
	for index: int in range(count): row.append({"k": reaction, "rb": rainbow})
	return row

func _geometry_tests() -> void:
	for layout: Dictionary in [L.base("portrait"), L.fit_layout(L.base("portrait"), 300), L.base("landscape")]:
		var prefix: String = "%s %s geometry > " % [layout.name, int(layout.height)]
		var width: float = L.row_size(layout).w
		for count: int in [0, 1, 6, 7, 8, 9]:
			var hand: Array = L.hand_positions(count, layout)
			var ok: bool = hand.size() == count
			for card: Dictionary in hand: ok = ok and is_finite(card.x) and is_finite(card.y)
			if count > 0: ok = ok and _close((hand[0].x + hand.back().x + L.hand_size(layout).w) / 2.0, layout.hand.center, 0.000000005)
			if count > 1: ok = ok and hand.back().x + L.hand_size(layout).w - hand[0].x <= layout.hand.width + 0.000000001
			_check(prefix + "centers a %s-card hand without NaN" % count, ok)
		var row: Array = L.row_positions([{"k": "plain", "rb": false}, {"k": "same", "rb": false}, {"k": "shun", "rb": false}, {"k": "white", "rb": false}, {"k": "plain", "rb": false}], layout)
		var expected: Array = [floor(width * 0.6 + 0.5), width + 4, width + 4, width + 30]
		var ok: bool = true
		for index: int in range(row.size()):
			ok = ok and row[index].line == 0
			if index > 0: ok = ok and _close(row[index].x - row[index - 1].x, expected[index - 1])
		_check(prefix + "uses the reaction gaps: same overlaps 40%, shun/white snug, plain leaves a gap", ok)
		row = L.row_positions(_row_fixture(7, "shun"), layout)
		ok = row[0].x == layout.rowStart.x
		for card: Dictionary in row: ok = ok and card.x + width <= layout.rowRight + 0.000000001
		if layout.rowLines > 1:
			var second: int = -1
			for index: int in range(row.size()):
				if row[index].line == 1: second = index; break
			ok = ok and second > 0 and row[second].x == layout.rowStart.x and row[second].y == layout.rowStart.y + L.row_pitch(layout)
			for index: int in range(1, row.size()):
				if row[index].line == row[index - 1].line: ok = ok and row[index].x - row[index - 1].x == L.row_gap(layout, "shun")
		else:
			ok = ok and _close(row.back().x - row[-2].x, L.row_gap(layout, "shun"))
			for index: int in range(2, row.size()): ok = ok and row[index].x - row[index - 1].x >= row[index - 1].x - row[index - 2].x - 0.000000001
		_check(prefix + "wraps to the next line like text when there are spare lines, otherwise compresses the oldest first", ok)
		row = L.row_positions(_row_fixture(30), layout)
		ok = true
		var max_line: int = 0
		for card: Dictionary in row:
			ok = ok and card.x + width <= layout.rowRight + 0.000000001 and card.x >= layout.rowStart.x
			max_line = maxi(max_line, card.line)
		ok = ok and max_line == layout.rowLines - 1 and row.back().showLabel and row.back().showDamage and not row[0].showDamage
		if layout.rowLines > 1:
			var previous: Variant = null
			for card: Dictionary in row:
				if card.line != layout.rowLines - 1: continue
				if previous != null: ok = ok and card.x - previous.x == L.row_gap(layout, "plain")
				previous = card
		_check(prefix + "fits even 30 cards within the allowed lines and keeps the latest label and number", ok)
		var one_line: Dictionary = layout.duplicate(true)
		one_line.rowLines = 1
		var cards: Array = _row_fixture(6, "shun", true)
		cards.append({"k": "same", "rb": false})
		row = L.row_positions(cards, one_line)
		_check(prefix + "creates a symmetric rainbow arch only on chain cards", row[0].y == row[5].y and row[2].y == row[3].y and row[2].y < row[0].y and row[6].y == layout.rowStart.y)
		var hand: Array = L.hand_positions(8, layout)
		ok = hand[0].x >= 0 and hand.back().x + L.hand_size(layout).w <= layout.width
		for key: String in ["undo", "deck", "end", "rules", "settings"]: ok = ok and _inside(layout, layout[key])
		ok = ok and layout.rowStart.y + (layout.rowLines - 1) * L.row_pitch(layout) + L.row_size(layout).h + 40 <= layout.hand.region.y + 4
		ok = ok and layout.formula.y + layout.formula.h <= layout.rowStart.y and layout.formula.y + layout.formula.h <= minf(layout.undo.y, minf(layout.end.y, layout.hand.region.y)) + 1
		_check(prefix + "keeps the hand, the table rows and buttons inside the stage", ok)
	for orientation: String in ["portrait", "landscape"]:
		for extra: int in [0, 120, 417, 640]:
			for count: int in [7, 8, 9]:
				var layout: Dictionary = L.fit_layout(L.base(orientation), extra)
				var size: Dictionary = L.hand_size(layout)
				var ok: bool = true
				for card: Dictionary in L.hand_positions(count, layout):
					var angle: float = card.rotation * PI / 180.0
					for x: float in [0.0, size.w]:
						for y: float in [0.0, size.h]:
							var px: float = card.x + size.w / 2.0 + (x - size.w / 2.0) * cos(angle) - (y - size.h) * sin(angle)
							ok = ok and px >= -0.00000001 and px <= layout.width + 0.00000001
				_check("%s+%s: full rotated %s-card fan stays inside stage" % [orientation, extra, count], ok)

func run() -> Dictionary:
	passed = 0; failed = 0; names.clear(); failures.clear()
	_fit_tests()
	_geometry_tests()
	return {"passed": passed, "failed": failed, "names": names.duplicate(), "failures": failures.duplicate()}
