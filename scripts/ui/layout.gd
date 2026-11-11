class_name GameLayout
extends RefCounted
## Exact H5 layout/fit/types and UI geometry, in design pixels.
const MAX_EXTRA: int = 640
const MOTION: Dictionary = {"cardW": 200, "cardH": 300, "inspectScale": 2, "handStep": 160, "handCurve": 4,
	"handRotation": 3, "handLift": 110, "handPickScale": 1.25, "touchOffset": 200, "dragThreshold": 12,
	"hintOffset": 40, "holdMs": 350, "rainbowLift": 48}
const ROW: Dictionary = {"labelOffset": 42, "damageGap": 8, "lineExtra": 154}
static var _bases: Dictionary = {}

static func base(name: String) -> Dictionary:
	if _bases.is_empty():
		var path: String = "res://data/layout-base.json"
		if not FileAccess.file_exists(path): path = "res://tests/layout-base.json"
		var data: Variant = JSON.parse_string(FileAccess.get_file_as_string(path))
		if data is Dictionary: _bases = data
	return _bases.get(name, _bases.get("landscape", {}))

static func _move(value: Dictionary, axis: String, amount: float) -> Dictionary:
	var result: Dictionary = value.duplicate(true)
	result[axis] += amount
	return result

static func _move_points(points: Array, axis: String, amount: float) -> Array:
	var result: Array = []
	for point: Dictionary in points: result.append(_move(point, axis, amount))
	return result

static func fit_layout(source: Dictionary, extra: float) -> Dictionary:
	var e: float = clampf(floor(extra + 0.5), 0, MAX_EXTRA) if is_finite(extra) else 0.0
	if e == 0: return source
	var result: Dictionary = source.duplicate(true)
	if source.name == "portrait":
		var hand_scale_value: float = minf(1.6, source.hand.scale + e / 2000.0)
		var grow: float = 300.0 * (hand_scale_value - source.hand.scale)
		var rest: float = e - grow
		var scene: float = rest * 0.5
		var table: float = rest - scene
		result.height = source.height + e
		result.doors.points = _move_points(source.doors.points, "y", e / 2.0)
		for key: String in ["detail", "hint", "enter"]: result.doors[key] = _move(source.doors[key], "y", e / 2.0)
		result.shop.ops = _move_points(source.shop.ops, "y", e / 2.0)
		result.shop.grid.h = source.shop.grid.h + e / 2.0
		for key: String in ["back", "confirm"]: result.shop[key] = _move(source.shop[key], "y", e)
		for key: String in ["hpBar", "ruleSign", "countdown"]: result[key] = _move(source[key], "y", scene / 2.0)
		result.inspect.bottom = source.inspect.bottom + rest
		for key: String in ["dummyAnchor", "rackAnchor", "floating", "toast", "banner", "multiplier", "rowStart", "formula", "turnLabel", "damage", "rainbow"]:
			result[key] = _move(source[key], "y", scene)
		result.light.y = source.light.y + scene; result.light.ry = source.light.ry + e / 2.0
		result.table.y = source.table.y + scene; result.table.h = source.table.h + table
		result.rowScale = minf(0.95, source.rowScale + table / 1400.0)
		result.rainbowReady = _move(source.rainbowReady, "y", rest)
		result.relicPick.points = _move_points(source.relicPick.points, "y", scene + table / 2.0)
		result.hearts.y = source.hearts.y + rest
		result.growth.centers = _move_points(source.growth.centers, "y", rest)
		result.hand.region.y = source.hand.region.y + rest
		result.hand.region.h = source.hand.region.h + grow
		result.hand.top = source.hand.top + rest; result.hand.scale = hand_scale_value
		for key: String in ["undo", "deck", "end"]: result[key] = _move(source[key], "y", rest)
		for key: String in ["three", "four"]: result.loot[key] = _move_points(source.loot[key], "y", scene + table / 2.0)
		result.loot.hint = _move(source.loot.hint, "y", scene + table / 2.0)
		for key: String in ["skip", "take"]: result.loot[key] = _move(source.loot[key], "y", rest)
		result.loot.chest = _move(source.loot.chest, "y", scene)
		result.result.panel.y = source.result.panel.y + scene
		result.result.panel.h = source.result.panel.h + table
		for key: String in ["home", "again"]: result.result[key] = _move(source.result[key], "y", rest)
		result.title.name = _move(source.title.name, "y", scene / 2.0)
		result.title.emblem = _move(source.title.emblem, "y", scene)
		for key: String in ["start", "resume", "practice", "record"]: result.title[key] = _move(source.title[key], "y", scene + table / 2.0)
		return result
	var half: float = e / 2.0
	result.width = source.width + e
	result.doors.points = _move_points(source.doors.points, "x", half)
	for key: String in ["detail", "hint"]: result.doors[key] = _move(source.doors[key], "x", half)
	result.doors.enter = _move(source.doors.enter, "x", e)
	result.shop.ops = _move_points(source.shop.ops, "x", half)
	for key: String in ["grid", "back", "confirm"]: result.shop[key] = _move(source.shop[key], "x", half)
	for key: String in ["knocker", "knockerSay", "actLabel", "progress", "hpBar", "ruleSign", "countdown", "dummyAnchor", "rackAnchor", "floating", "toast", "banner", "multiplier", "rowStart", "rainbowReady"]:
		result[key] = _move(source[key], "x", half)
	for key: String in ["rules", "settings", "formula", "turnLabel", "damage", "rainbow", "undo", "deck", "end"]:
		result[key] = _move(source[key], "x", e)
	result.light.x = source.light.x + half; result.light.rx = source.light.rx + half
	result.table.w = source.table.w + e; result.rowRight = source.rowRight + e
	result.relicPick.points = _move_points(source.relicPick.points, "x", half)
	result.hand.region.x = source.hand.region.x + half / 2.0
	result.hand.region.w = source.hand.region.w + half
	result.hand.center = source.hand.center + half; result.hand.width = source.hand.width + half
	for key: String in ["three", "four"]: result.loot[key] = _move_points(source.loot[key], "x", half)
	for key: String in ["hint", "chest"]: result.loot[key] = _move(source.loot[key], "x", half)
	for key: String in ["skip", "take"]: result.loot[key] = _move(source.loot[key], "x", e)
	result.result.panel = _move(source.result.panel, "x", half)
	for key: String in ["home", "again"]: result.result[key] = _move(source.result[key], "x", e)
	for key: String in ["name", "emblem", "start", "resume", "practice", "record"]: result.title[key] = _move(source.title[key], "x", half)
	return result

