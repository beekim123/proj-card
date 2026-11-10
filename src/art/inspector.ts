import { createCard, playCardArt } from '../ui/card';
import { CONFIG, TOOLS, TOOL_TYPES } from '../rules/config';
import { portrait } from '../layout/portrait';
import { landscape } from '../layout/landscape';
import { dimensions } from './types';
import type { ArtDefinition } from './types';
import type { ArtStore } from './store';
import './inspector.css';
import { matchesAssetFilter } from './filters';


const element = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
function action(label: string, handler: () => void): HTMLButtonElement {
  const button = element('button', 'art-action', label);
  button.type = 'button';
  button.addEventListener('click', handler);
  return button;
}
function samples(definition: ArtDefinition): [number, number, number][] {
  if (definition.id === 'table_cloth') return [[1032,330,72],[1248,330,72],[300,300,72]];
  if (definition.id === 'ui_panel') return [[1008,100,24],[600,320,48],[300,300,48]];
  if (definition.id === 'ui_hp_frame') return [[440,40,portrait.hpBorder],[400,40,landscape.hpBorder],[620,48,portrait.hpBorder]];
  return [[300,100,32],[520,120,32],[192,96,32]];
}
function cross(stage: HTMLElement, point: [number,number], scale: number, label: string): void {
  const marker = element('span', `art-cross art-cross-${label}`);
  marker.style.left = `${point[0]*scale}px`;
  marker.style.top = `${point[1]*scale}px`;
  marker.title = `${label} (${point.join(', ')})`;
  marker.append(element('span', undefined, label));
  stage.append(marker);
}

