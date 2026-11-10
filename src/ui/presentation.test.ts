import { describe, expect, it } from 'vitest';
import { scoreAt } from './presentation';

describe('visible damage score interpolation', () => {
  it('clamps a frame timestamp older than animation start', () => { expect(scoreAt(0, 100, -16)).toBe(0); });
  it('continues a rapid next play from the last rendered value', () => {
    const visible = scoreAt(0, 2100, 48);
    expect(scoreAt(visible, 4100, 0)).toBe(visible);
    expect(scoreAt(visible, 4100, 300)).toBe(4100);
  });
  it('undo rolls down without a negative overshoot', () => {
    let last = 4100;
    for (let t = -20; t <= 400; t += 5) { const value = scoreAt(4100, 100, t); expect(value).toBeGreaterThanOrEqual(100); expect(value).toBeLessThanOrEqual(last); last = value; }
    expect(last).toBe(100);
  });
  it('never paints negative or non-finite scores', () => { expect(scoreAt(-11, -5, 30)).toBe(0); expect(scoreAt(NaN, Infinity, 50)).toBe(0); });
});
