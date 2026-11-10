import { afterEach, describe, expect, it, vi } from 'vitest';
import manifestJson from '../../public/art-manifest.json';
import { generatePlaceholder } from './placeholders';
import { namespaceSvg } from './namespace';
import { ArtStore, loadArtAssets, staticArtSvg } from './store';
import { dimensions } from './types';
import type { ArtManifest, LoadedAsset } from './types';

const manifest = manifestJson as unknown as ArtManifest;
const assets = manifest.assets.map(definition => ({ definition, source:'placeholder', svg:generatePlaceholder(definition,manifest), url:`blob:${definition.id}`, staticUrl:definition.idle ? `blob:${definition.id}-static` : undefined } as LoadedAsset));
const fakeSvg = (id: string) => {
  const attributes = new Map<string,string>();
  return {
    dataset:{ artId:id },
    setAttribute:(key:string,value:string) => attributes.set(key,value),
    removeAttribute:(key:string) => attributes.delete(key),
    getAttribute:(key:string) => attributes.get(key) ?? null,
    getBoundingClientRect:vi.fn(),
  } as unknown as SVGSVGElement;
};
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('素材占位契约', () => {
  it('清单全部素材都有同 viewBox 和固有尺寸的 SVG', () => {
    expect(assets).toHaveLength(89);
    for (const asset of assets) {
      const [width,height] = dimensions(asset.definition);
      expect(asset.svg).toContain(`viewBox="${asset.definition.viewBox}"`);
      expect(asset.svg).toContain(`width="${width}" height="${height}"`);
      expect(asset.svg).toContain(`class="svg-${asset.definition.id}"`);
      expect(asset.svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
      expect(asset.svg.endsWith('</svg>')).toBe(true);
    }
  });
  it('所有约定部件、事件、染色和特效待机透明均覆盖', () => {
    for (const { definition,svg } of assets) {
      for (const part of definition.parts ?? []) expect(svg).toContain(`id="${part}"`);
      for (const [event,duration] of Object.entries(definition.events ?? {})) {
        expect(svg).toContain(`[data-anim="${event}"]`);
        expect(svg).toContain(`${duration}ms`);
      }
      for (const slot of Object.keys(definition.slots ?? {})) expect(svg).toContain(`<g id="${slot}">`);
      if (definition.tint) expect(svg).toContain('currentColor');
      if (definition.id.startsWith('fx_')) expect(svg).toContain('#effect { opacity:0;');
    }
  });
  it('牌框采用镂空路径，空托没有发光，九宫格保留角标', () => {
    expect(assets.find(a => a.definition.id === 'card_frame')!.svg).toContain('fill-rule="evenodd"');
    expect(assets.find(a => a.definition.id === 'card_art_empty')!.svg).not.toContain('gradient');
    for (const asset of assets.filter(a => a.definition.nineSlice)) {
      expect(asset.svg.match(/<rect/g)).toHaveLength(5);
    }
  });
  it('所有占位只使用 palette 颜色和明确指定的原石灰褐色', () => {
    const colors = new Set([manifest.palette.ink,manifest.palette.text,manifest.palette.textDim,manifest.palette.accent,manifest.palette.accentDark,manifest.palette.pageBg,manifest.palette.panelBg,manifest.palette.barTrack,manifest.palette.barFill,manifest.palette.hpFill,manifest.palette.hpChip,...Object.values(manifest.palette.gem).map(g => g.mid),...Object.values(manifest.palette.mix).filter(c => /^#[0-9a-f]{6}$/i.test(c ?? '')),'#4a4440'].map(c => c?.toLowerCase()));
    for (const asset of assets) for (const match of asset.svg.matchAll(/#[0-9a-f]{6}\b/gi)) expect(colors.has(match[0].toLowerCase())).toBe(true);
  });
});

describe('inline SVG 实例隔离', () => {
  it('重写 ID、属性 url、href、xlink:href 和 style 中已知 ID', () => {
    const source = `<svg><defs><linearGradient id="g"/></defs><g id='x' data-id="keep" fill="url(#g)"><use href="#x"/><use xlink:href='#g'/></g><style id="styleId">#x:hover{fill:url('#g')} #xx,#x-more,#x_2,#x2,#external{fill:none}.svg-test{@keyframes unchanged{}}</style></svg>`;
    const output = namespaceSvg(source,'i37');
    expect(output).toContain('id="i37-g"');
    expect(output).toContain("id='i37-x'");
    expect(output).toContain('data-id="keep"');
    expect(output).toContain('<style id="i37-styleId">');
    expect(output).toContain('fill="url(#i37-g)"');
    expect(output).toContain('href="#i37-x"');
    expect(output).toContain("xlink:href='#i37-g'");
    expect(output).toContain("#i37-x:hover{fill:url('#i37-g')}");
    expect(output).toContain('#xx,#x-more,#x_2,#x2,#external');
    expect(output).toContain('.svg-test{@keyframes unchanged');
  });
  it('前缀碰撞时同样只重写一次，不误改 data-id', () => {
    const output = namespaceSvg(`<svg><g id="x"/><g id="i37-x" data-id="x"/><style>#x{fill:url(#x)} #i37-x{fill:url(#i37-x)}</style></svg>`,'i37');
    expect(output).toContain('#i37-x{fill:url(#i37-x)} #i37-i37-x{fill:url(#i37-i37-x)}');
    expect(output).toContain('data-id="x"');
  });
  it('同一个素材的两个实例没有任何重复 ID', () => {
    for (const asset of assets.filter(a => a.definition.load === 'inline')) {
      const first = namespaceSvg(asset.svg,'i10');
      const second = namespaceSvg(asset.svg,'i11');
      const ids = [...first.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
      for (const id of ids) expect(second).not.toContain(`id="${id}"`);
      expect(first).toContain(`svg-${asset.definition.id}`);
    }
  });
});

describe('素材加载和生命周期', () => {
  it('缺失的美术统一回退，占位全部准备好后返回，可报告加载进度', async () => {
    const progress = vi.fn();
    const fetcher = vi.fn(async (url: RequestInfo | URL) => String(url).endsWith('art-manifest.json')
      ? new Response(JSON.stringify(manifest),{status:200}) : new Response('',{status:404}));
    const store = await loadArtAssets({ fetcher:fetcher as typeof fetch, onProgress:progress });
    expect(fetcher).toHaveBeenCalledTimes(90);
    expect(store.assets.size).toBe(89);
    expect([...store.assets.values()].every(asset => asset.source === 'placeholder' && asset.url.startsWith('blob:'))).toBe(true);
    expect(progress).toHaveBeenLastCalledWith(89,89);
    expect(fetcher).toHaveBeenCalledWith('./art/dummy.svg',{cache:'no-store'});
    store.dispose();
  });
  it('清单读取失败不会假装完成加载', async () => {
    const fetcher = vi.fn(async () => new Response('',{status:500}));
    await expect(loadArtAssets({fetcher:fetcher as typeof fetch})).rejects.toThrow('素材清单加载失败');
  });
  it('连续重复同名事件会重播，旧定时器不会提前结束新动画', () => {
    vi.useFakeTimers();
    const store = new ArtStore(manifest,assets);
    const svg = fakeSvg('dummy');
    expect(store.play(svg,'hit')).toBe(400);
    vi.advanceTimersByTime(300);
    store.play(svg,'hit');
    vi.advanceTimersByTime(100);
    expect(svg.getAttribute('data-anim')).toBe('hit');
    vi.advanceTimersByTime(300);
    expect(svg.getAttribute('data-anim')).toBeNull();
    expect(svg.getBoundingClientRect).toHaveBeenCalledTimes(2);
  });
  it('不同事件可抢占；独立实例互不干扰', () => {
    vi.useFakeTimers();
    const store = new ArtStore(manifest,assets);
    const first = fakeSvg('dummy');
    const second = fakeSvg('dummy');
    store.play(first,'hit');
    store.play(second,'hit_big');
    vi.advanceTimersByTime(100);
    store.play(first,'hit_big');
    vi.advanceTimersByTime(600);
    expect(second.getAttribute('data-anim')).toBeNull();
    expect(first.getAttribute('data-anim')).toBe('hit_big');
    vi.advanceTimersByTime(100);
    expect(first.getAttribute('data-anim')).toBeNull();
  });
  it('九宫格用绝对 px 边宽，零 border-width 不会导致角宽为零', () => {
    const store = new ArtStore(manifest,assets);
    const target = {style:{}} as HTMLElement;
    store.nineSlice(target,'table_cloth',72);
    expect(target.style.borderImageWidth).toBe('72px');
    expect(target.style.borderImageSlice).toBe('72 72 72 72 fill');
    expect(target.style.borderImageSource).toBe('url("blob:table_cloth")');
  });
  it('素材锚点在 1 倍下准确对齐；未知素材或事件明确报错', () => {
    const store = new ArtStore(manifest,assets);
    const target = {style:{}} as HTMLElement;
    store.anchor(target,'dummy',540,950);
    expect(target.style.left).toBe('390px');
    expect(target.style.top).toBe('566px');
    expect(() => store.get('missing')).toThrow('未知素材');
    expect(store.play(fakeSvg('dummy'),'play')).toBe(0);
  });
});


describe('新素材的完整契约', () => {
  it('89 项状态齐全，宝石、牌背、徽记和门环标记为 idle', () => {
    expect(manifest.assets).toHaveLength(89);
    expect(manifest.assets.every(asset => ['已有', '返修', '重画', '新画'].includes(asset.status ?? ''))).toBe(true);
    expect(manifest.assets.filter(asset => asset.idle)).toHaveLength(12);
    expect(manifest.assets.filter(asset => asset.monster)).toHaveLength(5);
    expect(manifest.assets.find(asset => asset.id === 'mon_clock')?.slots).toEqual({countdown_slot:[160,140,64]});
    expect(manifest.assets.find(asset => asset.id === 'ui_hp_frame')?.inner).toEqual([8,8,8,8]);
  });
  it('宝石占位有各不相同的待机周期，静止版保留完整原画', () => {
    const periods = new Set<string>();
    for (const {definition, svg} of assets.filter(asset => /^gem_(red|green|blue)_/.test(asset.definition.id))) {
      expect(svg).toContain('class="idle-spark"');
      periods.add(svg.match(/animation:svg-[\w-]+-idle (\d+)ms/)![1]);
      const frozen = staticArtSvg(svg);
      expect(frozen).toContain('<style>*{animation:none!important;transition:none!important}</style>');
      expect(frozen.replace('<style>*{animation:none!important;transition:none!important}</style>', '')).toBe(svg);
      expect(frozen).toContain(`class="svg-${definition.id}"`);
    }
    expect(periods.size).toBe(9);
  });
  it('静止版样式紧跟根 svg，支持 XML 声明和多行根标签', () => {
    const source = '<?xml version="1.0"?><svg\n xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2 2"><g/></svg>';
    expect(staticArtSvg(source)).toBe(source.replace('><g/>', '><style>*{animation:none!important;transition:none!important}</style><g/>'));
  });
  it('动态/静止 img 选择不改变原数据，非 idle 直接复用原 URL', () => {
    vi.stubGlobal('document', {createElement: () => ({dataset:{}})});
    const store = new ArtStore(manifest,assets);
    expect(store.createImage('gem_red_rough').src).toBe('blob:gem_red_rough');
    expect(store.createImage('gem_red_rough', {static:true}).src).toBe('blob:gem_red_rough-static');
    expect((store.create('gem_red_rough', {static:true}) as HTMLImageElement).src).toBe('blob:gem_red_rough-static');
    expect(store.createImage('card_frame', {static:true}).src).toBe('blob:card_frame');
    expect(store.get('gem_red_rough').url).toBe('blob:gem_red_rough');
    expect(() => store.createImage('mon_chest')).toThrow('inline');
  });
  it('inline 静止样式仅匹配当前实例，不会暂停同素材的其他实例', () => {
    vi.stubGlobal('DOMParser', class {
      parseFromString() {
        return {documentElement:Object.assign(fakeSvg('card_art_hammer'), {classList:{add:vi.fn()},prepend:vi.fn()})};
      }
    });
    vi.stubGlobal('document', {
      importNode:(element: SVGSVGElement) => element,
      createElementNS:() => ({textContent:''}),
    });
    const store = new ArtStore(manifest,assets);
    const frozen = store.create('card_art_hammer',{static:true}) as SVGSVGElement;
    const moving = store.create('card_art_hammer') as SVGSVGElement;
    const style = vi.mocked(frozen.prepend).mock.calls[0][0] as HTMLStyleElement;
    expect(style.textContent).toContain(`svg[data-art-prefix="${frozen.dataset.artPrefix}"]`);
    expect(style.textContent).not.toContain(moving.dataset.artPrefix);
    expect(style.textContent).toContain('animation:none!important');
    expect(moving.prepend).not.toHaveBeenCalled();
  });
  it('加载时 idle 分配第二个 Blob URL，释放两种 URL，不重复释放', async () => {
    const fetcher = vi.fn(async (url: RequestInfo | URL) => String(url).endsWith('art-manifest.json')
      ? new Response(JSON.stringify(manifest),{status:200}) : new Response('',{status:404}));
    const create = vi.spyOn(URL,'createObjectURL');
    const revoke = vi.spyOn(URL,'revokeObjectURL');
    const store = await loadArtAssets({fetcher:fetcher as typeof fetch});
    expect(create).toHaveBeenCalledTimes(101);
    for (const asset of store.assets.values()) {
      if (asset.definition.idle) {
        expect(asset.staticUrl).toBeTruthy();
        expect(asset.staticUrl).not.toBe(asset.url);
        const response = await fetch(asset.staticUrl!);
        expect(await response.text()).toContain('*{animation:none!important;transition:none!important}');
      } else expect(asset.staticUrl).toBeUndefined();
    }
    store.dispose();
    expect(revoke).toHaveBeenCalledTimes(101);
    expect(new Set(revoke.mock.calls.map(call => call[0])).size).toBe(101);
    store.dispose();
    expect(revoke).toHaveBeenCalledTimes(101);
  });
  it('镜面占位支持 currentColor，额外框保留透明原画窗', () => {
    expect(assets.find(asset => asset.definition.id === 'card_art_mirror')!.svg).toContain('fill="currentColor"');
    const frame = assets.find(asset => asset.definition.id === 'card_frame_tool')!.svg;
    expect(frame).toContain('fill-rule="evenodd"');
    expect(frame).toContain(`stroke="${manifest.palette.textDim}"`);
  });
  it('老钟 slot 在会动画的表盘内，所有怪部件 ID 唯一', () => {
    const clock = assets.find(asset => asset.definition.id === 'mon_clock')!.svg;
    expect(clock).toMatch(/<g id="dial"><circle[^>]+\/><g id="countdown_slot"><\/g>/);
    for (const asset of assets.filter(asset => asset.definition.monster)) {
      const ids = [...asset.svg.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
      expect(new Set(ids).size).toBe(ids.length);
      for (const part of asset.definition.parts ?? []) expect(asset.svg).toContain(`<g id="${part}">`);
    }
  });
});

describe('持久事件和文字槽', () => {
  it('daze 持续挂载；hit/hit_big 播完恢复 daze，实例相互隔离', () => {
    vi.useFakeTimers();
    const store = new ArtStore(manifest,assets);
    const monster = fakeSvg('mon_chest');
    const other = fakeSvg('mon_chest');
    expect(store.play(monster,'daze')).toBe(600);
    vi.advanceTimersByTime(10000);
    expect(monster.getAttribute('data-anim')).toBe('daze');
    expect(store.getStay(monster)).toBe('daze');
    expect(store.getStay(other)).toBeNull();
    store.play(monster,'hit');
    vi.advanceTimersByTime(300);
    store.play(monster,'hit_big');
    vi.advanceTimersByTime(100);
    expect(monster.getAttribute('data-anim')).toBe('hit_big');
    vi.advanceTimersByTime(600);
    expect(monster.getAttribute('data-anim')).toBe('daze');
  });
  it('warn 切换可在 tick 中清掉，不打断 tick 也不再恢复 warn', () => {
    vi.useFakeTimers();
    const store = new ArtStore(manifest,assets);
    const countdown = fakeSvg('ui_countdown');
    store.setStay(countdown,'warn');
    store.play(countdown,'tick');
    vi.advanceTimersByTime(500);
    expect(countdown.getAttribute('data-anim')).toBe('warn');
    store.play(countdown,'tick');
    store.setStay(countdown,null);
    expect(countdown.getAttribute('data-anim')).toBe('tick');
    vi.advanceTimersByTime(500);
    expect(countdown.getAttribute('data-anim')).toBeNull();
    expect(store.getStay(countdown)).toBeNull();
    expect(() => store.setStay(countdown,'tick')).toThrow('没有持久事件');
  });
  it('重复 setStay 不重启，open 持续保持，stop 取消恢复定时器', () => {
    vi.useFakeTimers();
    const store = new ArtStore(manifest,assets);
    const chest = fakeSvg('loot_chest');
    store.setStay(chest,'open');
    store.setStay(chest,'open');
    expect(chest.getBoundingClientRect).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(10000);
    expect(chest.getAttribute('data-anim')).toBe('open');
    store.play(chest,'drop');
    store.stop(chest);
    vi.runAllTimers();
    expect(chest.getAttribute('data-anim')).toBeNull();
    expect(store.getStay(chest)).toBeNull();
  });
  it('setSlotText 只按当前实例前缀找槽、复用文字并使用 textContent', () => {
    const store = new ArtStore(manifest,assets);
    const attrs = new Map<string,string>();
    const text = {dataset:{}, textContent:'', setAttribute:(key:string,value:string) => attrs.set(key,value)};
    let inserted = false;
    const append = vi.fn(() => { inserted = true; });
    const slot = {id:'i123-countdown_slot',localName:'g',querySelector:() => inserted ? text : null,append};
    const otherSlot = {id:'i456-countdown_slot',localName:'g',querySelector:vi.fn(),append:vi.fn()};
    const svg = {dataset:{artId:'mon_clock',artPrefix:'i123'},querySelectorAll:() => [otherSlot,slot]} as unknown as SVGSVGElement;
    vi.stubGlobal('document', {createElementNS:vi.fn(() => text)});
    expect(store.setSlotText(svg,'countdown_slot',3)).toBe(text);
    expect(attrs.get('x')).toBe('160');
    expect(attrs.get('y')).toBe('140');
    expect(attrs.get('font-size')).toBe('64');
    expect(attrs.get('text-anchor')).toBe('middle');
    expect(attrs.get('dominant-baseline')).toBe('central');
    expect(attrs.get('fill')).toBe(manifest.palette.ink);
    expect(text.textContent).toBe('3');
    store.setSlotText(svg,'countdown_slot','<script>');
    expect(text.textContent).toBe('<script>');
    expect(append).toHaveBeenCalledTimes(1);
    expect(otherSlot.append).not.toHaveBeenCalled();
    expect(() => store.setSlotText(svg,'unknown',1)).toThrow('没有文字槽');
  });
});