function assetItem(store: ArtStore, definition: ArtDefinition): HTMLElement {
  const { palette } = store.manifest;
  const loaded = store.get(definition.id);
  const item = element('article', `art-item${definition.nineSlice || definition.monster ? ' art-item-wide' : ''}`);
  item.dataset.assetId = definition.id;
  item.dataset.status = definition.status ?? '已有';
  item.dataset.v2 = definition.v2 ?? '';
  const title = element('div', 'art-item-title');
  const badges = element('div', 'art-badges');
  const source = element('span', `art-source art-source-${loaded.source}`, loaded.source === 'art' ? '美术' : '占位');
  source.dataset.source = loaded.source;
  badges.append(element('span', `art-status art-status-${definition.status ?? '已有'}`, definition.status ?? '已有'), source);
  if (definition.v2) badges.append(element('span','art-batch',`第二版 · ${definition.v2}`));
  title.append(element('h3', undefined, definition.id), badges);
  item.append(title, element('p', 'art-meta', `viewBox="${definition.viewBox}" · ${definition.load}${definition.tint ? ' · currentColor' : ''}${definition.idle ? ' · idle' : ''}`));
  const [width,height] = dimensions(definition);
  const previews = element('div', 'art-previews');
  const artworks: (HTMLImageElement | SVGSVGElement)[] = [];
  const createPreview = (label: string, scale = 1, isStatic = false, color = palette.gem.red.mid) => {
    const figure = element('figure', 'art-variant');
    if (label) figure.append(element('figcaption', 'art-meta', label));
    const scroll = element('div', 'art-scroll');
    const stage = element('div', 'art-preview');
    stage.dataset.variant = isStatic ? 'static' : 'animated';
    stage.style.width = `${width*scale}px`;
    stage.style.height = `${height*scale}px`;
    const artwork = store.create(definition.id, { static:isStatic });
    artwork.classList.add('art-actual');
    artwork.style.width = `${width*scale}px`;
    artwork.style.height = `${height*scale}px`;
    if (definition.tint) artwork.style.color = color;
    if (definition.id === 'ui_rule_sign') {
      store.setSlotText(artwork as SVGSVGElement,'rule_text','咬手');
      store.setSlotIcon(artwork as SVGSVGElement,'icon_slot','rule_bite');
    }
    stage.append(artwork);
    if (definition.monster) {
      if (definition.anchor) cross(stage,definition.anchor,scale,'anchor');
      if (definition.hitPoint) cross(stage,definition.hitPoint,scale,'hitPoint');
      for (const slot of Object.keys(definition.slots ?? {})) store.setSlotText(artwork as SVGSVGElement,slot,3);
    }
    scroll.append(stage);
    figure.append(scroll);
    previews.append(figure);
    artworks.push(artwork);
    return stage;
  };
  const rainbowColors = [['红','1'],['黄','3'],['绿','2'],['青','6'],['蓝','4'],['品红','5']] as const;
  const stage = createPreview(definition.id === 'ui_rainbow_slot' ? '红 · 1 倍' : definition.idle ? '会动 · 1 倍' : '原始尺寸 · 1 倍');
  if (definition.id === 'ui_rainbow_slot') {
    previews.classList.add('art-rainbow-previews');
    for (const [label,key] of rainbowColors.slice(1)) createPreview(`${label} · 1 倍`,1,false,palette.mix[key]!);
    artworks.forEach(artwork => store.setStay(artwork as SVGSVGElement,'light'));
  }
  if (definition.idle) createPreview('静止 · 1 倍',1,true);
  if (definition.monster) {
    const variants = [
      ['竖屏小怪 / 精英',portrait.monsterScale.normal],
      ['横屏小怪 / 精英',landscape.monsterScale.normal],
      ['竖屏首领',portrait.monsterScale.boss],
      ['横屏首领',landscape.monsterScale.boss],
    ] as const;
    for (const [label,scale] of variants) createPreview(`${label} · ${scale} 倍`,scale);
  }
  item.append(previews, element('p', 'art-description', definition.desc));
  if (definition.anchor) item.append(element('p', 'art-meta', `对齐点：${definition.anchor.join(', ')}（1 倍）${definition.hitPoint ? ` · 打击点：${definition.hitPoint.join(', ')}` : ''}`));
  if (loaded.error && loaded.error !== '未交付 SVG') item.append(element('p', 'art-warning', `已回退占位：${loaded.error}`));
  if (definition.events) {
    const events = element('div', 'art-controls');
    let tint = palette.gem.red.mid;
    if (definition.tint && definition.id !== 'ui_rainbow_slot') {
      const label = element('label', 'art-tint', '染色 ');
      const select = element('select');
      select.setAttribute('aria-label',`${definition.id} 染色`);
      const colors = [['红',palette.gem.red.mid],['绿',palette.gem.green.mid],['蓝',palette.gem.blue.mid],['白',palette.mix['7']!],['空托',palette.text]];
      for (const [name,color] of colors) { const option = element('option', undefined, name); option.value = color; select.append(option); }
      select.addEventListener('change', () => { tint = select.value; artworks.forEach(art => art.style.color = tint); });
      label.append(select); events.append(label);
    }
    for (const [name,duration] of Object.entries(definition.events)) {
      const stay = definition.stay?.includes(name);
      const button = action(`${name} · ${duration}ms${stay ? ' · 开关' : ''}`, () => {
        if (definition.id.startsWith('fx_')) store.effect(definition.id, stage, width/2, height/2, tint);
        else if (stay) {
          const enabled = button.getAttribute('aria-pressed') !== 'true';
          artworks.forEach(art => store.setStay(art as SVGSVGElement, enabled ? name : null));
          button.setAttribute('aria-pressed',String(enabled));
        } else {
          if (definition.id === 'ui_rainbow_slot' && name === 'out') {
            artworks.forEach(art => store.setStay(art as SVGSVGElement,null));
            events.querySelectorAll('[aria-pressed]').forEach(control => control.setAttribute('aria-pressed','false'));
          }
          artworks.forEach(art => store.play(art as SVGSVGElement,name));
        }
        events.querySelectorAll<HTMLButtonElement>('[data-event][aria-pressed]').forEach(control => {
          control.setAttribute('aria-pressed',String(artworks.every(art => store.getStay(art as SVGSVGElement) === control.dataset.event)));
        });
      });
      button.dataset.event = name;
      if (stay) button.setAttribute('aria-pressed',String(artworks.every(art => store.getStay(art as SVGSVGElement) === name)));
      events.append(button);
    }
    if (definition.stay?.length) events.append(action('回到待机', () => {
      artworks.forEach(art => store.stop(art as SVGSVGElement));
      events.querySelectorAll('[aria-pressed]').forEach(button => button.setAttribute('aria-pressed','false'));
    }));
    if (definition.id === 'fx_hit') events.append(action('同时播放两个实例', () => {
      store.effect(definition.id, stage, width*.35, height/2, palette.gem.red.mid);
      store.effect(definition.id, stage, width*.65, height/2, palette.gem.blue.mid);
    }));
    item.append(events);
  }
  if (definition.slots?.countdown_slot) {
    const controls = element('div','art-controls art-slot-controls');
    controls.append(element('span',undefined,'表盘倒计时'));
    for (const value of [1,2,3]) {
      const button = action(String(value), () => {
        for (const artwork of artworks) {
          for (const slot of Object.keys(definition.slots!)) store.setSlotText(artwork as SVGSVGElement,slot,value);
          if (definition.events?.tick) store.play(artwork as SVGSVGElement,'tick');
        }
        controls.querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed',String(button.textContent === String(value))));
      });
      button.setAttribute('aria-label',`倒计时 ${value}`);
      button.setAttribute('aria-pressed',String(value === 3));
      controls.append(button);
    }
    item.append(controls);
  }
  if (definition.id === 'ui_rule_sign') {
    item.append(element('p','art-meta','rule_text：咬手 · (140, 52) · 30 号；icon_slot：rule_bite · (20, 16) · 56 × 56。'));
  }
  if (definition.nineSlice) {
    item.append(element('p', 'art-meta', `九宫格切线：[${definition.nineSlice.join(', ')}]；下方三种尺寸均按实际像素显示。`));
    for (const [w,h,border] of samples(definition)) {
      const sample = element('figure', 'art-slice-sample');
      sample.append(element('figcaption', 'art-meta', `${w} × ${h} · 边宽 ${border}`));
      const viewport = element('div', 'art-scroll');
      const frame = element('div', 'art-slice');
      frame.style.width = `${w}px`; frame.style.height = `${h}px`;
      store.nineSlice(frame, definition.id, border);
      viewport.append(frame); sample.append(viewport); item.append(sample);
    }
  }
  return item;
}

