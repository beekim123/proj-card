class_name SoundPlayer
extends Node
## Offline recordings of the original H5 SoundSystem, including its compressor and volumes.

const MAX_VOICES: int = 96
var sound_enabled: bool = true
var volume: int = 2
var _voices: Array[AudioStreamPlayer] = []
var _streams: Dictionary = {}

func configure(settings: Dictionary) -> void:
	if settings.has("sound"):
		sound_enabled = bool(settings["sound"])
	if int(settings.get("volume", volume)) in [1, 2, 3]:
		volume = int(settings.get("volume", volume))
	if not sound_enabled:
		stop_all()

func _notification(what: int) -> void:
	if what == NOTIFICATION_APPLICATION_FOCUS_OUT:
		stop_all()

func _play(name_key: String) -> void:
	if not sound_enabled or not is_inside_tree():
		return
	var filename: String = "res://audio/%s_v%d.wav" % [name_key, volume]
	if not _streams.has(filename):
		var stream: AudioStream
		if (OS.has_feature("template") and ResourceLoader.exists(filename)) or FileAccess.file_exists(filename + ".import"):
			stream = load(filename) as AudioStream
		elif FileAccess.file_exists(filename):
			stream = AudioStreamWAV.load_from_file(filename)
		if stream == null:
			push_warning("音效尚未录制：" + filename)
			return
		_streams[filename] = stream
	while _voices.size() >= MAX_VOICES:
		var oldest: AudioStreamPlayer = _voices.pop_front()
		oldest.stop()
		oldest.queue_free()
	var player: AudioStreamPlayer = AudioStreamPlayer.new()
	player.stream = _streams[filename]
	add_child(player)
	_voices.append(player)
	player.finished.connect(func() -> void:
		_voices.erase(player)
		player.queue_free()
	)
	player.play()

func _card_index(index: int) -> int:
	return clampi(index, 0, 14)

func play_card(index: int) -> void:
	_play("card_%d" % _card_index(index))

func double(index: int) -> void:
	_play("double_%d" % _card_index(index))

func shadow(index: int) -> void:
	_play("shadow_%d" % _card_index(index))

func hit(big: bool = false) -> void:
	_play("hit_big" if big else "hit")

func rule(id: String) -> void:
	if id in ["bite", "hug", "unwind", "wound_down", "bell", "layer"]:
		_play("rule_" + id)

func pierce() -> void:
	_play("pierce")
func white() -> void:
	_play("white")
func rainbow() -> void:
	_play("rainbow")
func heart_lose() -> void:
	_play("heart_lose")
func heal() -> void:
	_play("heal")
func draw() -> void:
	_play("draw")
func button() -> void:
	_play("button")
func hourglass() -> void:
	_play("hourglass")
func seal() -> void:
	_play("seal")
func unseal() -> void:
	_play("unseal")
func whistle() -> void:
	_play("whistle")
func slow_beat() -> void:
	_play("slow_beat")
func shop_remove() -> void:
	_play("shop_remove")
func shop_copy() -> void:
	_play("shop_copy")
func door_open() -> void:
	_play("door_open")

func stop_all() -> void:
	for player: AudioStreamPlayer in _voices:
		if is_instance_valid(player):
			player.stop()
			player.queue_free()
	_voices.clear()

func dispose() -> void:
	stop_all()
	_streams.clear()
