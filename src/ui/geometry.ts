import { MOTION, handSize, rowSize, rowGap, rowPitch, minRowGap, type Layout, type Point } from '../layout/types';
import type { RowEntry } from '../rules';
export interface HandPosition extends Point { rotation: number }
export interface RowPosition extends Point { line: number; showLabel: boolean; showDamage: boolean }

export function handPositions(count: number, layout: Layout): HandPosition[] {
  const { w, h } = handSize(layout);
  const radius = Math.max(0, (count - 1) / 2);
  const angle = radius * MOTION.handRotation * Math.PI / 180;
  // Cards rotate around bottom center. Reserve their full rotated upper corners,
  // rather than merely clamping the unrotated boxes (7/8/9 cards all stay inside).
  const rotatedHalfWidth = w / 2 * Math.cos(angle) + h * Math.sin(angle);
  const room = Math.min(layout.hand.width / 2, layout.hand.center, layout.width - layout.hand.center);
  const step = count <= 1 ? 0 : Math.max(0, Math.min(MOTION.handStep, (room - rotatedHalfWidth) / radius));
  return Array.from({ length: count }, (_, i) => {
    const d = i - radius;
    return { x: layout.hand.center + d * step - w / 2, y: layout.hand.top + d * d * MOTION.handCurve, rotation: d * MOTION.handRotation };
  });
}

/** 一行里的间距放不下时：从最早的间距开始压到最小值，还放不下就平均分 */
function compress(gaps: number[], room: number, min: number) {
  let overflow = gaps.reduce((a, b) => a + b, 0) - room;
  for (let i = 0; i < gaps.length && overflow > 0; i++) {
    const reduction = Math.min(overflow, Math.max(0, gaps[i] - min));
    gaps[i] -= reduction; overflow -= reduction;
  }
  if (overflow > 0 && gaps.length) gaps.fill(Math.max(0, room / gaps.length));
}

/**
 * 桌面排：牌从左往右按反应摆（同色叠、顺色凑白挨紧、普通留缝）。
 * 一行放不下就像文字一样换到下一行（最多 rowLines 行）；行数还不够时，最新的牌整行照常摆，更早的牌分到前面几行压缩。
 */
export function rowPositions(row: Pick<RowEntry, 'k' | 'rb'>[], layout: Layout): RowPosition[] {
  const n = row.length; if (!n) return [];
  const w = rowSize(layout).w;
  const room = layout.rowRight - layout.rowStart.x - w;
  const min = minRowGap(layout);
  const natural = row.map((card, i) => i ? rowGap(layout, card.k) : 0);
  const maxLines = Math.max(1, layout.rowLines);
  // lines[k] = 这一行的第一张牌下标
  let starts: number[] = [0];
  for (let i = 1, x = 0; i < n; i++) { if (x + natural[i] > room) { starts.push(i); x = 0; } else x += natural[i]; }
  if (starts.length > maxLines) {
    if (maxLines === 1) starts = [0];
    else {
      // 最后一行：从最新的牌往回，能放多少放多少（不压缩）
      let first = n - 1; let used = 0;
      while (first > 0 && used + natural[first] <= room) { used += natural[first]; first--; }
      // 前面几行平均分剩下的牌
      const earlier = first, lines = maxLines - 1;
      starts = Array.from({ length: lines }, (_, k) => Math.floor(k * earlier / lines)).filter((s, k, a) => k === 0 || s > a[k - 1]);
      starts.push(first);
    }
  }
  const gaps = natural.slice();
  const lineOf: number[] = new Array(n).fill(0);
  starts.forEach((s, k) => {
    const end = k + 1 < starts.length ? starts[k + 1] : n;
    gaps[s] = 0;
    for (let i = s; i < end; i++) lineOf[i] = k;
    const inner = gaps.slice(s + 1, end);
    compress(inner, room, min);
    inner.forEach((g, j) => { gaps[s + 1 + j] = g; });
  });
  const rainbow = row.map((c, i) => c.rb ? i : -1).filter(i => i >= 0);
  const wide = w * 0.66; const pitch = rowPitch(layout);
  let x = layout.rowStart.x;
  return row.map((_, i) => {
    const first = starts.includes(i);
    x = first ? layout.rowStart.x : x + gaps[i];
    const last = i === n - 1 || starts.includes(i + 1);
    const j = rainbow.indexOf(i);
    const lift = j >= 0 ? Math.round(Math.sin(Math.PI * (j + 0.5) / rainbow.length) * MOTION.rainbowLift) : 0;
    return {
      x, y: layout.rowStart.y + lineOf[i] * pitch - lift, line: lineOf[i],
      showLabel: i === n - 1 || i > 0 && (first || gaps[i] >= wide),
      showDamage: i === n - 1 || last || gaps[i + 1] >= wide,
    };
  });
}
