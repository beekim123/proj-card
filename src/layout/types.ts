export interface Point { x: number; y: number }
export interface Rect extends Point { w: number; h: number }
export type LayoutName = 'portrait' | 'landscape';
export type Reaction = 'plain' | 'same' | 'shun' | 'white';

/**
 * 一种屏幕方向的全部摆放数据（设计像素）。组件只从这里取位置和大小。
 * 牌、木桩、兵器架的显示倍数也在这里：两种布局用同一套素材，只是摆法和倍数不同。
 */
export interface Layout {
  name: LayoutName;
  width: number; height: number;
  /** 左上角：回合、最高一回合、累计 */
  turn: Rect; records: Rect;
  /** 右上角两个圆按钮 */
  rules: Rect; settings: Rect; toolbarIcon: number;
  /** 宝石成长：三个圆槽的中心、直径、里面宝石的大小、名字离圆槽底的距离 */
  growth: { centers: Point[]; size: number; gem: number; labelGap: number; labelSide: 'below' | 'left' };
  /** 场景：木桩和兵器架按底边中点对齐，可放大 */
  dummyAnchor: Point; dummyScale: number;
  rackAnchor: Point; rackScale: number;
  /** 伤害飘字、提示条出现的位置 */
  floating: Point; toast: Point;
  /** 从上往下打的柔光（椭圆中心和半径）；地面压暗从哪一行开始（没有地面就是 null） */
  light: { x: number; y: number; rx: number; ry: number }; floorY: number | null;
  /** 倍率牌、本回合分数 */
  multiplier: Rect; turnLabel: Rect; damage: Rect;
  /** 桌布（可以超出屏幕边）和桌面排 */
  table: Rect; tableBorder: number;
  /** 桌面排：牌的倍数、第一张牌左上角、右边界、最多排几行（放不下就像文字一样换行） */
  rowScale: number; rowStart: Point; rowRight: number; rowLines: number;
  formula: Rect;
  /** 手牌：region 是"手牌区"（松手在这里不算打出） */
  hand: { region: Rect; center: number; width: number; top: number; scale: number };
  undo: Rect; deck: Rect; end: Rect;
  modalWidth: number;
  /** 冒险顶栏：心从左上角排开；进度 x 是左端，y 是中线。 */
  hearts: { x: number; y: number; size: number; gap: number };
  progress: { x: number; y: number; w: number; node: number };
  monsterScale: { normal: number; boss: number };
  hpBar: Rect; hpBorder: number;
  ruleSign: Rect;
  relics: { x: number; y: number; size: number; gap: number };
  rainbow: { x: number; y: number; slot: number; gap: number };
  rainbowReady: Rect;
  relicPick: { scale: number; points: Point[]; icon: number; nameSize: number; textSize: number };
  /** 手牌大图：放大倍数、大图下沿的 y（x 跟着那张牌，夹在舞台里）。 */
  inspect: { scale: number; bottom: number };
  /** 倒计时圆章的中心与直径。 */
  countdown: { x: number; y: number; size: number };
  banner: Rect;
  loot: { scale: number; three: Point[]; four: Point[]; hint: Rect; skip: Rect; chest: Point };
  result: { panel: Rect; home: Rect; again: Rect };
  title: { name: Rect; emblem: Point; emblemScale: number; start: Rect; resume: Rect; practice: Rect; record: Rect };
}

/** 两种布局共用的牌面尺寸和手感参数 */
export const MOTION = {
  cardW: 200, cardH: 300, inspectScale: 2,
  handStep: 160, handCurve: 4, handRotation: 3, handLift: 110, handPickScale: 1.25,
  touchOffset: 200, dragThreshold: 12, hintOffset: 40,
  /** 手机按住多久出大图（毫秒） */
  holdMs: 350,
  rainbowLift: 48,
} as const;

export const handSize = (l: Layout) => ({ w: MOTION.cardW * l.hand.scale, h: MOTION.cardH * l.hand.scale });
export const rowSize = (l: Layout) => ({ w: MOTION.cardW * l.rowScale, h: MOTION.cardH * l.rowScale });
/** 桌面排每张牌上方的反应标签、下方的伤害数字离牌的距离；两行之间的行距 = 牌高 + lineExtra */
export const ROW = { labelOffset: 42, damageGap: 8, lineExtra: 154 } as const;
export const rowPitch = (l: Layout) => rowSize(l).h + ROW.lineExtra;

/** 桌面排间距：同色叠住 40%，顺色、凑白挨紧，普通留 30 的缝 */
export function rowGap(l: Layout, k: Reaction): number {
  const w = rowSize(l).w;
  return k === 'same' ? Math.round(w * 0.6) : k === 'plain' ? w + 30 : w + 4;
}
/** 放不下时每个间距最小压到这么宽（露出左上角宝石标） */
export const minRowGap = (l: Layout) => Math.round(rowSize(l).w * 0.37);

/** 成长圆槽占的矩形（含下面的名字），用来判断松手是不是落在它上面 */
export function growthRects(l: Layout): Rect[] {
  const { size, labelGap } = l.growth;
  if (l.growth.labelSide === 'left') return l.growth.centers.map(c => ({ x: c.x - size / 2 - 160, y: c.y - size / 2, w: size + 170, h: size }));
  return l.growth.centers.map(c => ({ x: c.x - size / 2 - 20, y: c.y - size / 2, w: size + 40, h: size + labelGap + 36 }));
}
