import { generatePlaceholder } from './placeholders';
import { namespaceSvg } from './namespace';
import { dimensions } from './types';
import type { ArtDefinition, ArtManifest, LoadedAsset } from './types';
import { frameAt, normalizeColor, svgHash, tintKeys, type SpriteAction, type SpriteData, type SpriteEntry } from './sprites';

const SVG_NS = 'http://www.w3.org/2000/svg';
let instance = 0;

export interface ArtCreateOptions {
  /** Disable self-running SVG animation for table rows, growth slots and deck previews. */
  static?: boolean;
}

/** Keep original artwork intact and create a separate, fully static image source. */
export function staticArtSvg(svg: string): string {
  return svg.replace(/<svg\b[^>]*>/i, root => `${root}<style>*{animation:none!important;transition:none!important}</style>`);
}

/** Validate source files before inserting SVG markup into the game document. */
export function validateArtSvg(svg: string, definition: ArtDefinition): void {
  if (/<!DOCTYPE|<!ENTITY/i.test(svg)) throw new Error('SVG 不允许包含外部实体');
  const document = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const root = document.documentElement;
  if (document.querySelector('parsererror') || root.localName !== 'svg' || root.namespaceURI !== SVG_NS) {
    throw new Error('不是有效的 SVG 文件');
  }
  if (root.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number).join(' ') !== definition.viewBox.trim().split(/[\s,]+/).map(Number).join(' ')) {
    throw new Error(`viewBox 应为 ${definition.viewBox}`);
  }
  for (const part of definition.parts ?? []) {
    if (![root, ...root.querySelectorAll('[id]')].some(element => element.id === part)) throw new Error(`缺少约定部件 #${part}`);
  }
  for (const slot of Object.keys(definition.slots ?? {})) {
    const target = [...root.querySelectorAll('[id]')].find(element => element.id === slot);
    if (!target || target.localName !== 'g') throw new Error(`缺少约定文字槽 <g id="${slot}">`);
  }
  // Artwork is local, declarative SVG only. It must not make network requests or run scripts.
  for (const element of [root, ...root.querySelectorAll('*')]) {
    if (['script', 'foreignobject', 'iframe', 'audio', 'video'].includes(element.localName.toLowerCase())) throw new Error('SVG 包含不支持的活动内容');
    if (element.localName === 'style' && /@import|@font-face/i.test(element.textContent ?? '')) throw new Error('SVG 不允许加载外部样式或字体');
    for (const attribute of [...element.attributes]) {
      if (/^on/i.test(attribute.name)) throw new Error('SVG 不允许事件脚本');
      if (attribute.localName === 'href' && !attribute.value.startsWith('#')) throw new Error('SVG 引用必须是文件内的 #id');
      if (/url\(\s*['"]?\s*(?!#)/i.test(attribute.value.replace(/url\(\s*['"]?\s*#/gi, 'local-fragment('))) {
        throw new Error('SVG 不允许加载外部资源');
      }
    }
    if (element.localName === 'style') {
      const css = (element.textContent ?? '').replace(/url\(\s*['"]?\s*#/gi, 'local-fragment(');
      if (/url\(/i.test(css)) throw new Error('SVG 不允许加载外部资源');
    }
  }
}

/** 一个正在显示的精灵图素材 */
interface SpriteState {
  el: SVGSVGElement;
  asset: LoadedAsset;
  frame: SVGSVGElement;
  image: SVGImageElement;
  slots: Map<string, SVGGElement>;
  action: string;
  clock: Animation | null;
  token: number;
  shown: string;
  /** 静止：待机停在第 0 帧，不走（桌上的牌、成长槽）。事件照样播。 */
  still: boolean;
  created: number;
  seen: boolean;
}

export class ArtStore {
  readonly manifest: ArtManifest;
  readonly assets: Map<string, LoadedAsset>;
  private readonly sprites = new Set<SpriteState>();
  private readonly spriteOf = new WeakMap<Element, SpriteState>();
  private readonly tints: Map<string, string>;
  private ticking = 0;
  private readonly timers = new Map<SVGSVGElement, ReturnType<typeof setTimeout>>();
  private readonly removals = new Map<SVGSVGElement, ReturnType<typeof setTimeout>>();
  private stays = new WeakMap<SVGSVGElement, string>();
  private disposed = false;

  constructor(manifest: ArtManifest, assets: LoadedAsset[]) {
    this.manifest = manifest;
    this.assets = new Map(assets.map(asset => [asset.definition.id, asset]));
    this.tints = tintKeys(manifest.palette);
  }

  /** 这个素材有没有用精灵图 */
  isSprite(element: Element): boolean { return this.spriteOf.has(element); }

  /** 给 <img>、九宫格、图标、背景用的地址：有精灵图就是静止 PNG，没有就是 SVG */
  imageUrl(id: string, still = false): string {
    const asset = this.get(id);
    if (asset.sprite) return asset.sprite.base + asset.sprite.entries['']!.still;
    return still ? asset.staticUrl ?? asset.url : asset.url;
  }

  /** 桌上的牌、成长槽这些：待机停在第 0 帧 */
  setStatic(element: Element, still: boolean): void {
    const state = this.spriteOf.get(element); if (!state || state.still === still) return;
    state.still = still;
    if (state.action === 'idle') this.startAction(state, 'idle');
  }
  get(id: string): LoadedAsset {
    const asset = this.assets.get(id);
    if (!asset) throw new Error(`未知素材：${id}`);
    return asset;
  }

  create(id: string, options: ArtCreateOptions = {}): HTMLImageElement | SVGSVGElement {
    const asset = this.get(id);
    if (asset.definition.load === 'img') {
      // 自带待机动画的 <img> 素材（宝石、牌背、徽记）：精灵图要用元素来播
      if (asset.sprite && asset.definition.idle && !options.static && asset.sprite.entries['']!.sheets.length) return this.createSprite(id, false);
      return this.createImage(id, options);
    }
    if (asset.sprite) return this.createSprite(id, !!options.static);
    const element = this.createInline(id);
    if (options.static) {
      const style = document.createElementNS(SVG_NS, 'style');
      const selector = `svg[data-art-prefix="${element.dataset.artPrefix}"]`;
      style.textContent = `${selector},${selector} *{animation:none!important;transition:none!important}`;
      element.prepend(style);
      element.dataset.artStatic = 'true';
    }
    return element;
  }

  createImage(id: string, options: ArtCreateOptions = {}): HTMLImageElement {
    const asset = this.get(id);
    if (asset.definition.load !== 'img') throw new Error(`${id} 必须以 inline SVG 显示`);
    const element = document.createElement('img');
    const [width, height] = dimensions(asset.definition);
    element.src = asset.sprite ? this.imageUrl(id) : options.static ? (asset.staticUrl ?? asset.url) : asset.url;
    element.dataset.artStatic = String(!!options.static);
    element.width = width;
    element.height = height;
    element.alt = asset.definition.desc;
    element.draggable = false;
    element.dataset.artId = id;
    element.dataset.artSource = asset.source;
    return element;
  }

  createInline(id: string): SVGSVGElement {
    const asset = this.get(id);
    if (asset.definition.load !== 'inline') throw new Error(`${id} 应以 img 显示`);
    if (asset.sprite) return this.createSprite(id, false);
    const prefix = `i${++instance}`;
    const source = namespaceSvg(asset.svg, prefix);
    const parsed = new DOMParser().parseFromString(source, 'image/svg+xml');
    const element = document.importNode(parsed.documentElement, true) as unknown as SVGSVGElement;
    const [width, height] = dimensions(asset.definition);
    element.setAttribute('width', String(width));
    element.setAttribute('height', String(height));
    element.dataset.artId = id;
    element.dataset.artSource = asset.source;
    element.dataset.artPrefix = prefix;
    element.setAttribute('role', 'img');
    element.setAttribute('aria-label', asset.definition.desc);
    // Keep each artwork's root class contract even if an artist omitted it.
    element.classList.add(`svg-${id}`);
    return element;
  }

  /**
   * The manifest is the timing authority. Older artwork need not contain a CSS
   * selector for a newly added event: the attribute still expires on schedule.
   * Repeated events restart immediately. Temporary events restore a stay state.
   */
  play(element: SVGSVGElement, event: string): number {
    if (this.disposed) return 0;
    const id = element.dataset.artId;
    if (!id) throw new Error('事件只能作用于由 ArtStore 创建的素材');
    const definition = this.get(id).definition;
    const duration = definition.events?.[event];
    if (duration === undefined) return 0;
    const sprite = this.spriteOf.get(element);
    if (sprite) return this.playSprite(sprite, event, duration);
    this.cancelTimer(element);
    if (definition.stay?.includes(event)) this.stays.set(element, event);
    element.removeAttribute('data-anim');
    void element.getBoundingClientRect();
    element.setAttribute('data-anim', event);
    // A stay event remains mounted, including its looping or forwards-filled CSS animation.
    if (definition.stay?.includes(event)) return duration;
    const timer = setTimeout(() => {
      this.afterFiniteAnimations(element, () => {
        if (this.timers.get(element) !== timer || this.disposed) return;
        this.timers.delete(element);
        if (element.getAttribute('data-anim') !== event) return;
        const stay = this.stays.get(element);
        if (stay) element.setAttribute('data-anim', stay);
        else element.removeAttribute('data-anim');
      });
    }, duration);
    this.timers.set(element, timer);
    return duration;
  }

  getStay(element: SVGSVGElement): string | null {
    return this.stays.get(element) ?? null;
  }

  /** Clearing a stay state does not cut short a currently playing temporary event. */
  setStay(element: SVGSVGElement, event: string | null): void {
    if (this.disposed) return;
    const id = element.dataset.artId;
    if (!id) throw new Error('事件只能作用于由 ArtStore 创建的素材');
    if (event !== null) {
      if (!this.get(id).definition.stay?.includes(event)) throw new Error(`${id} 没有持久事件 ${event}`);
      if (this.stays.get(element) !== event) this.play(element, event);
      return;
    }
    const previous = this.stays.get(element);
    this.stays.delete(element);
    if (previous && element.getAttribute('data-anim') === previous) {
      element.removeAttribute('data-anim');
      const sprite = this.spriteOf.get(element);
      if (sprite && sprite.action.split('~')[0] === previous) this.startAction(sprite, 'idle');
    }
  }

  /** Return to idle and cancel any pending restoration, e.g. before replacing an instance. */
  stop(element: SVGSVGElement): void {
    this.cancelTimer(element);
    this.stays.delete(element);
    element.removeAttribute('data-anim');
    const sprite = this.spriteOf.get(element);
    if (sprite) this.startAction(sprite, 'idle');
  }

  private cancelTimer(element: SVGSVGElement): void {
    const timer = this.timers.get(element);
    if (timer !== undefined) clearTimeout(timer);
    this.timers.delete(element);
  }

  /** Keep hit-stop / slow-motion tails; missing event CSS still finishes on the manifest timer. */
  private afterFiniteAnimations(element: SVGSVGElement, finish: () => void): void {
    const animations = element.getAnimations?.({ subtree:true }) ?? [];
    const finite = animations.filter(animation => {
      const endTime = animation.effect?.getComputedTiming().endTime;
      return (animation.playState === 'running' || animation.playState === 'paused')
        && typeof endTime === 'number' && Number.isFinite(endTime);
    });
    if (!finite.length) { finish(); return; }
    // Infinite idle / stay animations are deliberately excluded. Cancellation is
    // also completion here, with the caller's token protecting newer events.
    void Promise.allSettled(finite.map(animation => animation.finished)).then(finish);
  }

  /** Insert a code-owned value inside a namespaced artwork slot, never as markup. */
  setSlotText(element: SVGSVGElement, slotId: string, value: string | number): SVGTextElement {
    const id = element.dataset.artId;
    if (!id) throw new Error('文字槽只能作用于由 ArtStore 创建的素材');
    const position = this.get(id).definition.slots?.[slotId];
    if (!position) throw new Error(`${id} 没有文字槽 ${slotId}`);
    const namespacedId = `${element.dataset.artPrefix}-${slotId}`;
    const slot = [...element.querySelectorAll('[id]')].find(part => part.id === namespacedId);
    if (!slot || slot.localName !== 'g') throw new Error(`${id} 缺少文字槽 #${namespacedId}`);
    let text = slot.querySelector<SVGTextElement>('text[data-art-slot-value]');
    if (!text) {
      text = document.createElementNS(SVG_NS, 'text');
      text.dataset.artSlotValue = slotId;
      slot.append(text);
    }
    text.setAttribute('x', String(position[0]));
    text.setAttribute('y', String(position[1]));
    text.setAttribute('font-size', String(id === 'ui_rule_sign' && slotId === 'rule_text' && String(value).length >= 4 ? Math.min(24, position[2]) : position[2]));
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'central');
    text.setAttribute('font-weight', '700');
    text.setAttribute('font-family', 'sans-serif');
    text.setAttribute('fill', this.manifest.palette.ink);
    text.textContent = String(value);
    return text;
  }

  /** Fill an existing artwork group with a code-owned icon from the loaded manifest. */
  setSlotIcon(element: SVGSVGElement, slotId: string, assetId: string, box: [number, number, number, number] = [20,16,56,56]): SVGImageElement {
    const id = element.dataset.artId;
    if (!id) throw new Error('图标槽只能作用于由 ArtStore 创建的素材');
    if (!this.get(id).definition.parts?.includes(slotId)) throw new Error(`${id} 没有图标槽 ${slotId}`);
    const slot = [...element.querySelectorAll('[id]')].find(part => part.id === `${element.dataset.artPrefix}-${slotId}`);
    if (!slot || slot.localName !== 'g') throw new Error(`${id} 缺少图标槽 #${slotId}`);
    const asset = this.get(assetId);
    if (asset.definition.load !== 'img') throw new Error(`${assetId} 不是静态图标素材`);
    let icon = slot.querySelector<SVGImageElement>('image[data-art-slot-icon]');
    if (!icon) {
      icon = document.createElementNS(SVG_NS, 'image');
      icon.dataset.artSlotIcon = slotId;
      slot.append(icon);
    }
    for (const [index, name] of ['x','y','width','height'].entries()) icon.setAttribute(name,String(box[index]));
    icon.setAttribute('href', this.imageUrl(assetId));
    icon.setAttribute('preserveAspectRatio','xMidYMid meet');
    icon.setAttribute('aria-label',asset.definition.desc);
    icon.dataset.iconArtId = assetId;
    return icon;
  }

  /** Effects are fresh instances. The caller supplies coordinates in its own layout system. */
  effect(id: string, parent: HTMLElement, x: number, y: number, color?: string): SVGSVGElement {
    if (!id.startsWith('fx_')) throw new Error('effect 只接受 fx_* 素材');
    const element = this.createInline(id);
    const [width, height] = dimensions(this.get(id).definition);
    Object.assign(element.style, { position: 'absolute', left: `${x-width/2}px`, top: `${y-height/2}px`, pointerEvents: 'none' });
    if (this.get(id).definition.tint) element.style.color = color ?? this.manifest.palette.text;
    parent.append(element);
    const sprite = this.spriteOf.get(element);
    if (sprite) {
      // 精灵图特效：播完就拿掉（顿帧、慢放会让它晚一点结束）
      this.startAction(sprite, 'play', () => { if (!this.disposed) element.remove(); });
      element.setAttribute('data-anim', 'play');
      return element;
    }
    const duration = this.play(element, 'play');
    const removal = setTimeout(() => {
      this.afterFiniteAnimations(element, () => {
        if (this.removals.get(element) !== removal || this.disposed) return;
        element.remove();
        this.removals.delete(element);
      });
    }, duration);
    this.removals.set(element, removal);
    return element;
  }

  nineSlice(element: HTMLElement, id: string, width: number): void {
    const asset = this.get(id);
    if (!asset.definition.nineSlice) throw new Error(`${id} 没有九宫格约定`);
    element.style.borderStyle = 'solid';
    element.style.borderWidth = '0';
    element.style.borderImageSource = `url("${this.imageUrl(id)}")`;
    const sliceScale = asset.sprite ? asset.sprite.entries['']!.stillScale : 1;
    element.style.borderImageSlice = `${asset.definition.nineSlice.map(v => v * sliceScale).join(' ')} fill`;
    element.style.borderImageWidth = `${width}px`;
    element.style.borderImageRepeat = 'stretch';
  }

  /** Place the manifest anchor at a design-coordinate point, without scaling. */
  anchor(element: HTMLElement | SVGSVGElement, id: string, x: number, y: number): void {
    const anchor = this.get(id).definition.anchor;
    if (!anchor) throw new Error(`${id} 没有对齐点`);
    Object.assign(element.style, { position: 'absolute', left: `${x-anchor[0]}px`, top: `${y-anchor[1]}px` });
  }

  // ---------- 精灵图 ----------

  private createSprite(id: string, still: boolean): SVGSVGElement {
    const asset = this.get(id);
    const definition = asset.definition;
    const [width, height] = dimensions(definition);
    const prefix = `i${++instance}`;
    const element = document.createElementNS(SVG_NS, 'svg');
    element.setAttribute('viewBox', `0 0 ${width} ${height}`);
    element.setAttribute('width', String(width));
    element.setAttribute('height', String(height));
    element.dataset.artId = id;
    element.dataset.artSource = asset.source;
    element.dataset.artPrefix = prefix;
    element.dataset.artSprite = 'true';
    element.setAttribute('role', 'img');
    element.setAttribute('aria-label', definition.desc);
    element.classList.add(`svg-${id}`, 'art-sprite');
    const frame = document.createElementNS(SVG_NS, 'svg');
    frame.setAttribute('preserveAspectRatio', 'none');
    frame.setAttribute('overflow', 'hidden');
    frame.classList.add('sprite-frame');
    const image = document.createElementNS(SVG_NS, 'image');
    image.setAttribute('preserveAspectRatio', 'none');
    frame.append(image); element.append(frame);
    const slots = new Map<string, SVGGElement>();
    const slotIds = [...Object.keys(definition.slots ?? {}), ...((definition.parts ?? []).includes('icon_slot') ? ['icon_slot'] : [])];
    for (const slot of slotIds) {
      const g = document.createElementNS(SVG_NS, 'g'); g.id = `${prefix}-${slot}`; element.append(g); slots.set(slot, g);
    }
    const state: SpriteState = { el: element, asset, frame, image, slots, action: 'idle', clock: null, token: 0, shown: '', still, created: performance.now(), seen: false };
    this.sprites.add(state); this.spriteOf.set(element, state);
    this.startAction(state, 'idle');
    this.tick();
    return element;
  }

  /** 染色素材按元素上的颜色挑那一套 */
  private entryOf(state: SpriteState): { entry: SpriteEntry; key: string } {
    const entries = state.asset.sprite!.entries;
    if (!state.asset.definition.tint) return { entry: entries['']!, key: '' };
    const color = state.el.style.color ? normalizeColor(state.el.style.color) : '';
    const key = this.tints.get(color) ?? 'text';
    return { entry: entries[key] ?? entries['text'] ?? Object.values(entries)[0]!, key };
  }

  private actionOf(state: SpriteState, name: string): SpriteAction | undefined {
    return this.entryOf(state).entry.actions[name];
  }

  /** 播一个动作。时间由一个空的网页动画来走，所以顿帧（暂停）和慢放（改速度）会一起作用到精灵图上。 */
  private startAction(state: SpriteState, name: string, onEnd?: () => void): void {
    state.clock?.cancel(); state.clock = null;
    const token = ++state.token;
    let action = this.actionOf(state, name);
    if (!action) { name = 'idle'; action = this.actionOf(state, 'idle'); }
    state.action = name;
    if (!action) return;
    const total = action.frames.reduce((sum, f) => sum + f.d, 0);
    if ((name === 'idle' && state.still) || action.frames.length < 2 || !total) {
      state.shown = ''; this.draw(state, 0);
      if (!action.loop && onEnd) queueMicrotask(() => { if (state.token === token) onEnd(); });
      return;
    }
    const clock = state.frame.animate([{ opacity: 1 }, { opacity: 1 }], { duration: total, iterations: action.loop ? Infinity : 1, fill: action.loop ? 'none' : 'forwards' });
    state.clock = clock;
    state.shown = ''; this.draw(state, 0);
    if (!action.loop) clock.finished.then(() => { if (state.token === token && !this.disposed) onEnd?.(); }, () => undefined);
  }

  private playSprite(state: SpriteState, event: string, duration: number): number {
    const element = state.el;
    const definition = state.asset.definition;
    const stay = definition.stay?.includes(event);
    this.cancelTimer(element);
    if (stay) this.stays.set(element, event);
    element.setAttribute('data-anim', event);
    this.startAction(state, event, () => {
      if (stay) { if (this.actionOf(state, `${event}~loop`)) this.startAction(state, `${event}~loop`); return; }
      const current = this.stays.get(element);
      if (current) { element.setAttribute('data-anim', current); this.resumeStay(state, current); }
      else { element.removeAttribute('data-anim'); this.startAction(state, 'idle'); }
    });
    return duration;
  }

  /** 被打完回到发晕这类状态：不再播进场，直接接循环或停在最后一帧 */
  private resumeStay(state: SpriteState, stay: string): void {
    if (this.actionOf(state, `${stay}~loop`)) { this.startAction(state, `${stay}~loop`); return; }
    this.startAction(state, stay);
    if (state.clock) { state.clock.finish(); }
  }

  private tick = () => {
    this.ticking = 0;
    if (this.disposed || !this.sprites.size) return;
    const now = performance.now();
    for (const state of this.sprites) {
      if (!state.el.isConnected) {
        if (state.seen || now - state.created > 5000) { state.clock?.cancel(); this.sprites.delete(state); }
        continue;
      }
      state.seen = true;
      if (state.clock) this.draw(state, Number(state.clock.currentTime ?? 0));
      else if (state.asset.definition.tint) this.draw(state, 0); // 颜色可能刚换
    }
    this.ticking = requestAnimationFrame(this.tick);
  };

  private draw(state: SpriteState, time: number): void {
    const { entry, key } = this.entryOf(state);
    const action = entry.actions[state.action] ?? entry.actions['idle'];
    if (!action) return;
    const index = frameAt(action, time);
    const id = `${key}|${state.action}|${index}`;
    if (state.shown === id) return;
    state.shown = id;
    const frame = action.frames[index]!;
    const base = state.asset.sprite!.base;
    if (frame.s === -2) { state.frame.style.display = 'none'; }
    else {
      state.frame.style.display = '';
      if (frame.s === -1) {
        const ss = entry.stillScale;
        this.setFrame(state, base + entry.still, 0, 0, entry.w, entry.h, `0 0 ${entry.w * ss} ${entry.h * ss}`, entry.w * ss, entry.h * ss);
      } else {
        const sheet = entry.sheets[frame.s]!; const scale = entry.scale;
        this.setFrame(state, base + sheet.f, frame.ox! / scale, frame.oy! / scale, frame.w! / scale, frame.h! / scale, `${frame.x} ${frame.y} ${frame.w} ${frame.h}`, sheet.w, sheet.h);
      }
    }
    if (frame.m) for (const [slot, m] of Object.entries(frame.m)) state.slots.get(slot)?.setAttribute('transform', `matrix(${m.join(' ')})`);
  }

  private setFrame(state: SpriteState, href: string, x: number, y: number, w: number, h: number, viewBox: string, imageW: number, imageH: number): void {
    const { frame, image } = state;
    if (image.getAttribute('href') !== href) image.setAttribute('href', href);
    frame.setAttribute('x', String(x)); frame.setAttribute('y', String(y));
    frame.setAttribute('width', String(w)); frame.setAttribute('height', String(h));
    frame.setAttribute('viewBox', viewBox);
    image.setAttribute('width', String(imageW)); image.setAttribute('height', String(imageH));
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const timer of this.timers.values()) clearTimeout(timer);
    for (const [element, timer] of this.removals) { clearTimeout(timer); element.remove(); }
    this.timers.clear();
    this.removals.clear();
    this.stays = new WeakMap();
    for (const state of this.sprites) state.clock?.cancel();
    this.sprites.clear(); if (this.ticking) cancelAnimationFrame(this.ticking);
    const urls = new Set([...this.assets.values()].flatMap(asset => asset.staticUrl ? [asset.url, asset.staticUrl] : [asset.url]));
    for (const url of urls) URL.revokeObjectURL(url);
  }
}

export interface ArtLoadOptions {
  manifestUrl?: string;
  artBaseUrl?: string;
  /** 精灵图目录；false = 不用精灵图（素材检查页、?art=svg） */
  spriteBaseUrl?: string | false;
  fetcher?: typeof fetch;
  onProgress?: (loaded: number, total: number) => void;
}

/** Every asset resolves to either checked artwork or a contract-compatible placeholder. */
export async function loadArtAssets(options: ArtLoadOptions = {}): Promise<ArtStore> {
  const fetcher = options.fetcher ?? fetch;
  const manifestUrl = options.manifestUrl ?? './art-manifest.json';
  const artBase = options.artBaseUrl ?? './art/';
  const response = await fetcher(manifestUrl, { cache: 'no-store' });
  if (!response.ok) throw new Error(`素材清单加载失败（HTTP ${response.status}）`);
  const manifest = await response.json() as ArtManifest;
  if (!manifest.palette || !manifest.cardLayout || !Array.isArray(manifest.assets)) throw new Error('素材清单格式不完整');
  const ids = new Set<string>();
  for (const definition of manifest.assets) {
    if (!/^[A-Za-z0-9_-]+$/.test(definition.id) || ids.has(definition.id)) throw new Error(`素材 id 不合法或重复：${definition.id}`);
    ids.add(definition.id);
    dimensions(definition);
  }
  let sprites: SpriteData | null = null;
  const spriteBase = options.spriteBaseUrl === undefined ? './sprites/' : options.spriteBaseUrl;
  if (spriteBase !== false) {
    try {
      const spriteResponse = await fetcher(`${spriteBase.replace(/\/?$/, '/')}sprites.json`, { cache: 'no-store' });
      if (spriteResponse.ok) sprites = await spriteResponse.json() as SpriteData;
    } catch { sprites = null; }
  }
  const stale: string[] = [];
  let loaded = 0;
  const assets = await Promise.all(manifest.assets.map(async definition => {
    let svg: string;
    let source: LoadedAsset['source'] = 'placeholder';
    let error: string | undefined;
    try {
      const artResponse = await fetcher(`${artBase.replace(/\/?$/, '/')}${definition.id}.svg`, { cache: 'no-store' });
      if (!artResponse.ok) throw new Error(artResponse.status === 404 ? '未交付 SVG' : `HTTP ${artResponse.status}`);
      svg = await artResponse.text();
      validateArtSvg(svg, definition);
      source = 'art';
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
      svg = generatePlaceholder(definition, manifest);
    }
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    const staticUrl = definition.idle
      ? URL.createObjectURL(new Blob([staticArtSvg(svg)], { type: 'image/svg+xml' }))
      : undefined;
    let sprite: LoadedAsset['sprite'];
    if (sprites && source === 'art' && spriteBase !== false) {
      const entries: Record<string, SpriteEntry> = {};
      for (const [name, entry] of Object.entries(sprites.assets)) {
        const [base, key = ''] = name.split('@');
        if (base === definition.id) entries[key] = entry;
      }
      const main = entries[''] ?? entries['text'];
      if (main) {
        if (!entries['']) entries[''] = main;
        const hash = await svgHash(svg);
        if (hash && hash !== main.hash) stale.push(definition.id);
        else sprite = { base: spriteBase.replace(/\/?$/, '/'), entries };
      }
    }
    options.onProgress?.(++loaded, manifest.assets.length);
    return { definition, source, svg, url, staticUrl, error, sprite } satisfies LoadedAsset;
  }));
  if (stale.length) console.warn(`精灵图过期，先用 SVG（跑 npm run export:sprites 重导）：${stale.join(' ')}`);
  return new ArtStore(manifest, assets);
}
