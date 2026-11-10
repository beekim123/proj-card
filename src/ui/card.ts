import type { ArtStore } from '../art';
import { CONFIG, CARD_NAMES, FORM_KEYS, TOOLS } from '../rules';
import type { Card } from '../rules';
import './card.css';

const COLORS = ['red', 'green', 'blue'] as const;
const NAMES = ['红', '绿', '蓝'];
const BITS = [1, 2, 4];
const VALUES = CONFIG.gemValue;
let textMeasure: CanvasRenderingContext2D | null | undefined;
const NS = 'http://www.w3.org/2000/svg';

export interface CardOptions {
  /** Rule-provided growth thresholds for the current run (including relics). */
  thresholds?: readonly [number, number, number];
  /** Static image URLs and paused inline artwork for rows, decks and other still views. */
  static?: boolean;
  /** A mirror on the table has its resolved gem mask, rather than an unknown hand value. */
  resolved?: boolean;
  /** Play the tool artwork once, then return to the requested animated/static state. */
  play?: boolean;
}
interface CardAnimation {
  store: ArtStore;
  artwork: SVGSVGElement | null;
  paused: boolean;
  timer?: ReturnType<typeof setTimeout>;
}
const animations = new WeakMap<HTMLElement, CardAnimation>();

/** Pause only this card's artwork. An in-flight play event finishes before the pause resumes. */
export function setCardPaused(card: HTMLElement, paused: boolean): void {
  const animation = animations.get(card);
  if (animation) animation.paused = paused;
  card.dataset.static = String(paused);
  card.classList.toggle('card-paused', paused);
  if (animation) {
    for (const image of card.querySelectorAll<HTMLImageElement>('img[data-art-id]')) {
      const asset = animation.store.get(image.dataset.artId!);
      image.src = paused ? asset.staticUrl ?? asset.url : asset.url;
      image.dataset.artStatic = String(paused);
    }
  }
}

/** Replay a tool on this card. Repeated calls restart without an older timer stopping it. */
export function playCardArt(card: HTMLElement): number {
  const animation = animations.get(card);
  if (!animation?.artwork) return 0;
  if (animation.timer !== undefined) clearTimeout(animation.timer);
  card.classList.add('card-playing');
  const duration = animation.store.play(animation.artwork, 'play');
  animation.timer = setTimeout(() => {
    card.classList.remove('card-playing');
    card.classList.toggle('card-paused', animation.paused);
    animation.timer = undefined;
  }, duration);
  return duration;
}

