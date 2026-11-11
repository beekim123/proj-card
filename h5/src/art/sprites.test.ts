import { describe, expect, it } from 'vitest';
import manifestJson from '../../public/art-manifest.json';
import spriteJson from '../../public/sprites/sprites.json';
import { frameAt, normalizeColor, svgHash, type SpriteAction, type SpriteData } from './sprites';
import type { ArtManifest } from './types';

const manifest = manifestJson as unknown as ArtManifest;
const data = spriteJson as unknown as SpriteData;
const svgs = import.meta.glob<string>('../../public/art/*.svg', { query: '?raw', import: 'default', eager: true });
const pngs = new Set(Object.keys(import.meta.glob('../../public/sprites/*.png')).map(key => key.split('/').pop()!));

describe('精灵图和 SVG 一致（美术换了要跑 npm run export:sprites）', () => {
  for (const definition of manifest.assets) {
    const svg = svgs[`../../public/art/${definition.id}.svg`];
    if (svg === undefined) continue;
    it(definition.id, async () => {
      const names = Object.keys(data.assets).filter(name => name.split('@')[0] === definition.id);
      expect(names.length, '没导出').toBeGreaterThan(0);
      const hash = await svgHash(svg);
      for (const name of names) {
        const entry = data.assets[name]!;
        expect(entry.hash, `${name} 过期`).toBe(hash);
        for (const file of [entry.still, ...entry.sheets.map(sheet => sheet.f)]) expect(pngs.has(file), file).toBe(true);
        for (const event of Object.keys(definition.events ?? {})) expect(entry.actions[event], `${name} 缺 ${event}`).toBeTruthy();
      }
    });
  }
});

describe('取帧', () => {
  const action: SpriteAction = { loop: false, hold: false, sheets: [0], frames: [{ s: 0, d: 100 }, { s: 0, d: 100 }, { s: 0, d: 100 }] };
  it('按时间找帧，不循环的停在最后一帧', () => {
    expect(frameAt(action, 0)).toBe(0);
    expect(frameAt(action, 150)).toBe(1);
    expect(frameAt(action, 999)).toBe(2);
  });
  it('循环的取模', () => expect(frameAt({ ...action, loop: true }, 350)).toBe(0));
  it('颜色统一', () => expect(normalizeColor('rgb(255, 16, 0)')).toBe('#ff1000'));
});
