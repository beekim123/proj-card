extends RefCounted
const Oracle: GDScript = preload("res://tests/oracle_runner.gd")
func run() -> Dictionary:
	return Oracle.new().run_files(["rules.test.ts","extra-cards.test.ts","number-rounding.test.ts","save-state.test.ts"])
