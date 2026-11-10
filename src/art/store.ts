import { generatePlaceholder } from './placeholders';
import { namespaceSvg } from './namespace';
import { dimensions } from './types';
import type { ArtDefinition, ArtManifest, LoadedAsset } from './types';

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

export class ArtStore {
  readonly manifest: ArtManifest;
  readonly assets: Map<string, LoadedAsset>;
  private readonly timers = new Map<SVGSVGElement, ReturnType<typeof setTimeout>>();
  private readonly removals = new Map<SVGSVGElement, ReturnType<typeof setTimeout>>();
  private stays = new WeakMap<SVGSVGElement, string>();
  private disposed = false;

  constructor(manifest: ArtManifest, assets: LoadedAsset[]) {
    this.manifest = manifest;
    this.assets = new Map(assets.map(asset => [asset.definition.id, asset]));
  }

  get(id: string): LoadedAsset {
    const asset = this.assets.get(id);
    if (!asset) throw new Error(`未知素材：${id}`);
    return asset;
  }

  create(id: string, options: ArtCreateOptions = {}): HTMLImageElement | SVGSVGElement {
    if (this.get(id).definition.load === 'img') return this.createImage(id, options);
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
    element.src = options.static ? (asset.staticUrl ?? asset.url) : asset.url;
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
    if (previous && element.getAttribute('data-anim') === previous) element.removeAttribute('data-anim');
  }

  /** Return to idle and cancel any pending restoration, e.g. before replacing an instance. */
  stop(element: SVGSVGElement): void {
    this.cancelTimer(element);
    this.stays.delete(element);
    element.removeAttribute('data-anim');
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
    icon.setAttribute('href', asset.url);
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
    element.style.borderImageSource = `url("${asset.url}")`;
    element.style.borderImageSlice = `${asset.definition.nineSlice.join(' ')} fill`;
    element.style.borderImageWidth = `${width}px`;
    element.style.borderImageRepeat = 'stretch';
  }

  /** Place the manifest anchor at a design-coordinate point, without scaling. */
  anchor(element: HTMLElement | SVGSVGElement, id: string, x: number, y: number): void {
    const anchor = this.get(id).definition.anchor;
    if (!anchor) throw new Error(`${id} 没有对齐点`);
    Object.assign(element.style, { position: 'absolute', left: `${x-anchor[0]}px`, top: `${y-anchor[1]}px` });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const timer of this.timers.values()) clearTimeout(timer);
    for (const [element, timer] of this.removals) { clearTimeout(timer); element.remove(); }
    this.timers.clear();
    this.removals.clear();
    this.stays = new WeakMap();
    const urls = new Set([...this.assets.values()].flatMap(asset => asset.staticUrl ? [asset.url, asset.staticUrl] : [asset.url]));
    for (const url of urls) URL.revokeObjectURL(url);
  }
}

export interface ArtLoadOptions {
  manifestUrl?: string;
  artBaseUrl?: string;
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
    options.onProgress?.(++loaded, manifest.assets.length);
    return { definition, source, svg, url, staticUrl, error } satisfies LoadedAsset;
  }));
  return new ArtStore(manifest, assets);
}
