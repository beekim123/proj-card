import { afterEach, describe, expect, it, vi } from 'vitest';
import manifestJson from '../../public/art-manifest.json';
import { generatePlaceholder } from './placeholders';
import { matchesAssetFilter } from './filters';
import { ArtStore, staticArtSvg } from './store';
import type { ArtManifest, LoadedAsset } from './types';

const manifest = manifestJson as unknown as ArtManifest;
const assets: LoadedAsset[] = manifest.assets.map(definition => ({definition,source:'placeholder',svg:generatePlaceholder(definition,manifest),url:`blob:${definition.id}`}));
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('本体第一批素材契约', () => {
  it('清单为 v4 / 89 个，14 个新增占位，旧第二批 16 个不变', () => {
    expect(manifest.version).toBe(4);
    expect(manifest.assets).toHaveLength(89);
    expect(manifest.assets.filter(a => a.batch)).toHaveLength(14);
    expect(manifest.assets.filter(a => a.v2 === '第2批')).toHaveLength(16);
    expect(new Set(manifest.assets.map(a => a.id)).size).toBe(89);
    for (const batch of ['本体第1批','本体第2批']) expect(manifest.assets.filter(a => matchesAssetFilter(a,false,batch))).toHaveLength(7);
  });
  it.each([
    ['ui_reward_card','牌'],['ui_reward_shop','坊'],['ui_reward_heal','心'],['ui_node_door','门'],
    ['card_art_hourglass','沙漏'],['card_art_seal','封条'],['card_art_shadow','影子'],['card_art_whistle','哨子'],
    ['relic_start2','倍率'],['relic_slow','慢一'],['relic_first2','开打'],['relic_twice','头一'],
  ])('%s 占位显示 %s', (id,label) => {
    expect(assets.find(a => a.definition.id === id)!.svg).toContain(`>${label}</text>`);
  });
  it('门扇绕左侧横向缩到 12%，600ms 后停住', () => {
    const door = assets.find(a => a.definition.id === 'ui_door')!;
    expect(door.definition.anchor).toEqual([160,480]);
    expect(door.definition.stay).toEqual(['open']);
    expect(door.svg).toContain('transform-origin:32px 480px');
    expect(door.svg).toContain('600ms ease-in-out forwards');
    expect(door.svg).toContain('transform:scaleX(.12)');
    for (const part of ['root','frame','dark','leaf']) expect(door.svg).toContain(`id="${part}"`);
  });
  it('门 open 保持，未知事件安全忽略', () => {
    vi.useFakeTimers();
    const attrs = new Map<string,string>();
    const door = {dataset:{artId:'ui_door'},setAttribute:(k:string,v:string)=>attrs.set(k,v),removeAttribute:(k:string)=>attrs.delete(k),getAttribute:(k:string)=>attrs.get(k)??null,getBoundingClientRect:vi.fn()} as unknown as SVGSVGElement;
    const store = new ArtStore(manifest,assets);
    expect(store.play(door,'open')).toBe(600);
    vi.advanceTimersByTime(9000);
    expect(door.getAttribute('data-anim')).toBe('open');
    expect(store.play(door,'does_not_exist')).toBe(0);
    store.stop(door); expect(door.getAttribute('data-anim')).toBeNull(); store.dispose();
  });
  it('门环环可上下说话，提供静止版本', () => {
    const knocker = assets.find(a => a.definition.id === 'npc_knocker')!;
    expect(knocker.definition.idle).toBe(true);
    expect(knocker.svg).toContain('1200ms'); expect(knocker.svg).toContain('translateY(-12px)');
    expect(staticArtSvg(knocker.svg)).toContain('animation:none!important');
  });
  it('奖励牌子长标题降至 24 号，短标题保留 30 号', () => {
    const attrs = new Map<string,string>();
    const text = {dataset:{},setAttribute:(k:string,v:string)=>attrs.set(k,v),textContent:''};
    const slot = {id:'test-rule_text',localName:'g',querySelector:()=>text};
    const sign = {dataset:{artId:'ui_rule_sign',artPrefix:'test'},querySelectorAll:()=>[slot]} as unknown as SVGSVGElement;
    const store = new ArtStore(manifest,assets);
    store.setSlotText(sign,'rule_text','回一颗心'); expect(attrs.get('font-size')).toBe('24');
    store.setSlotText(sign,'rule_text','额外牌'); expect(attrs.get('font-size')).toBe('30'); store.dispose();
  });
});
