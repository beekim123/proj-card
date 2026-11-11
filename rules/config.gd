class_name RulesConfig
extends RefCounted
static var last_error: String = ""
const CONFIG: Dictionary = {
	"gemValue":[100,150,200], "formAt":[0,15,45],
	"deck":[{"v":1,"count":5},{"v":2,"count":5},{"v":4,"count":5},{"v":3,"count":4},{"v":6,"count":4},{"v":5,"count":4},{"v":7,"count":2},{"v":0,"count":1}],
	"reactionMultiplier":{"plain":1,"same":2,"shun":2,"white":5},
	"multiplierStart":1,"multiplierIncrement":1,"multiplierDouble":2,"rainbowMultiplier":10,
	"rainbowColors":[1,3,2,6,4,5],"handLimits":[6,7,8],"defaultHandLimit":6,
}
const GEMS: Array = [
	{"bit":1,"name":"红宝石","shortName":"红","key":"red","shape":"circle"},
	{"bit":2,"name":"绿宝石","shortName":"绿","key":"green","shape":"square"},
	{"bit":4,"name":"蓝宝石","shortName":"蓝","key":"blue","shape":"triangle"},
]
const FORMS: Array = ["原石","切好","闪光"]
const FORM_KEYS: Array = ["rough","cut","shine"]
const CARD_NAMES: Dictionary = {0:"空托",1:"红宝石",2:"绿宝石",3:"黄宝石",4:"蓝宝石",5:"品红宝石",6:"青宝石",7:"白宝石"}
const REACTION_NAMES: Dictionary = {"plain":"普通","same":"同色","shun":"顺色","white":"凑白"}
const TOOLS: Dictionary = {
	"bag":{"name":"口袋","v":2,"text":"摸 2 张","draw":2},
	"lens":{"name":"放大镜","v":4,"text":"倍率再 ×2","multiplier":2},
	"hammer":{"name":"锤子","v":1,"text":"这回合伤害 ×3","turnMultiplier":3},
	"mirror":{"name":"镜子","v":0,"text":"变成上一张缺的宝石"},
	"hourglass":{"name":"沙漏","v":6,"text":"怪出手推后 1 回合","countdown":1},
	"seal":{"name":"封条","v":0,"text":"这回合怪的规矩不算"},
	"shadow":{"name":"影子","v":0,"text":"跟上一张一模一样"},
	"whistle":{"name":"哨子","v":3,"text":"叫来 1 张额外牌","drawTool":1},
	"stone":{"name":"磨石","v":0,"text":"三颗宝石各长 5 次","xp":5},
}
const TOOL_TYPES: Array = ["bag","lens","hammer","mirror","stone","hourglass","seal","shadow","whistle"]
