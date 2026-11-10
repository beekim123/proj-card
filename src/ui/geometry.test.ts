import { describe, expect, it } from 'vitest';
import { portrait } from '../layout/portrait';
import { landscape } from '../layout/landscape';
import { fitLayout } from '../layout/fit';
import { handPositions, rowPositions } from './geometry';
import { handSize, rowSize, rowGap, rowPitch } from '../layout/types';
import type { RowEntry } from '../rules';

const tall = fitLayout(portrait, 300);
for (const layout of [portrait, tall, landscape]) {
  describe(`${layout.name} ${layout.height} geometry`, () => {
    const W = rowSize(layout).w;
    for (const count of [0, 1, 6, 8]) {
      it(`centers a ${count}-card hand without NaN`, () => {
        const cards = handPositions(count, layout);
        expect(cards).toHaveLength(count);
        cards.forEach(card => { expect(Number.isFinite(card.x)).toBe(true); expect(Number.isFinite(card.y)).toBe(true); });
        if (count) expect((cards[0].x + cards.at(-1)!.x + handSize(layout).w) / 2).toBeCloseTo(layout.hand.center, 8);
        if (count > 1) expect(cards.at(-1)!.x + handSize(layout).w - cards[0].x).toBeLessThanOrEqual(layout.hand.width + 1e-9);
      });
    }
    it('uses the reaction gaps: same overlaps 40%, shun/white snug, plain leaves a gap', () => {
      const row = rowPositions([{k:'plain',rb:false},{k:'same',rb:false},{k:'shun',rb:false},{k:'white',rb:false},{k:'plain',rb:false}], layout);
      expect(row.every(c => c.line === 0)).toBe(true);
      const gaps = row.slice(1).map((card, i) => card.x - row[i].x);
      [Math.round(W * .6), W + 4, W + 4, W + 30].forEach((g, i) => expect(gaps[i]).toBeCloseTo(g, 6));
    });
    it('wraps to the next line like text when there are spare lines, otherwise compresses the oldest first', () => {
      const cards = Array.from({ length: 7 }, () => ({ k: 'shun' as const, rb: false }));
      const row = rowPositions(cards, layout);
      expect(row[0].x).toBe(layout.rowStart.x);
      row.forEach(c => expect(c.x + W).toBeLessThanOrEqual(layout.rowRight + 1e-9));
      if (layout.rowLines > 1) {
        const second = row.findIndex(c => c.line === 1);
        expect(second).toBeGreaterThan(0);
        expect(row[second].x).toBe(layout.rowStart.x);
        expect(row[second].y).toBe(layout.rowStart.y + rowPitch(layout));
        for (let i = 1; i < row.length; i++) if (row[i].line === row[i - 1].line) expect(row[i].x - row[i - 1].x).toBe(rowGap(layout, 'shun'));
      } else {
        // 一行放不下时从最早的间距开始压：最新的那个间距不压，间距从左到右不变小
        expect(row.at(-1)!.x - row.at(-2)!.x).toBeCloseTo(rowGap(layout, 'shun'), 6);
        for (let i = 2; i < row.length; i++) expect(row[i].x - row[i - 1].x).toBeGreaterThanOrEqual(row[i - 1].x - row[i - 2].x - 1e-9);
      }
    });
    it('fits even 30 cards within the allowed lines and keeps the latest label and number', () => {
      const row = rowPositions(Array.from({ length: 30 }, () => ({ k: 'plain' as const, rb: false })), layout);
      row.forEach(c => { expect(c.x + W).toBeLessThanOrEqual(layout.rowRight + 1e-9); expect(c.x).toBeGreaterThanOrEqual(layout.rowStart.x); });
      expect(Math.max(...row.map(c => c.line))).toBe(layout.rowLines - 1);
      expect(row.at(-1)!.showLabel).toBe(true);
      expect(row.at(-1)!.showDamage).toBe(true);
      expect(row[0].showDamage).toBe(false);
      // 最新一行不压缩
      const lastLine = row.filter(c => c.line === layout.rowLines - 1);
      if (layout.rowLines > 1) for (let i = 1; i < lastLine.length; i++) expect(lastLine[i].x - lastLine[i - 1].x).toBe(rowGap(layout, 'plain'));
    });
    it('creates a symmetric rainbow arch only on chain cards', () => {
      const oneLine = { ...layout, rowLines: 1 };
      const cards = Array.from({ length: 6 }, () => ({ k: 'shun', rb: true })) as Pick<RowEntry, 'k' | 'rb'>[];
      cards.push({ k: 'same', rb: false });
      const row = rowPositions(cards, oneLine);
      expect(row[0].y).toBe(row[5].y);
      expect(row[2].y).toBe(row[3].y);
      expect(row[2].y).toBeLessThan(row[0].y);
      expect(row[6].y).toBe(layout.rowStart.y);
    });
    it('keeps the hand, the table rows and buttons inside the stage', () => {
      const hand = handPositions(8, layout);
      expect(hand[0].x).toBeGreaterThanOrEqual(0);
      expect(hand.at(-1)!.x + handSize(layout).w).toBeLessThanOrEqual(layout.width);
      for (const b of [layout.undo, layout.deck, layout.end, layout.rules, layout.settings]) {
        expect(b.x).toBeGreaterThanOrEqual(0); expect(b.y).toBeGreaterThanOrEqual(0);
        expect(b.x + b.w).toBeLessThanOrEqual(layout.width); expect(b.y + b.h).toBeLessThanOrEqual(layout.height);
      }
      // 最后一行牌和它下面的伤害数字在算式上面
      const lastRowBottom = layout.rowStart.y + (layout.rowLines - 1) * rowPitch(layout) + rowSize(layout).h + 40;
      expect(lastRowBottom).toBeLessThanOrEqual(layout.hand.region.y + 4);
      // 算式在桌面排下面时（竖屏）不能压住牌；在桌面排右边时（横屏）不能伸进桌面排
      // 算式（伤害面板）在怪旁边的墙上：整个在桌面排上面
      expect(layout.formula.y + layout.formula.h).toBeLessThanOrEqual(layout.rowStart.y);
      expect(layout.formula.y + layout.formula.h).toBeLessThanOrEqual(Math.min(layout.undo.y, layout.end.y, layout.hand.region.y) + 1);
    });
  });
}
