import type { Layout } from './types';

/**
 * 横屏 1920×1080，和竖屏同一种摆法（方案 A + B 的两条，2026-11-09）：
 * 怪站在正中、脚踩桌子后沿，血条和倒计时（意图）在它头顶；桌布左右下出血，桌面排一行排在怪脚下，倍率牌在它左边；
 * 本回合和算式（伤害面板）在怪右边的墙上、桌子上方；成长和心在左下；手牌在正中贴底；右下只放撤回、牌库、结束回合。
 */
export const landscape: Layout = {
  name: 'landscape', width: 1920, height: 1080,
  turn: { x: 48, y: 30, w: 420, h: 48 },
  records: { x: 48, y: 78, w: 460, h: 72 },
  rules: { x: 1700, y: 32, w: 96, h: 96 }, settings: { x: 1808, y: 32, w: 96, h: 96 }, toolbarIcon: 58,
  growth: { centers: [{ x: 100, y: 600 }, { x: 230, y: 600 }, { x: 360, y: 600 }], size: 88, gem: 58, labelGap: 4, labelSide: 'below' },
  dummyAnchor: { x: 960, y: 530 }, dummyScale: 1.0,
  rackAnchor: { x: 1430, y: 530 }, rackScale: 1.0,
  floating: { x: 960, y: 330 }, toast: { x: 960, y: 420 },
  light: { x: 960, y: 330, rx: 1000, ry: 600 }, floorY: 505,
  turnLabel: { x: 1500, y: 170, w: 390, h: 36 }, damage: { x: 1490, y: 206, w: 410, h: 140 },
  multiplier: { x: 430, y: 560, w: 160, h: 76 },
  table: { x: -240, y: 505, w: 2400, h: 700 }, tableBorder: 72,
  rowScale: 0.52, rowStart: { x: 610, y: 552 }, rowRight: 1290, rowLines: 1,
  formula: { x: 1500, y: 356, w: 390, h: 140 },
  hand: { region: { x: 380, y: 795, w: 1040, h: 285 }, center: 900, width: 1000, top: 795, scale: 0.95 },
  undo: { x: 1420, y: 944, w: 112, h: 112 }, deck: { x: 1552, y: 944, w: 112, h: 112 }, end: { x: 1684, y: 940, w: 216, h: 120 },
  modalWidth: 1000,
  hearts: { x: 52, y: 712, size: 56, gap: 10 },
  progress: { x: 520, y: 54, w: 340, node: 48 },
  monsterScale: { normal: 1.0, boss: 0.95 },
  hpBar: { x: 710, y: 92, w: 500, h: 44 }, hpBorder: 16,
  toughBar: { x: 710, y: 142, w: 500, h: 30 },
  inspect: { scale: 2.2, bottom: 795 },
  countdown: { x: 1268, y: 114, size: 96 },
  banner: { x: 660, y: 170, w: 600, h: 140 },
  loot: {
    scale: 1.0,
    three: [{ x: 580, y: 580 }, { x: 860, y: 580 }, { x: 1140, y: 580 }],
    four: [{ x: 500, y: 580 }, { x: 740, y: 580 }, { x: 980, y: 580 }, { x: 1220, y: 580 }],
    hint: { x: 560, y: 900, w: 800, h: 44 },
    skip: { x: 1420, y: 940, w: 480, h: 112 },
    chest: { x: 960, y: 530 },
  },
  result: { panel: { x: 460, y: 200, w: 1000, h: 560 }, home: { x: 1420, y: 904, w: 244, h: 112 }, again: { x: 1684, y: 900, w: 216, h: 120 } },
  title: {
    name: { x: 640, y: 40, w: 640, h: 140 }, emblem: { x: 960, y: 520 }, emblemScale: 0.9,
    start: { x: 710, y: 560, w: 500, h: 120 }, resume: { x: 710, y: 700, w: 500, h: 100 },
    practice: { x: 710, y: 820, w: 500, h: 100 }, record: { x: 460, y: 940, w: 1000, h: 52 },
  },
};