function baseCards(store: ArtStore): HTMLElement {
  const section = element('section', 'art-group art-composed-cards');
  section.id = 'base-cards';
  section.append(element('h2', undefined, '八种牌 · 完整拼装'));
  const controls = element('div', 'art-controls');
  const label = element('label', undefined, '宝石形态 ');
  const select = element('select');
  select.setAttribute('aria-label','基础牌宝石形态');
  const forms: { name: string; growth: [number,number,number] }[] = [
    { name:'全部原石', growth:[0,0,0] },
    { name:'全部切好', growth:[CONFIG.formAt[1],CONFIG.formAt[1],CONFIG.formAt[1]] },
    { name:'全部闪光', growth:[CONFIG.formAt[2],CONFIG.formAt[2],CONFIG.formAt[2]] },
    { name:'红切好 / 绿原石 / 蓝闪光', growth:[CONFIG.formAt[1],0,CONFIG.formAt[2]] },
  ];
  forms.forEach((form,index) => { const option = element('option', undefined, form.name); option.value = String(index); select.append(option); });
  label.append(select); controls.append(label);
  section.append(controls, element('p', 'art-explainer', '每种形态同时显示 0.75 / 1.4 / 2 倍。切换后所有牌上的同一颗宝石同步变化。'));
  const cardArea = element('div');
  const renderCards = () => {
    cardArea.replaceChildren();
    const form = forms[Number(select.value)];
    const [cardWidth,cardHeight] = store.manifest.cardLayout.size;
    for (const scale of [.75,1.4,2]) {
      cardArea.append(element('h3', 'art-scale-title', `${scale} 倍 · ${cardWidth*scale} × ${cardHeight*scale}`));
      const cards = element('div', 'art-cards');
      for (const mask of [1,2,4,3,6,5,7,0]) {
        const card = createCard(store, mask, form.growth, true);
        const frame = element('div', 'art-card-frame');
        frame.style.width = `${cardWidth*scale}px`; frame.style.height = `${cardHeight*scale}px`;
        card.style.transform = `scale(${scale})`; card.style.transformOrigin = 'top left';
        frame.append(card); cards.append(frame);
      }
      cardArea.append(cards);
    }
  };
  select.addEventListener('change', renderCards); renderCards();
  section.append(cardArea);
  return section;
}

