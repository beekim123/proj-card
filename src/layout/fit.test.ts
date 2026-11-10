import { describe, expect, it } from 'vitest';
import { portrait } from './portrait';
import { landscape } from './landscape';
import { fitLayout, MAX_EXTRA } from './fit';
import { handSize, type Layout, type Rect } from './types';
import { handPositions } from '../ui/geometry';

const inside = (l: Layout, r: Rect) => r.x >= 0 && r.y >= 0 && r.x + r.w <= l.width && r.y + r.h <= l.height;

for (const base of [portrait, landscape]) {
  describe(`${base.name} fit`, () => {
    it('returns the base layout when nothing is extra', () => { expect(fitLayout(base, 0)).toBe(base); expect(fitLayout(base, -50)).toBe(base); });
    for (const extra of [120, 417, MAX_EXTRA, 2000]) {
      it(`keeps buttons and the hand inside the stage with ${extra} extra`, () => {
        const l = fitLayout(base, extra);
        const grown = Math.min(extra, MAX_EXTRA);
        if (base.name === 'portrait') expect(l.height).toBe(base.height + grown); else expect(l.width).toBe(base.width + grown);
        for (const r of [l.undo, l.deck, l.end, l.rules, l.settings, l.turn, l.records]) expect(inside(l, r)).toBe(true);
        const hand = handPositions(8, l);
        expect(hand[0].x).toBeGreaterThanOrEqual(0);
        expect(hand.at(-1)!.x + handSize(l).w).toBeLessThanOrEqual(l.width);
        expect(l.hand.top + handSize(l).h).toBeLessThanOrEqual(l.height);
        // 桌子上沿始终在木桩脚下附近（竖屏木桩站在桌子后面）
        if (base.name === 'portrait') expect(l.table.y).toBeLessThan(l.dummyAnchor.y);
        // 按钮压在桌沿上：桌子下沿在按钮中间以下
        if (base.name === 'portrait') expect(l.table.y + l.table.h).toBeGreaterThan(l.undo.y + l.undo.h / 2);
      });
    }
  });
}

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const heartBounds = (l: Layout): Rect => ({ x: l.hearts.x, y: l.hearts.y, w: l.hearts.size * 3 + l.hearts.gap * 2, h: l.hearts.size });
const progressBounds = (l: Layout): Rect => ({ x: l.progress.x - l.progress.node * .625, y: l.progress.y - l.progress.node * .625, w: l.progress.w + l.progress.node * 1.25, h: l.progress.node * 1.25 });
const chestBounds = (l: Layout): Rect => ({ x: l.loot.chest.x - 120, y: l.loot.chest.y - 200, w: 240, h: 200 });
const newRects = (l: Layout): Rect[] => [
  heartBounds(l), progressBounds(l), l.hpBar, l.ruleSign, l.rainbowReady,
  { x:l.rainbow.x,y:l.rainbow.y,w:l.rainbow.slot*6+l.rainbow.gap*5,h:l.rainbow.slot },
  { x: l.countdown.x - l.countdown.size / 2, y: l.countdown.y - l.countdown.size / 2, w: l.countdown.size, h: l.countdown.size },
  l.banner, l.loot.hint, l.loot.skip, chestBounds(l), ...Object.values(l.result),
  l.title.name, l.title.start, l.title.resume, l.title.practice, l.title.record,
  { x: l.title.emblem.x - 200 * l.title.emblemScale, y: l.title.emblem.y - 340 * l.title.emblemScale, w: 400 * l.title.emblemScale, h: 340 * l.title.emblemScale },
  ...[...l.loot.three, ...l.loot.four].map(p => ({ ...p, w: 200 * l.loot.scale, h: 300 * l.loot.scale })),
];
function assertAdventureLayout(l: Layout) {
  for (const r of newRects(l)) expect(inside(l, r), JSON.stringify(r)).toBe(true);
  expect(overlaps(heartBounds(l), l.turn)).toBe(false);
  expect(overlaps(heartBounds(l), progressBounds(l))).toBe(false);
  expect(overlaps(progressBounds(l), l.rules)).toBe(false);
  expect(overlaps(l.hpBar, l.damage)).toBe(false);
  expect(overlaps(l.hpBar, l.ruleSign)).toBe(false);
  expect(l.inspect.bottom).toBeLessThanOrEqual(l.hand.top);
  expect(l.inspect.bottom - 300 * l.inspect.scale).toBeGreaterThanOrEqual(0);
  expect(overlaps(l.banner, chestBounds(l))).toBe(false);
  expect(overlaps(l.result.panel, l.result.home)).toBe(false);
  expect(overlaps(l.result.panel, l.result.again)).toBe(false);
  for (const cards of [l.loot.three, l.loot.four]) {
    const rects = cards.map(p => ({ ...p, w: 200 * l.loot.scale, h: 300 * l.loot.scale }));
    for (const [i, r] of rects.entries()) {
      expect(overlaps(r, l.loot.hint)).toBe(false);
      expect(overlaps(r, l.loot.skip)).toBe(false);
      expect(overlaps(r, heartBounds(l))).toBe(false);
      for (const following of rects.slice(i + 1)) expect(overlaps(r, following)).toBe(false);
    }
  }
  const title = [l.title.start, l.title.resume, l.title.practice, l.title.record];
  for (const [i, r] of title.entries()) {
    for (const following of title.slice(i + 1)) expect(overlaps(r, following)).toBe(false);
  }
}

