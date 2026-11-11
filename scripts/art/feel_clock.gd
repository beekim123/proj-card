class_name FeelClock
extends RefCounted
## One presentation clock, advanced once per UI frame. Time is in milliseconds.

var time_ms: float = 0.0
var speed: float = 1.0
var fast: bool = false
var _freeze_left: float = 0.0
var _slow_left: float = 0.0

func advance(delta: float) -> float:
	var remaining: float = maxf(0.0, delta * 1000.0)
	var before: float = time_ms
	while remaining > 0.000001:
		var step: float = remaining
		if _freeze_left > 0.0:
			step = minf(step, _freeze_left)
		if _slow_left > 0.0:
			step = minf(step, _slow_left)
		var frozen: bool = _freeze_left > 0.0
		var rate: float = speed * (0.5 if _slow_left > 0.0 and not fast else 1.0)
		if not frozen:
			time_ms += step * rate
		_freeze_left = maxf(0.0, _freeze_left - step)
		_slow_left = maxf(0.0, _slow_left - step)
		remaining -= step
	return time_ms - before

func freeze(ms: float = 60.0) -> void:
	_freeze_left = clampf(ms, 0.0, 120.0) * (0.5 if fast else 1.0)

func slow(ms: float = 300.0) -> void:
	if not fast:
		_slow_left = maxf(0.0, ms)

func configure(settings: Dictionary) -> void:
	fast = settings.get("animationSpeed", "normal") == "fast"
	if fast:
		_slow_left = 0.0

func reset() -> void:
	time_ms = 0.0
	speed = 1.0
	_freeze_left = 0.0
	_slow_left = 0.0