static func hand_size(layout: Dictionary) -> Dictionary:
	return {"w": MOTION.cardW * layout.hand.scale, "h": MOTION.cardH * layout.hand.scale}

static func row_size(layout: Dictionary) -> Dictionary:
	return {"w": MOTION.cardW * layout.rowScale, "h": MOTION.cardH * layout.rowScale}

static func row_pitch(layout: Dictionary) -> float:
	return row_size(layout).h + ROW.lineExtra

static func row_gap(layout: Dictionary, reaction: String) -> float:
	var width: float = row_size(layout).w
	return floor(width * 0.6 + 0.5) if reaction == "same" else width + (30 if reaction == "plain" else 4)

static func min_row_gap(layout: Dictionary) -> float:
	return floor(row_size(layout).w * 0.37 + 0.5)

static func growth_rects(layout: Dictionary) -> Array:
	var result: Array = []
	var size: float = layout.growth.size
	var label_gap: float = layout.growth.labelGap
	for center: Dictionary in layout.growth.centers:
		if layout.growth.labelSide == "left": result.append({"x": center.x - size / 2.0 - 160, "y": center.y - size / 2.0, "w": size + 170, "h": size})
		else: result.append({"x": center.x - size / 2.0 - 20, "y": center.y - size / 2.0, "w": size + 40, "h": size + label_gap + 36})
	return result

static func hand_scale(count: int, layout: Dictionary) -> float:
	if count <= 8: return layout.hand.scale
	var width: float = MOTION.cardW * layout.hand.scale
	return layout.hand.scale * minf(1.0, layout.hand.width / (width + (count - 1) * layout.handMinStep))