/** A manifest-sized card. Numeric masks preserve the original base-card API. */
export function createCard(store: ArtStore, source: number | Card, growth: [number, number, number] = [0, 0, 0], growthEnabled = true, options: CardOptions = {}): HTMLDivElement {
  const data = typeof source === 'number' ? { v: source } : source;
  const mask = data.v;
  const toolType = 'type' in data ? data.type : undefined;
  const tool = toolType ? TOOLS[toolType] : undefined;
  const resolved = options.resolved ?? (typeof source !== 'number' && 'k' in source);
  const unknownMirror = toolType === 'mirror' && !resolved;
  const card = document.createElement('div');
  card.className = `gem-card${tool ? ' tool-card' : ''}`;
  card.dataset.mask = String(mask);
  if (toolType) card.dataset.tool = toolType;
  if ('id' in data) card.dataset.cardId = String(data.id);
  card.dataset.resolved = String(resolved);
  const { cardLayout: layout, palette } = store.manifest;
  card.style.width = `${layout.size[0]}px`;
  card.style.height = `${layout.size[1]}px`;
  const art = document.createElement('div');
  art.className = 'card-art';
  Object.assign(art.style, { left: `${layout.artWindow.x}px`, top: `${layout.artWindow.y}px`, width: `${layout.artWindow.w}px`, height: `${layout.artWindow.h}px`, borderRadius: `${layout.artWindow.r}px` });
  card.append(art);
  const put = (parent: HTMLElement, id: string, x: number, y: number, w: number, h: number) => {
    const el = store.create(id, { static: store.get(id).definition.load === 'img' && options.static });
    el.classList.add('card-layer');
    Object.assign(el.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` });
    parent.append(el);
    return el;
  };
  put(art, tool ? 'card_art_bg_tool' : 'card_art_bg', 0, 0, layout.artWindow.w, layout.artWindow.h);
  const color = palette.mix[String(mask)];
  if (color) {
    const glow = document.createElement('div');
    glow.className = 'card-glow';
    const g = layout.glow;
    Object.assign(glow.style, { left: `${g.cx - g.r}px`, top: `${g.cy - g.r}px`, width: `${g.r * 2}px`, height: `${g.r * 2}px`, opacity: String(g.opacity), background: `radial-gradient(circle, ${color}, transparent 70%)` });
    art.append(glow);
  }
  const active = BITS.map((bit, i) => mask & bit ? i : -1).filter(i => i >= 0);
  const thresholds = options.thresholds ?? CONFIG.formAt;
  const forms = growth.map(xp => !growthEnabled ? 0 : xp >= thresholds[2] ? 2 : xp >= thresholds[1] ? 1 : 0);
  let toolArtwork: SVGSVGElement | null = null;
  if (toolType) {
    toolArtwork = put(art, `card_art_${toolType}`, 0, 0, layout.artWindow.w, layout.artWindow.h) as SVGSVGElement;
    toolArtwork.classList.add('card-tool-art');
    if (toolType === 'mirror') toolArtwork.style.color = unknownMirror ? palette.text : color ?? palette.textDim;
  } else {
    if (active.length === 0) put(art, 'card_art_empty', 0, 0, layout.artWindow.w, layout.artWindow.h);
    for (let p = 0; p < active.length; p++) {
      const i = active[p];
      const position = active.length === 3 ? layout.gems['3'][COLORS[i]] : active.length === 2 ? layout.gems['2'][p] : layout.gems['1'][0];
      const [cx, cy, size] = position;
      put(art, `gem_${COLORS[i]}_${FORM_KEYS[forms[i]]}`, cx - size / 2, cy - size / 2, size, size);
    }
  }
  put(card, tool ? 'card_frame_tool' : 'card_frame', 0, 0, layout.size[0], layout.size[1]);
  put(card, 'card_gem_bar', layout.gemBar.x, layout.gemBar.y, layout.gemBar.w, layout.gemBar.h);
  for (const i of active) {
    const c = COLORS[i];
    const [x, y] = layout.gemBar.sockets[c];
    const s = layout.gemBar.iconSize;
    put(card, `gem_icon_${c}`, x - s / 2, y - s / 2, s, s);
    const [cx, cy] = layout.corner[c];
    const cs = layout.corner.iconSize;
    put(card, `gem_icon_${c}`, cx - cs / 2, cy - cs / 2, cs, cs);
  }
  const textLayer = document.createElementNS(NS, 'svg');
  textLayer.setAttribute('viewBox', `0 0 ${layout.size.join(' ')}`);
  textLayer.classList.add('card-layer', 'card-text');
  const values = active.map(i => VALUES[forms[i]]);
  const base = values.reduce((a, b) => a + b, 0);
  let line = tool?.text ?? (active.length ? active.map((i, p) => `${NAMES[i]} ${values[p]}`).join(' + ') : '没有宝石');
  textMeasure ??= document.createElement('canvas').getContext('2d');
  const measure = (value: string, size: number) => { if (!textMeasure) return value.length * size; textMeasure.font = `${size}px "PingFang SC", "Microsoft YaHei", sans-serif`; return textMeasure.measureText(value).width; };
  let lineSize = layout.text.line.size;
  if (!tool && measure(line, lineSize) > layout.text.line.maxWidth) line = active.length ? active.map((i, p) => `${NAMES[i]}${values[p]}`).join('+') : line;
  while (lineSize > layout.text.line.minSize && measure(line, lineSize) > layout.text.line.maxWidth) lineSize--;
  const name = tool?.name ?? CARD_NAMES[mask];
  const value = unknownMirror ? '?' : String(base);
  for (const key of ['name', 'value', 'line'] as const) {
    const config = layout.text[key];
    const text = document.createElementNS(NS, 'text');
    text.dataset.cardText = key;
    text.setAttribute('x', String(config.x)); text.setAttribute('y', String(config.y));
    text.setAttribute('font-size', String(key === 'line' ? lineSize : config.size));
    text.setAttribute('font-weight', String(config.weight ?? (key === 'line' ? 400 : 700)));
    text.setAttribute('text-anchor', config.align === 'right' ? 'end' : 'start');
    text.setAttribute('fill', String(palette[config.color as keyof typeof palette]));
    text.textContent = key === 'name' ? name : key === 'value' ? value : line;
    textLayer.append(text);
  }
  if (toolType) {
    // 效果角标：不看原画也知道这张牌干什么（原画重画前的兜底，2026-11-09）
    const label = { bag: `+${TOOLS.bag.draw} 张`, lens: `倍率×${TOOLS.lens.multiplier}`, hammer: `伤害×${TOOLS.hammer.turnMultiplier}`, mirror: '变色', stone: `成长+${TOOLS.stone.xp}` }[toolType];
    const w = 18 * [...label].reduce((s, ch) => s + (/[\x00-\x7f]/.test(ch) ? 0.62 : 1), 0) + 18;
    const badge = document.createElementNS(NS, 'g'); badge.dataset.cardText = 'badge';
    const rect = document.createElementNS(NS, 'rect');
    Object.entries({ x: 184 - w, y: 18, width: w, height: 30, rx: 8, fill: palette.ink, 'fill-opacity': 0.82, stroke: palette.accent, 'stroke-width': 2 }).forEach(([k, v]) => rect.setAttribute(k, String(v)));
    const label2 = document.createElementNS(NS, 'text');
    Object.entries({ x: 184 - w / 2, y: 39, 'font-size': 18, 'font-weight': 800, 'text-anchor': 'middle', fill: palette.accent }).forEach(([k, v]) => label2.setAttribute(k, String(v)));
    label2.textContent = label; badge.append(rect, label2); textLayer.append(badge);
  }
  card.append(textLayer);
  card.setAttribute('aria-label', `${name}，底数 ${value}，${line}`);
  animations.set(card, { store, artwork: toolArtwork, paused: !!options.static });
  setCardPaused(card, !!options.static);
  if (options.play) playCardArt(card);
  return card;
}
export { CARD_NAMES };