describe('adventure layout data', () => {
  for (const base of [portrait, landscape]) {
    for (const extra of [0, 1, 120, 417, MAX_EXTRA, 2000]) {
      it(`${base.name} keeps new scenes in bounds without overlapping at extra ${extra}`, () => {
        assertAdventureLayout(fitLayout(base, extra));
      });
    }
  }
  for (const [width, height] of [[390, 844], [360, 800], [430, 932], [405, 810], [1280, 720], [1920, 1080], [844, 390]]) {
    it(`fits adventure controls at ${width}×${height}`, () => {
      const base = width > height ? landscape : portrait;
      const extra = base.name === 'portrait' ? height / width * base.width - base.height : width / height * base.height - base.width;
      const layout = fitLayout(base, extra);
      assertAdventureLayout(layout);
      const scale = Math.min(width / layout.width, height / layout.height);
      for (const r of newRects(layout)) {
        expect((r.x + r.w) * scale).toBeLessThanOrEqual(width + 1e-8);
        expect((r.y + r.h) * scale).toBeLessThanOrEqual(height + 1e-8);
      }
    });
  }
  it('portrait: the monster part (and damage panel) moves with the table edge, the controls stick to the bottom', () => {
    const l = fitLayout(portrait, 417);
    const rest = 417 - 300 * (l.hand.scale - portrait.hand.scale);
    const scene = rest * .5, table = rest - scene;
    expect(l.progress).toEqual(portrait.progress); expect(l.turn).toEqual(portrait.turn);
    expect(l.hpBar.y - portrait.hpBar.y).toBeCloseTo(scene / 2);
    expect(l.countdown.y - portrait.countdown.y).toBeCloseTo(scene / 2);
    for (const k of ['dummyAnchor', 'rackAnchor'] as const) expect(l[k].y - portrait[k].y).toBeCloseTo(scene);
    expect(l.table.y - portrait.table.y).toBeCloseTo(scene); expect(l.rowStart.y - portrait.rowStart.y).toBeCloseTo(scene);
    for (const k of ['formula', 'turnLabel', 'damage'] as const) expect(l[k].y - portrait[k].y).toBeCloseTo(scene);
    for (const k of ['undo', 'deck', 'end'] as const) expect(l[k].y - portrait[k].y).toBeCloseTo(rest);
    expect(l.hearts.y - portrait.hearts.y).toBeCloseTo(rest);
    l.growth.centers.forEach((c, i) => expect(c.y - portrait.growth.centers[i].y).toBeCloseTo(rest));
    expect(l.loot.chest.y - portrait.loot.chest.y).toBeCloseTo(scene);
    for (const key of ['three', 'four'] as const) l.loot[key].forEach((p, i) => expect(p.y - portrait.loot[key][i].y).toBeCloseTo(scene + table / 2));
    expect(l.loot.skip.y - portrait.loot.skip.y).toBeCloseTo(rest);
    expect(l.title.emblem.y - portrait.title.emblem.y).toBeCloseTo(scene);
  });
  it('landscape: left stays, the middle moves half, the right moves all the way', () => {
    const extra = 417, half = extra / 2, l = fitLayout(landscape, extra);
    expect(l.hearts).toEqual(landscape.hearts); expect(l.growth).toEqual(landscape.growth); expect(l.turn).toEqual(landscape.turn);
    for (const k of ['dummyAnchor', 'rackAnchor', 'rowStart', 'floating', 'toast'] as const) expect(l[k].x - landscape[k].x).toBe(half);
    for (const k of ['hpBar', 'banner', 'multiplier'] as const) expect(l[k].x - landscape[k].x).toBe(half);
    expect(l.countdown.x - landscape.countdown.x).toBe(half);
    for (const k of ['formula', 'turnLabel', 'damage', 'undo', 'deck', 'end', 'rules', 'settings'] as const) expect(l[k].x - landscape[k].x).toBe(extra);
    expect(l.rowRight - landscape.rowRight).toBe(extra);
    for (const key of ['three', 'four'] as const) l.loot[key].forEach((p, i) => expect(p.x - landscape.loot[key][i].x).toBe(half));
    expect(l.loot.chest.x - landscape.loot.chest.x).toBe(half); expect(l.loot.skip.x - landscape.loot.skip.x).toBe(extra);
    for (const key of ['name', 'start', 'resume', 'practice', 'record'] as const) expect(l.title[key].x - landscape.title[key].x).toBe(half);
    for (const key of ['home', 'again'] as const) expect(l.result[key].x - landscape.result[key].x).toBe(extra);
  });
  it('does not mutate the accepted base layout data', () => {
    for (const base of [portrait, landscape]) {
      const before = structuredClone(base);
      fitLayout(base, 640); fitLayout(base, 120);
      expect(base).toEqual(before);
    }
  });
  it('ignores invalid measurements instead of producing NaN positions', () => {
    for (const base of [portrait, landscape]) for (const value of [NaN, Infinity, -Infinity]) expect(fitLayout(base, value)).toBe(base);
  });
});
