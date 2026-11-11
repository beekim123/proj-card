class_name CollectionPanel
extends ScrollContainer
## Display-only collection list. Unlock eligibility stays in the rules/profile.
func setup(art: RefCounted, items: Array) -> void:
	name = "CollectionScroll"
	horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	var content: VBoxContainer = VBoxContainer.new(); content.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	content.add_theme_constant_override("separation",18); add_child(content)
	for item: Dictionary in items:
		var row: HBoxContainer = HBoxContainer.new(); row.custom_minimum_size.y = 96
		row.add_theme_constant_override("separation",20); content.add_child(row)
		var icon: Control = art.create(item.art); icon.custom_minimum_size = Vector2(80,80); row.add_child(icon)
		if not item.collected: icon.modulate = Color(0.25,0.25,0.25,0.55)
		var label: Label = Label.new(); label.text = item.name+"\n"+(item.text if item.collected else "带回这件宝物后解锁")
		label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		label.add_theme_font_override("font",art.font); label.add_theme_font_size_override("font_size",28)
		row.add_child(label)
