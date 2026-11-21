// 行走用米，时间用秒，角度用弧度。美术替换接口见交付结果。
export const AUTO_WALK = false;
export const GAME = {
  step: 1 / 120, width: 1440, sensitivity: .0021, walk: 3.2, run: 6.1,
  pitchDown: 4 * Math.PI / 180, pitchUp: 7 * Math.PI / 180, battleYaw: Math.PI / 30, battlePitch: Math.PI / 120,
  turnEase: 6.5, scanEase: 6, encounter: [30, 50],
  pickupRange: 2, pickupHalfWidth: .20, pickupBase: .10, pickupAboveCard: .25,
  arrival: 1.15, recoil: .35, castLead: .24, hitInterval: .16, castEnd: .38,
  attackLength: 1.3, strike: .53, deathLength: .92, scatter: .64, floatTime: .93,
  hitFlash: .28, appear: .65, ringFade: .7, lootDrop: .45,
  autoSeconds: 60, autoSeed: 1200, limitMs: 17.5, latePercent: 1
};
// 试玩实验（2026-11-19 用户要）：怪的血量压低，一次施法就能打死。只在游戏里开；npm test（node）里关掉，基线不变。
// 回归测试按原血量走：网址带 ?fullhp（Electron 用 --fullhp）就关掉。
export const EXPERIMENT = {lowHp: typeof document !== 'undefined' && !new URLSearchParams(location.search).has('fullhp'), hpNormal: 40, hpElite: 60};
// 色环索引：红、黄、绿、青、蓝、紫；6 为白（圆心），7 变色，8 无色。
export const RULES = {
  hearts: 3, healElite: 1, handSize: 8, maxHandSize: 12, turnLimit: 10, eliteEvery: 4,
  baseDamage: 5, gemLevelStep: 10, gemLevelGrowth: 1.2,
  multiplier: 2, critChance: 0.1, critFactor: 1.5, rainbowFactor: 3,
  hpNormal: 3000, hpElite: 4600, hpGrowth: 1.1,
  dimPerLamp: 0.1, attacksBeforeRage: 2, attackDamage: 1,
  lootCount: 3, colors: ['红', '黄', '绿', '青', '蓝', '紫', '白', '变色', '无色'],
  masks: [1, 3, 2, 6, 4, 5, 7],
  deckCounts: [5, 4, 5, 4, 5, 4, 2],
  groups: [
    [['badom', 1]], [['badom', 0.55], ['tiko', 0.55]],
    [['tiko', 0.38], ['tiko', 0.38], ['tiko', 0.38]]
  ],
  eliteGroup: [['tiko', 0.25], ['elite', 0.8]],
  monsters: {
    badom: {name: '巴多姆', countdown: 3, attackDamage: 1, rule: '厚皮 · 白光伤害为零'},
    tiko: {name: '提可', countdown: 4, attackDamage: 0.5, rule: '躲光 · 回合初每灯减伤一成'},
    elite: {name: '大巴多姆', countdown: 3, attackDamage: 1, rule: '厚皮免白光 · 每次合白倒计时 −1'}
  },
  loot: ['lens', 'rain', 'light', 'mirror', 'ice', 'shield'],
  extras: {
    lens: {name: '放大镜', col: 4, vals: [0, 0, 1], text: '倍率 ×2'},
    rain: {name: '火雨', col: 0, vals: [1, 0, 0], text: '再打 4 × 倍率 发，每发 3'},
    light: {name: '点灯', col: 8, vals: [0, 0, 0], text: '点亮当前色两边没亮的灯（最多 2 盏）'},
    mirror: {name: '镜子', col: 7, vals: [0, 0, 0], text: '变成当前色的补色'},
    ice: {name: '冰锥', col: 8, vals: [0, 0, 0], text: '固定伤害 60（不吃倍率，不怕特性）'},
    shield: {name: '护盾', col: 8, vals: [0, 0, 0], instant: true, text: '挡掉怪的下一次攻击'},
    seal: {name: '封印·大巴多姆', col: 8, vals: [0, 0, 0], text: '打 4 × 倍率 发，每发 6；这回合每合白一次，再多打 1 × 倍率 发'}
  },
  rainHits: 4, rainPoints: 3, iceDamage: 60,
  sealHits: 4, sealPoints: 6, relight: 2
};
// 森林配方。单位为米，镜头与镜头样例共用眼高和横向视角。
export const WORLD = {
  chunk: 20, cell: 4, jitter: .78, noiseScale: 27, clearing: .28,
  groupChance: [.20,.88], extraTrees: [.38,.17], groupRadius: [1.05,1.8],
  sapling: [.7,1],
  // Each variant has one canvas size in metres. Floating sprites retain their SVG aspect.
  sizes: {
    tree: [[3.60,16],[3.16,13.6],[3.80,14.8],[2.60,12.2],[2.36,8.5],[2.70,9.8]],
    vine: [[.56,.80],[.80,1.40],[1.14,2.20]],
    shrub: [[1.18,.61],[.87,.67],[.64,.58],[.55,.32]],
    grass: [[.75,.40],[.42,.48],[.54,.31],[.25,.17]],
    rock: [[1.08,.34],[.73,.59],[.42,.27]], log: [[2.65,.42],[1.35,.23]],
    mote: [[.12,.12]], low_fog: [[10,1.50],[10,1.50]],
    fall: [[.19,.19*72/116],[.145,.145*72/116]],
    eyes: [[.46,.46*48/132],[.22,.132],[.72,.72*50/194]]
  },
  trunks: [.78,.60,.70,.50,.32,.38],
  // Metres right/up from the centre of the foot in the unmirrored original.
  hooks: [
    [[1.12,4.23],[-.93,6.47]], [[-1.23,3.10],[.96,5.13]],
    [[-1.13,4.04],[1.19,6.15]], [[-.79,3.88],[.70,4.92]],
    [[-.76,3.13]], [[1.08,3.37],[-.37,5.74]]
  ],
  ambience: {
    fogChance: [.95,.82], fogNear: [4,9], fogOpacity: [.58,.45],
    fallChance: .045, fallPeriod: 7.4, fallDuration: 4.4, fallDrop: 2.8, fallDrift: .57,
    eyesChance: .14, eyesDensity: .54, eyesRange: [15,35], eyesBandFade: 3,
    eyesPeriod: 14, eyesDuration: 1.8, eyeBlinkAt: .64, eyeBlinkWidth: .10,
    moteDrift: .11, moteRate: .78, lootBob: .037, lootRate: 2
  },
  startClear: 3.6, trailWidth: 1.6, trailBend: 3.6, trailWave: 11,
  shrubChance: .85, grassChance: .92, rockChance: .09, logChance: .055,
  vineChance: .28, moteChance: .24, fogStart: 5, fogEnd: 42, tileSize: 2,
  eye: 1.6, focalRatio: 1371/1920, near: .065, stepLength: .7,
  sway: .035, bob: .038, radius: .23, encounterDistance: 8, spacing: 2.12,
  // 2026-11-19 改版：怪按体型站得近一些，占画面四分之一到一半；相邻两只隔开约 0.36 弧度。
  encounterDepth: {tiko: 4.4, reya: 4.4, badom: 6.2, oru: 6.2, veko: 5.8, elite: 7.2}, encounterSpread: .36,
  lootDistance: 4, lootHeight: 1.52,
  motion: {
    lightYaw: 0, skyHz: .11, skyPulse: .17, skyLift: .013, skyExpand: .027,
    forestTiles: [6, 8], forestAlpha: [.76, .56],
    windHz: .39, swayRad: {shrub: .034, grass: .058, vine: .045},
    tipLag: .21, tipBend: .033, eyeLag: .021, eyeCuts: [0,.235,.38,.55,.73,1],
    warmReach: 9, fogHz: .061, fogSlide: .052, fogLift: .026,
    moteHz: .62, motePulse: .34, lootHz: .56, lootPulse: .25,
    fallHz: .48, fallSwing: .29, fallEdge: .36
  },
  // Combat greybox colours; forest colours are baked from art/env/环境-颜色表.json.
  palettes: {
    badom: ['#342c2d','#5f4940','#a08167','#c7cac4'],
    tiko: ['#382e36','#644653','#a36760','#c7a098'],
    elite: ['#392e2b','#664c3b','#ba855b','#d1c2a6'],
    loot: ['#544432','#af864c','#ebc17b','#ffdf9e'],
    lamp: ['#ed866a','#e4ba66','#84c99d','#7bd1d0','#83a9ed','#c99ed7']
  }
};
export const HUD = {
  handWidth: 120,
  handHeight: 180,
  handSpan: 1020,
  handGap: 116,
  handArc: 14,
  handAngle: 0.11,
  hoverLift: 38,
  hoverScale: 1.12,
  spring: 195,
  damping: 22,
  handTravel: 0.65,
  lootRise: 0.55,
  plaqueWidth: 194,
  slotWidth: 75,
  slotHeight: 112,
  slotGap: 24,
  trayOffset: 364,
  cardColors: ['#ff4a3a', '#3df06a', '#3f86ff']
};