function toolCards(store: ArtStore): HTMLElement {
  const section = element('section','art-group art-tool-cards');
  section.id = 'tool-cards';
  section.append(element('h2',undefined,'五种额外牌 · 手牌与桌面'), element('p','art-explainer','左边手牌保持待机，右边桌面暂停；播放后会重新暂停。镜子手中显示 ?，桌面按实际宝石位显示底数与镜面颜色。'));
  const label = element('label','art-tint','镜子在桌上变成 ');
  const select = element('select'); select.setAttribute('aria-label','桌面镜子的宝石');
  for (const [mask,name] of [[0,'没宝石'],[1,'红'],[2,'绿'],[4,'蓝'],[3,'黄'],[6,'青'],[5,'品红'],[7,'白']] as const) {
    const option = element('option',undefined,name); option.value = String(mask); select.append(option);
  }
  select.value = '6'; label.append(select); section.append(label);
  const grid = element('div','art-tool-grid');
  const render = () => {
    grid.replaceChildren();
    for (const [index,type] of TOOL_TYPES.entries()) {
      const group = element('article','art-tool-pair'); group.dataset.tool = type;
      group.append(element('h3',undefined,TOOLS[type].name));
      const pair = element('div','art-cards');
      const hand = createCard(store,{ id:100+index,v:TOOLS[type].v,type });
      const row = createCard(store,{ id:200+index,v:type === 'mirror' ? Number(select.value) : TOOLS[type].v,type },[0,0,0],true,{ static:true,resolved:true });
      for (const [title,card] of [['在手里 · 会动',hand],['在桌上 · 暂停',row]] as const) {
        const figure = element('figure','art-tool-variant'); figure.append(element('figcaption','art-meta',title),card); pair.append(figure);
      }
      group.append(pair,action('播放 play · 600ms', () => { playCardArt(hand); playCardArt(row); }));
      grid.append(group);
    }
  };
  select.addEventListener('change',render); render(); section.append(grid);
  return section;
}

function composedUi(store: ArtStore): HTMLElement {
  const { palette } = store.manifest;
  const section = element('section','art-group art-composed-ui'); section.id = 'composed-ui';
  section.append(element('h2',undefined,'场景组合 · 牌背、横幅、血条、心'));
  const grid = element('div','art-grid');
  const backs = element('article','art-item'); backs.append(element('h3',undefined,'牌背'));
  const backVariants = element('div','art-cards');
  for (const isStatic of [false,true]) {
    const figure = element('figure','art-variant'); figure.append(element('figcaption','art-meta',isStatic ? '静止' : '会动'),store.createImage('card_back',{static:isStatic})); backVariants.append(figure);
  }
  backs.append(backVariants); grid.append(backs);
  const bannerItem = element('article','art-item art-item-wide'); bannerItem.append(element('h3',undefined,'横幅 · 600 × 140'));
  const scroll = element('div','art-scroll'); const banner = element('div','art-banner');
  const bannerArt = store.createImage('ui_banner'); bannerArt.style.width = '600px'; bannerArt.style.height = '140px';
  banner.append(bannerArt,element('span',undefined,'战利品')); scroll.append(banner); bannerItem.append(scroll); grid.append(bannerItem);
  const hpItem = element('article','art-item art-item-wide'); hpItem.append(element('h3',undefined,'血条 · 440 × 40'));
  const inner = store.get('ui_hp_frame').definition.inner ?? [8,8,8,8];
  for (const percentage of [100,37,0]) {
    const sample = element('figure','art-slice-sample'); sample.append(element('figcaption','art-meta',`${percentage}%`));
    const viewport = element('div','art-scroll'); const hp = element('div','art-hp'); hp.dataset.hp = String(percentage);
    store.nineSlice(hp,'ui_hp_frame',portrait.hpBorder);
    const track = element('div','art-hp-track'); Object.assign(track.style,{top:`${inner[0]}px`,right:`${inner[1]}px`,bottom:`${inner[2]}px`,left:`${inner[3]}px`,background:palette.barTrack});
    const chip = element('div','art-hp-chip'); const fill = element('div','art-hp-fill');
    chip.style.width = `${percentage}%`; chip.style.background = palette.hpChip;
    fill.style.width = `${percentage}%`; fill.style.background = palette.hpFill;
    track.append(chip,fill); hp.append(track,element('span','art-hp-text',`${percentage} / 100`)); viewport.append(hp); sample.append(viewport); hpItem.append(sample);
  }
  grid.append(hpItem);
  const hearts = element('article','art-item'); hearts.append(element('h3',undefined,'三颗心 · 满、满、空'));
  const heartRow = element('div','art-hearts');
  for (const id of ['ui_heart','ui_heart','ui_heart_empty']) {
    const heart = store.create(id); heart.style.width = `${portrait.hearts.size}px`; heart.style.height = `${portrait.hearts.size}px`; heartRow.append(heart);
  }
  hearts.append(heartRow); grid.append(hearts); section.append(grid);
  return section;
}

