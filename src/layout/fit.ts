import type { Layout, Point, Rect } from './types';

/**
 * 屏幕比设计尺寸更长时（竖屏的长手机、横屏的宽手机），把多出来的空间分给各块，而不是上下/左右留黑边。
 * extra 是多出来的设计像素（竖屏是高度，横屏是宽度），0 就是原样。
 */
export const MAX_EXTRA = 640;

const dy = (p: Point, d: number): Point => ({ x: p.x, y: p.y + d });
const dx = (p: Point, d: number): Point => ({ x: p.x + d, y: p.y });
const ry = (r: Rect, d: number): Rect => ({ ...r, y: r.y + d });
const rx = (r: Rect, d: number): Rect => ({ ...r, x: r.x + d });

export function fitLayout(base: Layout, extra: number): Layout {
  const e = Number.isFinite(extra) ? Math.max(0, Math.min(MAX_EXTRA, Math.round(extra))) : 0;
  if (!e) return base;
  if (base.name === 'portrait') {
    // 1) 先拿一点把手牌放大（最多 1.6 倍）；2) 剩下的一半给怪那段（怪和桌子后沿一起往下），一半给桌面排（牌跟着放大，最多 0.95 倍）。
    //    顶栏不动；伤害面板跟着怪；心、按钮、成长、手牌整体贴底。
    const handScale = Math.min(1.6, base.hand.scale + e / 2000);
    const grow = 300 * (handScale - base.hand.scale);
    const rest = e - grow, scene = rest * 0.5, table = rest - scene;
    const rowScale = Math.min(0.95, base.rowScale + table / 1400);
    return {
      ...base, height: base.height + e,
      hpBar: ry(base.hpBar, scene / 2), toughBar: ry(base.toughBar, scene / 2), countdown: { ...base.countdown, y: base.countdown.y + scene / 2 },
      inspect: { ...base.inspect, bottom: base.inspect.bottom + rest },
      dummyAnchor: dy(base.dummyAnchor, scene), rackAnchor: dy(base.rackAnchor, scene),
      floating: dy(base.floating, scene), toast: dy(base.toast, scene), banner: ry(base.banner, scene),
      light: { ...base.light, y: base.light.y + scene, ry: base.light.ry + e / 2 },
      multiplier: ry(base.multiplier, scene),
      table: { ...base.table, y: base.table.y + scene, h: base.table.h + table },
      rowStart: dy(base.rowStart, scene), rowScale,
      formula: ry(base.formula, scene), turnLabel: ry(base.turnLabel, scene), damage: ry(base.damage, scene),
      hearts: { ...base.hearts, y: base.hearts.y + rest },
      growth: { ...base.growth, centers: base.growth.centers.map(c => dy(c, rest)) },
      hand: { ...base.hand, region: { ...base.hand.region, y: base.hand.region.y + rest, h: base.hand.region.h + grow }, top: base.hand.top + rest, scale: handScale },
      undo: ry(base.undo, rest), deck: ry(base.deck, rest), end: ry(base.end, rest),
      loot: {
        ...base.loot,
        three: base.loot.three.map(p => dy(p, scene + table / 2)),
        four: base.loot.four.map(p => dy(p, scene + table / 2)),
        hint: ry(base.loot.hint, scene + table / 2), skip: ry(base.loot.skip, rest),
        chest: dy(base.loot.chest, scene),
      },
      result: {
        panel: { ...base.result.panel, y: base.result.panel.y + scene, h: base.result.panel.h + table },
        home: ry(base.result.home, rest), again: ry(base.result.again, rest),
      },
      title: {
        ...base.title, name: ry(base.title.name, scene / 2), emblem: dy(base.title.emblem, scene),
        start: ry(base.title.start, scene + table / 2), resume: ry(base.title.resume, scene + table / 2),
        practice: ry(base.title.practice, scene + table / 2), record: ry(base.title.record, scene + table / 2),
      },
    };
  }
  // 横屏：左边（回合、心、成长）不动；中间（怪、桌面排、手牌、战利品、首页）往右移一半；右边（算式、本回合、按钮）移到底。
  const half = e / 2;
  return {
    ...base, width: base.width + e,
    rules: rx(base.rules, e), settings: rx(base.settings, e),
    progress: { ...base.progress, x: base.progress.x + half },
    hpBar: rx(base.hpBar, half), toughBar: rx(base.toughBar, half), countdown: { ...base.countdown, x: base.countdown.x + half },
    dummyAnchor: dx(base.dummyAnchor, half), rackAnchor: dx(base.rackAnchor, half),
    floating: dx(base.floating, half), toast: dx(base.toast, half), banner: rx(base.banner, half),
    light: { ...base.light, x: base.light.x + half, rx: base.light.rx + half },
    multiplier: rx(base.multiplier, half),
    table: { ...base.table, w: base.table.w + e },
    rowStart: dx(base.rowStart, half), rowRight: base.rowRight + e,
    formula: rx(base.formula, e), turnLabel: rx(base.turnLabel, e), damage: rx(base.damage, e),
    hand: { ...base.hand, region: { ...base.hand.region, x: base.hand.region.x + half / 2, w: base.hand.region.w + half }, center: base.hand.center + half, width: base.hand.width + half },
    undo: rx(base.undo, e), deck: rx(base.deck, e), end: rx(base.end, e),
    loot: {
      ...base.loot,
      three: base.loot.three.map(p => dx(p, half)), four: base.loot.four.map(p => dx(p, half)),
      hint: rx(base.loot.hint, half), skip: rx(base.loot.skip, e), chest: dx(base.loot.chest, half),
    },
    result: {
      panel: rx(base.result.panel, half),
      home: rx(base.result.home, e), again: rx(base.result.again, e),
    },
    title: {
      ...base.title, name: rx(base.title.name, half), emblem: dx(base.title.emblem, half),
      start: rx(base.title.start, half), resume: rx(base.title.resume, half),
      practice: rx(base.title.practice, half), record: rx(base.title.record, half),
    },
  };
}
