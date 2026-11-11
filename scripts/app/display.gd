extends RefCounted
## Identify the built-in screen from fresh native metadata, then verify with Godot.
static func place(window: Window) -> bool:
	if DisplayServer.get_name() == "headless" or OS.get_name() != "macOS": return true
	var output: Array = []
	var probe: String = OS.get_environment("GEMCARD_DISPLAY_PROBE")
	if probe.is_empty():
		var packaged: String = OS.get_executable_path().get_base_dir().path_join("display-probe")
		if FileAccess.file_exists(packaged): probe = packaged
	if probe.is_empty() or OS.execute(probe, [], output) != 0:
		push_error("无法可靠识别Mac内屏，请通过启动.command启动。"); return false
	var native: Variant = JSON.parse_string("".join(output))
	if not native is Dictionary or int(native.get("builtin_count",0)) != 1:
		return false
	var target: int = int(native.get("builtin_index", -1))
	if target < 0 or target >= DisplayServer.get_screen_count(): return false
	var scale_factor: float = float(native.max_scale)
	var origin: Vector2i = Vector2i.ZERO
	for item: Dictionary in native.screens:
		var frame: Array = item.frame
		var corner: Vector2i = Vector2i(Vector2(float(frame[0]), float(frame[1])+float(frame[3])) * scale_factor)
		origin.x = mini(origin.x,corner.x); origin.y = maxi(origin.y,corner.y)
	for item: Dictionary in native.screens:
		var index: int = int(item.index)
		var frame: Array = item.frame
		var expected_size: Vector2i = Vector2i(Vector2(float(frame[2]),float(frame[3])) * scale_factor)
		var expected_position: Vector2i = Vector2i(Vector2(float(frame[0]),float(frame[1])+float(frame[3])) * scale_factor)-origin
		expected_position.y = -expected_position.y
		if DisplayServer.screen_get_size(index) != expected_size or DisplayServer.screen_get_position(index) != expected_position:
			push_error("内屏与Godot屏幕映射不一致，已停止显示窗口。"); return false
	window.current_screen = target
	var screen_size: Vector2i = DisplayServer.screen_get_size(target)
	var maximum: Vector2i = Vector2i(screen_size.x-100,screen_size.y-160)
	if window.size.x > maximum.x or window.size.y > maximum.y:
		var ratio: float = minf(float(maximum.x)/window.size.x,float(maximum.y)/window.size.y)
		window.size = Vector2i(Vector2(window.size)*ratio)
	window.position = DisplayServer.screen_get_position(target)+(screen_size-window.size)/2
	print("GEMCARD_DISPLAY builtin=%d origin=%s screen_size=%s window_position=%s window_size=%s" % [target,DisplayServer.screen_get_position(target),screen_size,window.position,window.size])
	return true
