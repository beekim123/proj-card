import { afterEach, describe, expect, it, vi } from 'vitest';
import manifestJson from '../../public/art-manifest.json';
import currentChestSvg from '../../public/art/mon_chest.svg?raw';
import { generatePlaceholder } from './placeholders';
import { matchesAssetFilter } from './filters';
import { ArtStore } from './store';
import type { ArtManifest, LoadedAsset } from './types';

const manifest = manifestJson as unknown as ArtManifest;
const assets: LoadedAsset[] = manifest.assets.map(definition => ({
  definition, source:'placeholder', svg:generatePlaceholder(definition,manifest), url:`blob:${definition.id}`,
}));
const fakeSvg = (id: string): SVGSVGElement => {
  const attrs = new Map<string,string>();
  return {
    dataset:{artId:id},
    setAttribute:(key:string,value:string) => attrs.set(key,value),
    removeAttribute:(key:string) => attrs.delete(key),
    getAttribute:(key:string) => attrs.get(key) ?? null,
    getBoundingClientRect:vi.fn(),
  } as unknown as SVGSVGElement;
};
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('第二版素材契约', () => {
  it('v4 保留旧素材并扩展至 89 项与 3 / 16 项第二版批次', () => {
    expect(manifest.version).toBe(4);
    expect(manifest.assets).toHaveLength(89);
    expect(manifest.assets.filter(asset => asset.v2 === '第1批').map(asset => asset.id)).toEqual(['mon_chest','card_art_bag','card_art_stone']);
    expect(manifest.assets.filter(asset => asset.v2 === '第2批')).toHaveLength(16);
    expect(manifest.assets.filter(asset => asset.status === '返修')).toHaveLength(5);
  });
  it.each([
    ['rule_bite','咬'],['rule_hug','抱'],['rule_wind','上'],['rule_bell','敲'],
    ['relic_same','同色'],['relic_once','断一'],['relic_white','凑白'],
    ['relic_rainbow','五色'],['relic_heart','多一'],['relic_grow','宝石'],
  ])('%s 占位显示约定的中文名 %s', (id,label) => {
    const asset = assets.find(asset => asset.definition.id === id)!;
    expect(asset.definition.load).toBe('img');
    expect(asset.svg).toContain(`>${label}</text>`);
  });
  it('规矩文字和图标空槽属于会翻面的板子，彩虹为 currentColor 圆槽', () => {
    const sign = assets.find(asset => asset.definition.id === 'ui_rule_sign')!;
    expect(sign.definition.slots).toEqual({rule_text:[140,52,30]});
    expect(sign.svg).toMatch(/<g id="board">[\s\S]*<g id="icon_slot"><\/g><g id="rule_text"><\/g><\/g>/);
    const rainbow = assets.find(asset => asset.definition.id === 'ui_rainbow_slot')!;
    expect(rainbow.definition.stay).toEqual(['light']);
    expect(rainbow.svg).toContain('<circle cx="24" cy="24" r="17" fill="currentColor"/>');
    expect(rainbow.svg).toContain('300ms ease-out forwards');
  });
  it.each([
    ['mon_chest','bite',300],['mon_soldier','unwind',300],
    ['mon_soldier','wound_down',600],['mon_clock','ring',400],['mon_dragon','layer',800],
  ] as const)('%s 占位的新事件 %s 为 %dms', (id,event,duration) => {
    const asset = assets.find(asset => asset.definition.id === id)!;
    expect(asset.definition.events?.[event]).toBe(duration);
    expect(asset.svg).toContain(`[data-anim="${event}"]`);
    expect(asset.svg).toContain(`${duration}ms`);
  });
  it('已有真宝箱图缺 bite 仍按清单的 300ms 完成，不依赖 animationend', () => {
    vi.useFakeTimers();
    // 新宝箱图已带 bite；这里去掉它，模拟缺事件的旧图
    const chestWithoutBite = currentChestSvg.replace(/data-anim\s*=\s*(["'])bite\1/g,'data-anim=$1_none$1');
    expect(chestWithoutBite).not.toMatch(/data-anim\s*=\s*["']bite["']/);
    const existing = assets.map(asset => asset.definition.id === 'mon_chest'
      ? {...asset,source:'art' as const,svg:chestWithoutBite} : asset);
    const store = new ArtStore(manifest,existing);
    const chest = fakeSvg('mon_chest');
    expect(() => store.play(chest,'bite')).not.toThrow();
    vi.advanceTimersByTime(299);
    expect(chest.getAttribute('data-anim')).toBe('bite');
    vi.advanceTimersByTime(1);
    expect(chest.getAttribute('data-anim')).toBeNull();
    expect(store.play(chest,'bite')).toBe(300);
    store.dispose();
  });
  it('顿帧和慢放造成有限动画未结束时保留事件尾部，不等待无限待机', async () => {
    vi.useFakeTimers();
    const store = new ArtStore(manifest,assets);
    const chest = fakeSvg('mon_chest');
    let finish!: () => void;
    const done = new Promise<void>(resolve => { finish = resolve; });
    chest.getAnimations = () => [
      {playState:'paused',effect:{getComputedTiming:() => ({endTime:400})},finished:done},
      {playState:'running',effect:{getComputedTiming:() => ({endTime:Infinity})},finished:new Promise(() => {})},
    ] as unknown as Animation[];
    store.play(chest,'hit'); vi.advanceTimersByTime(400);
    expect(chest.getAttribute('data-anim')).toBe('hit');
    finish(); await vi.runAllTimersAsync();
    expect(chest.getAttribute('data-anim')).toBeNull();
    store.dispose();
  });
  it('等待有限动画时新事件抢占，旧动画完成不能清除新事件', async () => {
    vi.useFakeTimers();
    const store = new ArtStore(manifest,assets); const chest = fakeSvg('mon_chest');
    let finish!: () => void;
    const done = new Promise<void>(resolve => { finish = resolve; });
    chest.getAnimations = () => [{playState:'paused',effect:{getComputedTiming:() => ({endTime:400})},finished:done}] as unknown as Animation[];
    store.play(chest,'hit'); vi.advanceTimersByTime(400);
    store.play(chest,'bite'); finish();
    await Promise.resolve(); await Promise.resolve();
    expect(chest.getAttribute('data-anim')).toBe('bite');
    chest.getAnimations = () => [];
    await vi.advanceTimersByTimeAsync(300);
    expect(chest.getAttribute('data-anim')).toBeNull();
    store.dispose();
  });
  it('wound_down 保持到清除，彩虹 light 保持，out 后回到空槽', () => {
    vi.useFakeTimers();
    const store = new ArtStore(manifest,assets);
    const soldier = fakeSvg('mon_soldier'); const slot = fakeSvg('ui_rainbow_slot');
    store.setStay(soldier,'wound_down'); store.setStay(slot,'light');
    vi.advanceTimersByTime(10000);
    expect(soldier.getAttribute('data-anim')).toBe('wound_down');
    expect(slot.getAttribute('data-anim')).toBe('light');
    store.play(soldier,'hit'); vi.advanceTimersByTime(400);
    expect(soldier.getAttribute('data-anim')).toBe('wound_down');
    store.setStay(soldier,null); expect(soldier.getAttribute('data-anim')).toBeNull();
    store.setStay(slot,null); expect(store.play(slot,'out')).toBe(300);
    vi.advanceTimersByTime(300);
    expect(slot.getAttribute('data-anim')).toBeNull(); expect(store.getStay(slot)).toBeNull();
    store.dispose();
  });
  it('批次筛选与返修/重画/新画组合，全部可恢复 89 项', () => {
    const matching = (changed:boolean,batch:string) => manifest.assets.filter(asset => matchesAssetFilter(asset,changed,batch));
    expect(matching(false,'all')).toHaveLength(89);
    expect(matching(false,'第1批')).toHaveLength(3);
    expect(matching(false,'第2批')).toHaveLength(16);
    expect(matching(true,'all')).toHaveLength(33);
    expect(matching(true,'第1批')).toHaveLength(3);
    expect(matching(true,'第2批')).toHaveLength(16);
    expect(matching(false,'all')).toHaveLength(89);
  });
  it('图标只写当前实例槽，复用 image，引用当前已加载图标', () => {
    const store = new ArtStore(manifest,assets);
    const attrs = new Map<string,string>();
    const image = {dataset:{},setAttribute:(key:string,value:string) => attrs.set(key,value)};
    let inserted = false;
    const append = vi.fn(() => { inserted = true; });
    const slot = {id:'i123-icon_slot',localName:'g',querySelector:() => inserted ? image : null,append};
    const other = {id:'i456-icon_slot',localName:'g',querySelector:vi.fn(),append:vi.fn()};
    const sign = {dataset:{artId:'ui_rule_sign',artPrefix:'i123'},querySelectorAll:() => [other,slot]} as unknown as SVGSVGElement;
    vi.stubGlobal('document',{createElementNS:vi.fn(() => image)});
    expect(store.setSlotIcon(sign,'icon_slot','rule_bite')).toBe(image);
    expect(Object.fromEntries(attrs)).toMatchObject({x:'20',y:'16',width:'56',height:'56',href:'blob:rule_bite'});
    store.setSlotIcon(sign,'icon_slot','rule_bell');
    expect(attrs.get('href')).toBe('blob:rule_bell');
    expect(append).toHaveBeenCalledTimes(1); expect(other.append).not.toHaveBeenCalled();
    expect(() => store.setSlotIcon(sign,'missing','rule_bite')).toThrow('没有图标槽');
    expect(() => store.setSlotIcon(sign,'icon_slot','mon_chest')).toThrow('不是静态图标');
    store.dispose();
  });
});
