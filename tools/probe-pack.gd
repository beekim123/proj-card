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
	for filename: String in ["art/art-manifest.json","art/sprites/sprites.json","art/new-art-provenance.json","data/layout-base.json","data/ui-copy.json","audio/sounds.json","fonts/OFL.txt"]:
		if not FileAccess.file_exists("res://"+filename): failures.append(filename+" missing")
	for id: String in ["mon_dragon","mon_clock","title_emblem","ui_rule_sign","mon_chest","mon_bear","mon_tree","mon_armor"]:
		var image: Texture2D = load("res://art/sprites/%s.png" % id) as Texture2D
		if image == null or image.get_width() <= 0: failures.append(id+" imported texture missing")
	var manifest: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://art/art-manifest.json"))
	var provenance: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://art/new-art-provenance.json"))
	var sprites: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://art/sprites/sprites.json"))
	if manifest.get("assets",[]).size() != 118 or provenance.get("assets",{}).size() != 118 or sprites.get("assets",{}).size() != 182: failures.append("packed new art coverage")
	if manifest.get("artStyle","") != "fable-carbon-remake" or sprites.get("eventFps",0) != 30 or sprites.get("loopFps",0) != 15: failures.append("packed new art style/fps")
	for definition: Dictionary in manifest.get("assets",[]):
		var id: String = definition.id
		var source_hash: String = str(provenance.get("assets",{}).get(id,{}).get("svg_sha256",""))
		# Source SVGs are intentionally ignored by the runtime export. Their full
		# original identity is checked in the workspace; the pack carries fingerprints.
		var source_path: String = "res://art/svg/%s.svg" % id
		if FileAccess.file_exists(source_path) and FileAccess.get_file_as_string(source_path).sha256_text() != source_hash: failures.append("source identity "+id)
		var resource: Resource = load("res://art/resources/%s.tres" % id)
		if resource == null: failures.append("packed native metadata "+id)
		else:
			if resource.get("svg_fingerprint") != source_hash.substr(0,16): failures.append("packed native fingerprint "+id)
			if resource.get("definition").get("artStyle","") != "fable-carbon-remake" or resource.get("definition").get("nativePlaceholder",false): failures.append("packed native art style "+id)
			for animation: String in resource.get("animations").values():
				if not ResourceLoader.exists(animation): failures.append("packed animation "+animation)
	for name: String in sprites.get("assets",{}):
		var entry: Dictionary = sprites.assets[name]
		var id: String = name.get_slice("@",0)
		if entry.get("hash","") != str(provenance.get("assets",{}).get(id,{}).get("svg_sha256","")).substr(0,16) or entry.get("placeholder",false) or entry.get("inspectorPlaceholder",false): failures.append("packed sprite fingerprint "+name)
		if not ResourceLoader.exists("res://art/sprites/"+str(entry.still)): failures.append("packed still "+str(entry.still))
		for sheet: Dictionary in entry.sheets:
			if not ResourceLoader.exists("res://art/sprites/"+str(sheet.f)): failures.append("packed atlas "+str(sheet.f))
	if FileAccess.file_exists("res://art/inspector/sprites.json") or FileAccess.file_exists("res://art/placeholders/sprites.json"): failures.append("obsolete placeholder registry packed")
	for weight: String in ["Regular","Bold"]:
		if load("res://fonts/NotoSansCJKsc-%s.otf" % weight) == null: failures.append(weight+" font missing")
	if load("res://audio/card_0_v2.wav") == null: failures.append("WAV resource missing")
	for failure: String in failures: printerr(failure)
	print("PACK_PROBE ","全部通过" if failures.is_empty() else "失败", "; platform=",OS.get_name())
	quit(0 if failures.is_empty() else 1)
