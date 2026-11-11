/**
 * 精灵图（2026-11-10 起）：public/sprites/ 下的 PNG 大图 + sprites.json，由 `npm run export:sprites` 从 public/art/*.svg 导出。
 * 规范见设计目录 新卡牌/精灵图规范.md。SVG 仍是源文件；这里只负责读导出结果、按颜色找染色的那一套。
 */
import type { Palette } from './types';

/** 一帧。s：第几张大图；-1 = 用静止图（整张，不裁边）；-2 = 这一帧全透明。坐标是大图里的像素，ox/oy 是裁边后在整幅画里的偏移（导出像素）。 */
export interface SpriteFrame {
  s: number; x?: number; y?: number; w?: number; h?: number; ox?: number; oy?: number;
  /** 这一帧停多少毫秒 */
  d: number;
  /** 文字槽 / 图标槽此刻的变换矩阵 [a,b,c,d,e,f]（画框坐标） */
  m?: Record<string, [number, number, number, number, number, number]>;
}
export interface SpriteAction {
  loop: boolean;
  /** stay 事件的进场段：播完停在最后一帧 */
  hold: boolean;
  sheets: number[];
  frames: SpriteFrame[];
}
export interface SpriteEntry {
  /** SVG 原文 sha256 的前 16 位，用来认出过期的导出 */
  hash: string;
  w: number; h: number;
  /** 动画帧的导出倍数 */
  scale: number;
  /** 静止图的导出倍数 */
  stillScale: number;
  still: string;
  sheets: { f: string; w: number; h: number }[];
  actions: Record<string, SpriteAction>;
}
export interface SpriteData {
  version: number;
  eventFps: number;
  loopFps: number;
  assets: Record<string, SpriteEntry>;
}

export const actionDuration = (action: SpriteAction) => action.frames.reduce((sum, frame) => sum + frame.d, 0);

/** 第 t 毫秒是第几帧。循环的动作取模，不循环的停在最后一帧。 */
export function frameAt(action: SpriteAction, t: number): number {
  const total = actionDuration(action);
  if (!total || action.frames.length < 2) return 0;
  let time = action.loop ? ((t % total) + total) % total : Math.min(Math.max(0, t), total - 0.001);
  for (let i = 0; i < action.frames.length; i++) { time -= action.frames[i]!.d; if (time < 0) return i; }
  return action.frames.length - 1;
}

/** 染色素材：游戏里给的颜色 → 导出时的那一套（key 见 tools/export-sprites/page.js 的 tintVariants） */
export function tintKeys(palette: Palette): Map<string, string> {
  const map = new Map<string, string>();
  for (const [key, color] of Object.entries(palette.mix)) if (typeof color === 'string' && color.startsWith('#')) map.set(color.toLowerCase(), key);
  map.set(palette.text.toLowerCase(), 'text');
  map.set(palette.textDim.toLowerCase(), 'textDim');
  return map;
}

/** 把 rgb(...) 或 #RRGGBB 统一成小写 #rrggbb */
export function normalizeColor(color: string): string {
  const value = color.trim().toLowerCase();
  const rgb = value.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (rgb) return `#${rgb.slice(1, 4).map(n => Number(n).toString(16).padStart(2, '0')).join('')}`;
  return value;
}

export async function svgHash(svg: string): Promise<string | null> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return null; // 局域网 http 打开时没有 subtle，只能信任导出
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(svg));
  return [...new Uint8Array(digest)].slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
}
