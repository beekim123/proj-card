class_name RulesRunTypes
extends RefCounted
## JSON records intentionally retain the TypeScript camelCase keys. Their
## GDScript runtime representation is Dictionary/Array; optional fields are
## absent, and TypeScript null unions use Variant rather than sentinel values.
static var last_error: String = ""
const NORMAL_MONSTERS: Array = ["chest", "soldier", "bear"]
const MONSTER_KEYS: Array = ["chest", "soldier", "bear", "clock", "dragon"]
const FIGHT_TYPES: Array = ["normal", "doors", "elite", "boss"]
const ADVENTURE_HAND_LIMITS: Array = [7, 8]
const RULE_IDS: Array = ["bite", "hug", "wind", "bell"]
const RELIC_IDS: Array = ["same", "once", "white", "rainbow", "heart", "grow", "start2", "slow", "first2", "twice"]
const RUN_PHASES: Array = ["relic", "battle", "loot", "doors", "shop", "act_choice", "victory", "defeat", "retreat"]
const DOOR_REWARDS: Array = ["card", "shop", "heal"]
const ACTIVE_PHASES: Array = ["relic", "battle", "loot", "doors", "shop", "act_choice"]
const TERMINAL_PHASES: Array = ["victory", "defeat", "retreat"]
const RUN_STATE_FIELDS: Array = ["act", "room", "doors", "pendingReward", "previousNormal", "hpScale", "shopsVisited", "nextCardId", "cards", "hearts", "maxHearts", "relicOptions", "relic", "relics", "handLimit", "fight", "monsters", "monster", "game", "phase", "loot", "stats", "hist", "result"]
const MONSTER_STATE_FIELDS: Array = ["key", "hp", "maxHp", "countdown", "maxCountdown", "broken", "turnStartHp", "overkill", "rule", "layer", "wind", "maxWind", "woundDown"]
const RUN_STATS_FIELDS: Array = ["turns", "bestTurn", "bestFight", "maxOverkill", "totalDamage", "fights"]
const RUN_RECORDS_FIELDS: Array = ["played", "wins", "farthest", "bestTurn", "maxOverkill"]
const RUN_RESULT_FIELDS: Array = ["outcome", "reason", "fight", "monster", "totalTurns", "bestTurn", "bestFight", "maxOverkill", "totalDamage", "gemForms", "extraCards", "newRecords", "recordsApplied"]