export function renderArtGallery(root: HTMLElement, store: ArtStore): void {
  root.replaceChildren(); root.className = 'art-inspector';
  Object.entries(store.manifest.palette).forEach(([key,value]) => { if (typeof value === 'string') root.style.setProperty(`--art-${key}`,value); });
  root.dataset.theme = 'dark';
  const actual = [...store.assets.values()].filter(asset => asset.source === 'art').length;
  const header = element('header','art-header'); const copy = element('div');
  copy.append(element('p','art-eyebrow','GEMCARD / ART LAB'),element('h1',undefined,'素材检查页'));
  copy.append(element('p','art-summary',`${actual} 份美术 · ${store.assets.size-actual} 份占位 · 共 ${store.assets.size} 项。素材保持实际显示尺寸，宽素材可左右滚动。`));
  const controls = element('div','art-controls');
  const theme = action('切换浅色底', () => { const light = root.dataset.theme !== 'light'; root.dataset.theme = light ? 'light' : 'dark'; theme.textContent = light ? '切换深色底' : '切换浅色底'; theme.setAttribute('aria-pressed',String(light)); });
  theme.setAttribute('aria-pressed','false');
  const back = element('a','art-action','返回游戏'); back.href = './'; controls.append(theme,back); header.append(copy,controls); root.append(header);
  root.append(element('p','art-explainer','把同名 SVG 放入 art/ 后刷新即可替换。会动 / 静止可对照；stay 按钮保持事件，挂着 daze 再点 hit 可检验恢复状态。十字标出对齐点与打击点。'));
  const toolbar = element('nav','art-controls art-navigation'); toolbar.setAttribute('aria-label','素材检查导航');
  const batchLabel = element('label','art-batch-filter','第二版批次 ');
  const batch = element('select'); batch.setAttribute('aria-label','第二版素材批次');
  for (const [value,label] of [['all','全部'],['第1批','第 1 批'],['第2批','第 2 批']]) {
    const option = element('option',undefined,label); option.value = value; batch.append(option);
  }
  const filterSummary = element('span','art-filter-summary'); filterSummary.setAttribute('aria-live','polite');
  let changedOnly = false;
  const applyFilters = () => {
    root.dataset.filter = changedOnly ? 'changed' : 'all'; root.dataset.v2 = batch.value;
    let visible = 0;
    root.querySelectorAll<HTMLElement>('.art-asset-group').forEach(group => {
      group.querySelectorAll<HTMLElement>('.art-item').forEach(item => {
        const definition = store.get(item.dataset.assetId!).definition;
        item.hidden = !matchesAssetFilter(definition,changedOnly,batch.value);
        if (!item.hidden) visible++;
      });
      group.hidden = !group.querySelector('.art-item:not([hidden])');
    });
    filterSummary.textContent = `显示 ${visible} / ${store.assets.size} 项`;
  };
  const filter = action('只看返修 / 重画 / 新画', () => {
    changedOnly = !changedOnly; filter.setAttribute('aria-pressed',String(changedOnly));
    filter.textContent = changedOnly ? '显示全部状态' : '只看返修 / 重画 / 新画';
    applyFilters();
  });
  filter.setAttribute('aria-pressed','false'); filter.dataset.action = 'filter-changed';
  batch.addEventListener('change',applyFilters); batchLabel.append(batch); toolbar.append(filter,batchLabel,filterSummary);
  for (const [target,label] of [['base-cards','基础牌拼装'],['tool-cards','额外牌拼装'],['composed-ui','界面组合']]) { const link = element('a','art-action',label); link.href = `#${target}`; toolbar.append(link); }
  root.append(toolbar);
  const groups = new Map<string,ArtDefinition[]>();
  for (const definition of store.manifest.assets) { if (!groups.has(definition.group)) groups.set(definition.group,[]); groups.get(definition.group)!.push(definition); }
  for (const [name,definitions] of groups) {
    const section = element('section','art-group art-asset-group'); section.dataset.group = name;
    section.append(element('h2',undefined,name)); const grid = element('div','art-grid');
    definitions.forEach(definition => grid.append(assetItem(store,definition))); section.append(grid); root.append(section);
  }
  root.append(baseCards(store),toolCards(store),composedUi(store));
  applyFilters();
}
