class_name RulesRunConfig
extends RefCounted
## Exact authored values from h5/src/rules/run-config.ts. RUN is mutable for the
## same explicit tuning/debug scenarios supported by the TypeScript source.
static var last_error: String = ""
const HALL: Dictionary = {
	"id": "hall", "name": "门厅", "normalMonsters": ["chest", "soldier", "bear"],
	"rooms": [
		{"type": "normal", "hp": 20000, "countdown": 3},
		{"type": "doors", "hp": 40000, "countdown": 3},
		{"type": "elite", "monster": "clock", "hp": 100000, "countdown": 3, "handUp": 1, "healFull": true, "relic": true},
		{"type": "doors", "hp": 250000, "countdown": 3},
		{"type": "doors", "hp": 450000, "countdown": 3},
		{"type": "boss", "monster": "dragon", "hp": 1000000, "countdown": 4},
	],
}
const LEGACY_TOOL_POOL: Array = ["bag","lens","hammer","mirror","stone","hourglass","seal","shadow","whistle"]
const LEGACY_RELIC_POOL: Array = ["start2","slow","first2","twice","same","once","white","rainbow","heart","grow"]
const INITIAL_COLLECTION: Array = ["same","once","white","rainbow","heart","grow"]
static var LEGACY_RUN: Dictionary = {
	"toolPool":LEGACY_TOOL_POOL, "relicPool":LEGACY_RELIC_POOL, "startPool":LEGACY_RELIC_POOL, "legacy":true,
	"acts": [HALL], "fights": HALL.rooms, "normalMonsters": HALL.normalMonsters,
	"doorRewards": ["card", "shop", "heal"], "hearts": 3, "handStart": 7, "handMax": 8, "handHardMax": 12,
	"lootCount": 3, "lootBonusCount": 4, "lootBonusOverkill": 10, "relicOptions": 3, "toolCap": 2,
	"shop": {"dropMax": 3, "copyCount": 1, "minDeck": 20}, "healDoor": 1, "hpScale": 1,
	"hpLayers": {"normal": 1, "doors": 1, "elite": 2, "boss": 3},
}
const MONSTERS: Dictionary = {
	"box":{"name":"弹簧盒","line":"一张探头，一张缩回去。","rule":"duck"},
	"portrait":{"name":"画像","line":"一颗宝石？它可不吃。","rule":"picky"},
	"lock":{"name":"大挂锁","line":"数到六，咔哒一声。","rule":"six"},
	"chest": {"name": "宝箱怪", "line": "谁碰它的宝石，它就咬谁。", "rule": "bite"},
	"soldier": {"name": "发条兵", "line": "拧一圈，走三步，扎一下。", "rule": "wind", "countdown": 2, "wind": 4},
	"bear": {"name": "布偶熊", "line": "死死抱着一颗宝石，谁也不给。", "rule": "hug"},
	"clock": {"name": "老座钟", "line": "钟一响，它就打人。", "rule": "bell"},
	"dragon": {"name": "宝石龙", "line": "吞下了古堡里最大的那颗宝石。", "rule": "layers", "rules": ["hug", "bite", "bell"]},
}
const RULES: Dictionary = {
	"duck": {"name":"缩头","text":"第2、4、6张牌伤害为0，其他效果照常。"},
	"picky": {"name":"挑食","text":"单色宝石底数算0，其他效果照常。"},
	"six": {"name":"限六张","text":"每回合最多打6张牌。"},
	"bite": {"name": "咬手", "text": "每打一张带绿的牌，它出手提前 1 回合。", "gem": 1, "countdown": -1},
	"hug": {"name": "抱红", "text": "红宝石打它算 0。倍率、反应、成长照旧。", "gem": 0},
	"wind": {"name": "上发条", "text": "打出带蓝的牌，它的发条松一圈；松完 4 圈，这次出手作废。", "gem": 2},
	"bell": {"name": "敲钟", "text": "每凑白一次，它出手提前 1 回合。", "countdown": -1},
	"layers": {"name": "三层脾气", "text": "血每掉一层，换一条规矩：抱红 → 咬手 → 敲钟。"},
}
const RELICS: Dictionary = {
	"red":{"name":"红宝石加倍","text":"红宝石底数 ×2。"},
	"green":{"name":"绿宝石加倍","text":"绿宝石底数 ×2。"},
	"blue":{"name":"蓝宝石加倍","text":"蓝宝石底数 ×2。"},
	"shun":{"name":"顺色 ×3","text":"顺色的伤害 ×3。"},
	"same4":{"name":"同色 ×4","text":"同色的伤害 ×4。"},
	"start2": {"name": "倍率从 2 起", "text": "每回合倍率从 2 开始。", "startMultiplier": 2},
	"slow": {"name": "慢一拍", "text": "怪出手的倒计时都多 1 回合。", "countdown": 1},
	"first2": {"name": "开打多摸两张", "text": "每一仗的第一回合多摸 2 张。", "draw": 2},
	"twice": {"name": "头一张打两次", "text": "每回合打出的第一张额外牌，效果算两次。", "times": 2},
	"same": {"name": "同色也翻倍", "text": "同色也让倍率翻倍。"},
	"once": {"name": "断一次不算", "text": "每回合第一次没反应，算作顺色。"},
	"white": {"name": "凑白 ×8", "text": "凑白的伤害 ×8（原来 ×5）。", "whiteMultiplier": 8},
	"rainbow": {"name": "五色彩虹", "text": "顺色连满 5 种颜色就出彩虹。", "rainbowColors": 5},
	"heart": {"name": "多一颗心", "text": "心的上限变成 4。", "hearts": 1},
	"grow": {"name": "宝石长得快", "text": "宝石用 8 次切好、24 次闪光。", "formAt": [0, 8, 24]},
}
const RELIC_IDS: Array = ["start2", "slow", "first2", "twice", "same", "once", "white", "rainbow", "heart", "grow", "red", "green", "blue", "shun", "same4"]

static var RUN: Dictionary = make_current()
static func use_legacy() -> void:
	RUN = LEGACY_RUN.duplicate(true)
static func make_current() -> Dictionary:
	var value: Dictionary = LEGACY_RUN.duplicate(true)
	var hall: Dictionary = HALL.duplicate(true)
	hall.dragonRules = ["hug","bite","bell"]
	hall.rooms[5].merge({"healFull":true,"relic":true,"afterRelic":"act_choice","canContinue":true})
	var corridor: Dictionary = {"id":"corridor","name":"长廊","normalMonsters":["box","portrait","chest","soldier","bear"],"dragonRules":["picky","duck","six"],"rooms":[
		{"type":"normal","hp":500000,"countdown":3},
		{"type":"doors","hp":700000,"countdown":3},
		{"type":"elite","monster":"lock","hp":500000,"countdown":3,"handUp":0,"healFull":true,"relic":true},
		{"type":"doors","hp":1100000,"countdown":3},
		{"type":"doors","hp":1700000,"countdown":3},
		{"type":"boss","monster":"dragon","hp":3000000,"countdown":4,"healFull":true,"relic":true,"afterRelic":"act_choice","canContinue":false}]}
	value.acts = [hall,corridor]; value.fights = []
	for act: Dictionary in value.acts: value.fights.append_array(act.rooms)
	value.toolPool = preload("res://rules/config.gd").TOOL_TYPES.duplicate()
	value.relicPool = RELIC_IDS.duplicate(); value.startPool = INITIAL_COLLECTION.duplicate(); value.legacy = false
	return value
static func use_current() -> void:
	RUN = make_current()
