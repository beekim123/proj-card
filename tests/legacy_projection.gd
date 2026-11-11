extends RefCounted
## Fixed allowlist. Any other unexpected/missing field remains a failure.
const NEW_FIELDS: Array[String] = ["runId", "relicPurpose", "contentVersion", "layerRules", "startingRelics"]
static func strip(value: Variant) -> Variant:
	if value is Dictionary:
		var result: Dictionary = {}
		for key: Variant in value:
			if key not in NEW_FIELDS: result[key] = strip(value[key])
		return result
	if value is Array:
		var result: Array = []
		for item: Variant in value: result.append(strip(item))
		return result
	return value
static func hydrate(value: Variant) -> void:
	if value is Dictionary:
		if value.get("key") == "dragon" and value.get("rule") == "layers": value.layerRules = ["hug","bite","bell"]
		for key: Variant in value: hydrate(value[key])
	elif value is Array:
		for item: Variant in value: hydrate(item)