static func hand_positions(count: int, layout: Dictionary) -> Array:
	var positions: Array = []
	if count > 8:
		var scale_value: float = hand_scale(count, layout)
		var width: float = MOTION.cardW * scale_value
		var step: float = minf(MOTION.handStep, (layout.hand.width - width) / float(count - 1))
		var left: float = layout.hand.center - (width + step * (count - 1)) / 2.0
		for index: int in range(count): positions.append({"x": left + index * step, "y": layout.hand.top, "rotation": 0})
		return positions
	var size: Dictionary = hand_size(layout)
	var radius: float = maxf(0, (count - 1) / 2.0)
	var angle: float = radius * MOTION.handRotation * PI / 180.0
	var rotated_half_width: float = size.w / 2.0 * cos(angle) + size.h * sin(angle)
	var room: float = minf(layout.hand.width / 2.0, minf(layout.hand.center, layout.width - layout.hand.center))
	var step: float = 0 if count <= 1 else maxf(0, minf(MOTION.handStep, (room - rotated_half_width) / radius))
	for index: int in range(count):
		var distance: float = index - radius
		positions.append({"x": layout.hand.center + distance * step - size.w / 2.0, "y": layout.hand.top + distance * distance * MOTION.handCurve, "rotation": distance * MOTION.handRotation})
	return positions

static func compress(gaps: Array, room: float, minimum: float) -> void:
	var overflow: float = 0
	for gap: float in gaps: overflow += gap
	overflow -= room
	for index: int in range(gaps.size()):
		if overflow <= 0: break
		var reduction: float = minf(overflow, maxf(0, gaps[index] - minimum))
		gaps[index] -= reduction; overflow -= reduction
	if overflow > 0 and not gaps.is_empty(): gaps.fill(maxf(0, room / gaps.size()))

static func row_positions(row: Array, layout: Dictionary) -> Array:
	var count: int = row.size()
	if count == 0: return []
	var width: float = row_size(layout).w
	var room: float = layout.rowRight - layout.rowStart.x - width
	var minimum: float = min_row_gap(layout)
	var natural: Array = []
	for index: int in range(count): natural.append(row_gap(layout, row[index].k) if index > 0 else 0)
	var max_lines: int = maxi(1, int(layout.rowLines))
	var starts: Array = [0]
	var used_x: float = 0
	for index: int in range(1, count):
		if used_x + natural[index] > room: starts.append(index); used_x = 0
		else: used_x += natural[index]
	if starts.size() > max_lines:
		if max_lines == 1: starts = [0]
		else:
			var first: int = count - 1
			var used: float = 0
			while first > 0 and used + natural[first] <= room: used += natural[first]; first -= 1
			var earlier: int = first
			var lines: int = max_lines - 1
			starts = []
			for index: int in range(lines):
				var beginning: int = int(floor(float(index * earlier) / lines))
				if starts.is_empty() or beginning > starts.back(): starts.append(beginning)
			starts.append(first)
	var gaps: Array = natural.duplicate()
	var line_of: Array = []
	line_of.resize(count); line_of.fill(0)
	for line: int in range(starts.size()):
		var beginning: int = starts[line]
		var end: int = starts[line + 1] if line + 1 < starts.size() else count
		gaps[beginning] = 0
		for index: int in range(beginning, end): line_of[index] = line
		var inner: Array = gaps.slice(beginning + 1, end)
		compress(inner, room, minimum)
		for index: int in range(inner.size()): gaps[beginning + 1 + index] = inner[index]
	var rainbow: Array = []
	for index: int in range(count):
		if row[index].get("rb", false): rainbow.append(index)
	var wide: float = width * 0.66
	var pitch: float = row_pitch(layout)
	var x: float = layout.rowStart.x
	var result: Array = []
	for index: int in range(count):
		var first: bool = starts.has(index)
		x = layout.rowStart.x if first else x + gaps[index]
		var last: bool = index == count - 1 or starts.has(index + 1)
		var rainbow_index: int = rainbow.find(index)
		var lift: float = floor(sin(PI * (rainbow_index + 0.5) / rainbow.size()) * MOTION.rainbowLift + 0.5) if rainbow_index >= 0 else 0
		result.append({"x": x, "y": layout.rowStart.y + line_of[index] * pitch - lift, "line": line_of[index],
			"showLabel": index == count - 1 or (index > 0 and (first or gaps[index] >= wide)),
			"showDamage": index == count - 1 or last or gaps[index + 1] >= wide})
	return result
