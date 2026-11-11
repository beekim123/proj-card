extends SceneTree
## Cross-host pack validation; does not claim Windows OS/input/driver testing.
func _init() -> void:
	var failures: Array[String] = []
	var core: GDScript = load("res://rules/index.gd") as GDScript
	var run: GDScript = load("res://rules/run.gd") as GDScript
	if core == null or run == null: failures.append("native rule bytecode missing")
	else:
		var state: Dictionary = run.create_run(1979)
		if state.get("phase") != "relic" or state.get("cards",[]).size() != 30: failures.append("packed rules initial state")
		if core.format_number(12345) != "1.235万": failures.append("packed rounding")
	for filename: String in ["art/art-manifest.json","art/sprites/sprites.json","art/inspector/sprites.json","data/layout-base.json","data/ui-copy.json","audio/sounds.json","fonts/OFL.txt"]:
		if not FileAccess.file_exists("res://"+filename): failures.append(filename+" missing")
	for id: String in ["mon_dragon","mon_clock","title_emblem","ui_rule_sign","inspector_mon_chest","inspector_mon_bear"]:
		var image: Texture2D = load("res://art/sprites/%s.png" % id) as Texture2D
		if image == null or image.get_width() <= 0: failures.append(id+" imported texture missing")
	for weight: String in ["Regular","Bold"]:
		if load("res://fonts/NotoSansCJKsc-%s.otf" % weight) == null: failures.append(weight+" font missing")
	if load("res://audio/card_0_v2.wav") == null: failures.append("WAV resource missing")
	for failure: String in failures: printerr(failure)
	print("PACK_PROBE ","全部通过" if failures.is_empty() else "失败", "; platform=",OS.get_name())
	quit(0 if failures.is_empty() else 1)
