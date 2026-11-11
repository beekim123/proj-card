import { describe, it, expect } from 'vitest';
import { portrait } from '../layout/portrait';
import { landscape } from '../layout/landscape';
import { fitLayout } from '../layout/fit';
import { MOTION } from '../layout/types';
import { handPositions, handScale } from './geometry';

describe('first-act dense hands and new screens', () => {
  for (const base of [portrait, landscape]) for (const extra of [0, 120, 640]) {
    const layout = fitLayout(base, extra);
    for (const count of [9, 10, 12]) it(`${base.name}+${extra}: ${count} exposed cards remain in bounds`, () => {
      const scale = handScale(count, layout), width = MOTION.cardW * scale;
      const positions = handPositions(count, layout);
      expect(positions).toHaveLength(count);
      positions.forEach((point, index) => {
        expect(point.x).toBeGreaterThanOrEqual(0);
        expect(point.x + width).toBeLessThanOrEqual(layout.width + 1e-8);
        if (index) expect(point.x - positions[index - 1].x).toBeGreaterThanOrEqual(layout.handMinStep * scale / layout.hand.scale - 1e-8);
      });
    });
    it(`${base.name}+${extra}: door and shop controls fit`, () => {
      for (const rect of [layout.doors.detail, layout.doors.hint, layout.doors.enter, ...layout.shop.ops, layout.shop.grid, layout.shop.back, layout.shop.confirm]) {
        expect(rect.x).toBeGreaterThanOrEqual(0); expect(rect.y).toBeGreaterThanOrEqual(0);
        expect(rect.x + rect.w).toBeLessThanOrEqual(layout.width); expect(rect.y + rect.h).toBeLessThanOrEqual(layout.height);
      }
    });
  }
  it('preserves the existing scale for up to eight cards', () => {
    for (const layout of [portrait, landscape]) for (const count of [1, 6, 7, 8]) expect(handScale(count, layout)).toBe(layout.hand.scale);
  });
});
