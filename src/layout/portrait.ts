import type { Layout } from './types';

/**
 * 竖屏，按 2:1 手机设计（1080×2160；更长的屏幕由 fit.ts 再分配）。方案 A「怪站在桌上」+ B 的两条（2026-11-09）：
 * 顶栏（第几仗、进度、规则 / 设置）→ 怪的血条 + 右边倒计时（意图）→ 放大的怪（偏左），右边墙上是伤害面板（本回合 + 可展开的算式）
 * → 桌面排一行（多了往左叠），倍率牌在最左 → 成长 | 结束回合 → 心 | 撤回 牌库 → 手牌贴底。
 */
export const portrait: Layout = {
  name: 'portrait', width: 1080, height: 2160,
  turn: { x: 48, y: 40, w: 420, h: 48 },
  records: { x: 48, y: 96, w: 460, h: 72 },
  rules: { x: 876, y: 40, w: 88, h: 88 }, settings: { x: 976, y: 40, w: 88, h: 88 }, toolbarIcon: 54,
  growth: { centers: [{ x: 100, y: 1300 }, { x: 250, y: 1300 }, { x: 400, y: 1300 }], size: 84, gem: 56, labelGap: 4, labelSide: 'below' },
  dummyAnchor: { x: 430, y: 930 }, dummyScale: 1.45,
  rackAnchor: { x: 100, y: 900 }, rackScale: 1.0,
  floating: { x: 430, y: 560 }, toast: { x: 540, y: 620 },
  light: { x: 540, y: 560, rx: 700, ry: 760 }, floorY: null,
  turnLabel: { x: 700, y: 400, w: 360, h: 36 }, damage: { x: 690, y: 440, w: 380, h: 140 },
  multiplier: { x: 36, y: 950, w: 170, h: 78 },
  table: { x: -480, y: 880, w: 2040, h: 1400 }, tableBorder: 72,
  rowScale: 0.72, rowStart: { x: 220, y: 965 }, rowRight: 1044, rowLines: 1,
  formula: { x: 700, y: 596, w: 360, h: 240 },
  hand: { region: { x: 0, y: 1560, w: 1080, h: 600 }, center: 540, width: 1000, top: 1560, scale: 1.5 },
  undo: { x: 790, y: 1420, w: 96, h: 96 }, deck: { x: 916, y: 1420, w: 96, h: 96 }, end: { x: 716, y: 1268, w: 324, h: 112 },
  modalWidth: 920,
  hearts: { x: 60, y: 1440, size: 60, gap: 14 },
  progress: { x: 500, y: 64, w: 340, node: 48 },
  monsterScale: { normal: 1.45, boss: 1.3 },
  hpBar: { x: 180, y: 236, w: 500, h: 44 }, hpBorder: 16,
  toughBar: { x: 180, y: 290, w: 500, h: 34 },
  inspect: { scale: 2.4, bottom: 1540 },
  countdown: { x: 750, y: 258, size: 104 },
  banner: { x: 240, y: 420, w: 600, h: 140 },
  loot: {
    scale: 1.2,
    three: [{ x: 140, y: 964 }, { x: 420, y: 964 }, { x: 700, y: 964 }],
    four: [{ x: 24, y: 964 }, { x: 288, y: 964 }, { x: 552, y: 964 }, { x: 816, y: 964 }],
    hint: { x: 140, y: 906, w: 800, h: 48 },
    skip: { x: 290, y: 1420, w: 500, h: 104 },
    chest: { x: 540, y: 900 },
  },
  result: { panel: { x: 90, y: 860, w: 900, h: 620 }, home: { x: 80, y: 1584, w: 440, h: 112 }, again: { x: 560, y: 1584, w: 440, h: 112 } },
  title: {
    name: { x: 90, y: 190, w: 900, h: 140 }, emblem: { x: 540, y: 860 }, emblemScale: 1.0,
    start: { x: 240, y: 940, w: 600, h: 128 }, resume: { x: 240, y: 1090, w: 600, h: 112 },
    practice: { x: 240, y: 1226, w: 600, h: 112 }, record: { x: 140, y: 1370, w: 800, h: 110 },
  },
};
