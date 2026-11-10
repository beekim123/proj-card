import { dimensions, type ArtStore } from '../art';
import { CONFIG, createGame, playCard, previewCard, undo, endTurn, updateSettings, resetGrowth, gemForm, formatFormula, formatNumber, formatFull, formatCardHint, previewRunCard, hitsWeakness, createRun, playRunCard, undoRun, endRunTurn, chooseLoot, skipLoot, abandonRun, createToolCard, formatOverkill, MONSTERS, RUN, TOOLS, TOOL_TYPES, type Card, type RowEntry, type GameState, type RunState, type RunRecords, type ToolType } from '../rules';
import { loadRun, saveRun, loadRecords, recordResult, loadSettings, saveSettings } from '../save';
import { portrait } from '../layout/portrait';
import { landscape } from '../layout/landscape';
import { fitLayout } from '../layout/fit';
import { MOTION, ROW, handSize, rowSize, growthRects, type Layout, type Point, type Rect } from '../layout/types';
import { CARD_NAMES, createCard, playCardArt } from './card';
import { handPositions, rowPositions } from './geometry';

const COLORS = ['red', 'green', 'blue'] as const;
const NAMES = ['红宝石', '绿宝石', '蓝宝石'];
const FORMS = ['原石', '切好', '闪光'];
const FORM_IDS = ['rough', 'cut', 'shine'];
const REACTION = { plain: '普通', same: '同色', shun: '顺色', white: '凑白' };
/** 手牌大图里额外牌的效果说明 */
const TOOL_HELP: Record<ToolType, string> = {
  bag: '打出后从牌库摸 2 张。', lens: '打出后倍率再 ×2。', hammer: '打出后，这回合到这里的伤害 ×2。',
  mirror: '变成上一张缺的宝石，一定和上一张凑白；这回合第一张打出时没有宝石。', stone: '打出后三颗宝石各长 5 次。',
};
/** 多层血条每层的颜色（第 1 层是最后打的那层） */
const HP_LAYER_COLORS = ['', '#C7742B', '#8A4FC4'];
const DEBUG_SEQUENCES: Record<number, (number | ToolType)[]> = { 1: [1,'lens'], 2: [3,'lens'], 3: [1,3,'hammer'], 4: [1,3,2,6,4,5,'hammer'], 5: [1,3,2,6,'lens',5], 6: [1,'mirror'], 7: [0,'mirror'], 8: ['mirror'], 9: [7,'mirror'], 10: [1,'mirror',1], 11: ['stone',1], 12: ['hammer','hammer'], 13: [1,'bag'], 14: [1,3,2,6,4,'mirror'] };
const GAME_TITLE = { name: '新卡牌', suffix: '（暂名）' }; 
type LayoutChoice = 'auto' | 'portrait' | 'landscape';
interface Preferences { hint: boolean; hand: 6 | 7 | 8; grow: boolean; tools: boolean; layout: LayoutChoice; formula: boolean }
interface Drag { id: number; pointer: number; start: Point; last: Point; touch: boolean; offset: Point; dragging: boolean; node: HTMLElement; origin: Point }
const el = (tag = 'div', className = '', text = '') => { const node = document.createElement(tag); node.className = className; node.textContent = text; return node; };
const place = (node: HTMLElement | SVGElement, box: Rect) => Object.assign(node.style, { position: 'absolute', left: `${box.x}px`, top: `${box.y}px`, width: `${box.w}px`, height: `${box.h}px` });
const contains = (box: Rect, point: Point) => point.x >= box.x && point.y >= box.y && point.x <= box.x + box.w && point.y <= box.y + box.h;

export class GameUI {
  private readonly store: ArtStore;
  private readonly viewport = el('div', 'game-viewport');
  private readonly stage = el('main', 'game-stage');
  private readonly scene = el('div', 'scene');
  private readonly rowLayer = el('div', 'row-layer');
  private readonly handLayer = el('div', 'hand-layer');
  private readonly fxLayer = el('div', 'fx-layer');
  private readonly overlayLayer = el('div', 'overlay-layer');
  private readonly dragLayer = el('div', 'drag-layer');
  private readonly rowNodes = new Map<number, HTMLElement>();
  private readonly handNodes = new Map<number, HTMLElement>();
  private readonly timers = new Set<number>();
  private run: RunState | null = null;
  private savedRun: RunState | null = null;
  private localRecords: RunRecords;
  private screen: 'home' | 'practice' | 'adventure' = 'home';
  private transition = false;
  private selectedLoot = -1;
  private brokenHintShown = false;
  private heartNodes: (HTMLElement | SVGSVGElement)[] = [];
  private hpFill = el('div', 'hp-fill');
  private hpChip = el('div', 'hp-chip');
  private hpText = el('div', 'hp-text');
  private hpBar = el('div', 'hp-bar');
  private hpUnder = el('div', 'hp-under');
  private toughNode = el('div', 'tough-bar');
  private cardPreview: HTMLElement | null = null;
  private previewSticky = false;
  private countdownArt: SVGSVGElement;
  private countdownText = el('strong', 'countdown-number');
  private countdownNode = el('div', 'countdown');
  private endButton!: HTMLButtonElement;
  private lootCards: HTMLElement[] = [];
  private lootHint = el('div', 'loot-hint');
  private saveWarningShown = false;
  private pendingSettlements: RunState[] = [];
  private floatIndex = 0;
  private losingHeart = -1;
  private attacking = false;
  private pendingDrawIds = new Set<number>();
  private state: GameState;
  private prefs: Preferences;
  private layout: Layout = portrait;
  private scale = 1;
  private drag: Drag | null = null;
  private preview: RowEntry | null = null;
  private formula = el('div', 'formula');
  private formulaText = el('div', 'formula-text');
  private formulaToggle = el('button', 'formula-toggle') as HTMLButtonElement;
  private holdTimer: ReturnType<typeof setTimeout> | undefined;
  private turn = el('div', 'turn-counter');
  private records = el('div', 'records');
  private score = el('div', 'turn-damage');
  private mult = el('div', 'multiplier');
  private multText = el('strong');
  private dummy: SVGSVGElement;
  private badge: SVGSVGElement;
  private growth: HTMLElement[] = [];
  private deckCount = el('span', 'count-bubble');
  private undoButton!: HTMLButtonElement;
  private deckButton!: HTMLButtonElement;
  private modal: HTMLElement | null = null;
  private modalReturn: HTMLElement | null = null;
  private scoreAnimation = 0;
  private displayScore = 0;
  private displayMultiplier = 1;
  private displayTotal = 0;
  private displayXp: [number, number, number] = [0, 0, 0];
  private shownRainbow = new Set<number>();
  private toasts: string[] = [];
  private toastActive = false;
  private epoch = 0;

  constructor(root: HTMLElement, store: ArtStore) {
    this.store = store;
    this.prefs = loadSettings();
    const restored = loadRun(); this.savedRun = restored.state;
    this.localRecords = loadRecords();
    this.state = createGame(this.seed(), this.ruleOptions());
    this.syncPresentation();
    this.dummy = store.createInline('dummy');
    this.badge = store.createInline('ui_mult_badge');
    this.countdownArt = store.createInline('ui_countdown');
    this.viewport.append(this.stage);
    this.stage.id = 'stage'; this.stage.setAttribute('aria-label', '宝石卡牌冒险');
    this.stage.append(this.scene, this.rowLayer, this.handLayer, this.fxLayer, this.dragLayer, this.overlayLayer);
    root.replaceChildren(this.viewport);
    document.body.style.backgroundImage = `radial-gradient(ellipse 80% 75% at 50% 45%, transparent 45%, rgba(7,9,15,.82) 100%), url("${store.get('bg_tile').url}")`;
    this.stage.addEventListener('pointerdown', this.onPointerDown);
    this.formulaToggle.type = 'button'; this.formulaToggle.addEventListener('click', () => { this.prefs.formula = !this.prefs.formula; this.savePreferences(); this.renderFormula(); });
    this.handLayer.addEventListener('pointerover', e => { if (e.pointerType !== 'mouse' || this.drag || this.modal || this.previewSticky) return; const node = (e.target as Element).closest<HTMLElement>('.hand-card'); const card = this.state.hand.find(c => c.id === Number(node?.dataset.cardId)); if (node && card) this.showCardPreview(card, node, false); });
    this.handLayer.addEventListener('pointerout', e => { if (e.pointerType !== 'mouse' || this.previewSticky) return; const from = (e.target as Element).closest('.hand-card'); const to = (e.relatedTarget as Element | null)?.closest?.('.hand-card'); if (from && from !== to) this.hideCardPreview(); });
    this.stage.addEventListener('pointermove', this.onPointerMove);
    this.stage.addEventListener('pointerup', this.onPointerUp);
    this.stage.addEventListener('pointercancel', this.onPointerCancel);
    this.stage.addEventListener('lostpointercapture', this.onLostPointerCapture);
    this.stage.addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('blur', () => this.cancelDrag());
    window.addEventListener('resize', () => this.resize());
    window.visualViewport?.addEventListener('resize', () => this.resize());
    this.resize(true);
    const navigation = performance.getEntriesByType?.('navigation')[0] as PerformanceNavigationTiming | undefined;
    if (this.savedRun && navigation?.type === 'reload') this.resumeAdventure();
    if (restored.error) this.toast(restored.error);
    else if (restored.clear) this.toast('上次的进度读不出来，已经清掉了');
    window.addEventListener('pagehide', () => this.persist());
    document.addEventListener('visibilitychange', () => { if (document.hidden) { this.cancelDrag(); this.persist(); } });
    if (this.debugEnabled) this.installDebug();

  }

  private get debugEnabled() { return new URLSearchParams(location.search).get('debug') === '1'; }
  private get playing() { return this.screen === 'practice' || (this.screen === 'adventure' && this.run?.phase === 'battle' && !this.transition); }
  private seed() { const requested = new URLSearchParams(location.search).get('seed'); return requested !== null && Number.isFinite(Number(requested)) ? Number(requested) >>> 0 : Date.now() >>> 0; }
  private ruleOptions() { const { hint, hand, grow, tools } = this.prefs; return { hint, hand, grow, tools }; }
  private savePreferences() { if (!saveSettings(this.prefs)) this.storageWarning(); }
  private storageWarning() { if (!this.saveWarningShown) { this.saveWarningShown = true; this.toast('浏览器未允许保存，本次游戏仍可继续'); } }
  private persist() {
    if (this.run?.result) this.settleRecords();
    this.flushSettlements();
    const active = this.screen === 'adventure' && this.run && !this.run.result ? this.run : this.savedRun;
    if (active && !active.result && !saveRun(active)) this.storageWarning();
  }
  private settleRecords() {
    if (!this.run?.result) return true;
    if (!recordResult(this.run, this.localRecords)) {
      if (!this.pendingSettlements.includes(this.run)) this.pendingSettlements.push(this.run);
      this.storageWarning(); return false;
    }
    this.pendingSettlements = this.pendingSettlements.filter(run => run !== this.run);
    if (this.savedRun === this.run) this.savedRun = null;
    return true;
  }
  private flushSettlements() {
    const pending = [...this.pendingSettlements];
    for (const run of pending) {
      if (!recordResult(run, this.localRecords)) { this.storageWarning(); break; }
      this.pendingSettlements = this.pendingSettlements.filter(item => item !== run);
      if (this.savedRun === run) this.savedRun = null;
    }

  }
  private later(callback: () => void, ms: number) { const epoch = this.epoch; const id = window.setTimeout(() => { this.timers.delete(id); if (epoch === this.epoch) callback(); }, ms); this.timers.add(id); }
  private syncPresentation() {
    this.displayScore = this.state.turnDmg; this.displayMultiplier = this.state.m; this.displayTotal = this.state.total; this.displayXp = [...this.state.xp];
    this.shownRainbow = new Set(this.state.row.filter(card => card.rb).map(card => card.id));
  }
  private resetEffects() {
    this.losingHeart = -1; this.attacking = false; this.pendingDrawIds.clear();
    this.epoch++; this.timers.forEach(clearTimeout); this.timers.clear(); cancelAnimationFrame(this.scoreAnimation);
    this.stage.querySelectorAll('.temporary-mirror,.dealing-card-back,.loot-card-back').forEach(node => node.remove()); this.stage.querySelectorAll<HTMLElement>('.gem-card').forEach(node => { node.style.visibility = ''; });
    this.fxLayer.replaceChildren(); this.dragLayer.replaceChildren(); this.toasts = []; this.toastActive = false;
    this.store.stop(this.dummy); this.store.stop(this.badge); this.store.stop(this.countdownArt);
  }
  private resize(force = false) {
    const rect = this.viewport.getBoundingClientRect();
    const query = new URLSearchParams(location.search).get('layout');
    const requested = query === 'portrait' || query === 'landscape' ? query : this.prefs.layout;
    const base = requested === 'auto' ? rect.width > rect.height ? landscape : portrait : requested === 'landscape' ? landscape : portrait;
    this.scale = Math.min(rect.width / base.width, rect.height / base.height);
    // 屏幕比设计尺寸长（竖屏）或宽（横屏）时，把多出来的空间分进布局
    const extra = base.name === 'portrait' ? rect.height / this.scale - base.height : rect.width / this.scale - base.width;
    const next = fitLayout(base, extra);
    const changed = next.name !== this.layout.name || next.width !== this.layout.width || next.height !== this.layout.height;
    if (changed) { this.cancelDrag(); this.closeModal(); this.resetEffects(); this.syncPresentation(); }
    this.layout = next;
    Object.assign(this.stage.style, { width: `${next.width}px`, height: `${next.height}px`, transform: `translate(-50%, -50%) scale(${this.scale})` });
    this.stage.dataset.layout = next.name;
    document.body.style.backgroundSize = `auto, ${512 * this.scale}px ${512 * this.scale}px`;
    if (changed || force) { if (this.transition) { this.resetEffects(); this.transition = false; } this.buildScene(); this.render(); }
  }
  private button(label: string, rect: Rect, action: () => void, icon?: string, primary = false) {
    const button = document.createElement('button'); button.type = 'button'; button.className = `game-button${primary ? ' primary' : ''}`;
    button.setAttribute('aria-label', label); place(button, rect);
    this.store.nineSlice(button, primary ? 'ui_btn_primary' : 'ui_btn', 32);
    if (icon) { const image = this.store.create(icon); image.classList.add('button-icon'); button.append(image); }
    button.append(el('span', '', label)); button.addEventListener('click', action); this.scene.append(button); return button;
  }
  /** 圆形图标按钮：旧铜圈 + 暗底，图标在中间，名字只给读屏 */
  private roundButton(label: string, rect: Rect, action: () => void, icon: string) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'round-button';
    button.setAttribute('aria-label', label); button.title = label; place(button, rect);
    const image = this.store.create(icon); image.classList.add('round-icon'); button.append(image);
    button.addEventListener('click', action); this.scene.append(button); return button;
  }
  private layer(className: string, style: Partial<CSSStyleDeclaration> = {}) { const node = el('div', className); Object.assign(node.style, style); this.scene.append(node); return node; }
  private buildScene() {
    this.hideCardPreview(); const l = this.layout; const pal = this.store.manifest.palette; this.scene.replaceChildren(); this.fxLayer.querySelectorAll('.adventure-banner').forEach(node => node.remove()); this.mult.style.opacity = ''; this.formula.style.opacity = '';
    // 气氛：从上往下的柔光；横屏有一块地面
    this.layer('scene-light', { background: `radial-gradient(${l.light.rx}px ${l.light.ry}px at ${l.light.x + 1200}px ${l.light.y + 1200}px, rgba(226,214,186,.16), rgba(226,214,186,.05) 55%, transparent 80%)` });
    if (l.floorY !== null) this.layer('scene-floor', { top: `${l.floorY}px` });
    this.stage.dataset.screen = this.screen === 'adventure' ? this.run?.phase ?? 'battle' : this.screen;
    this.rowNodes.clear(); this.rowLayer.replaceChildren(); this.handNodes.clear(); this.handLayer.replaceChildren();
    this.heartNodes = []; this.growth = [];
    const table = el('div', 'table-cloth'); place(table, l.table); this.store.nineSlice(table, 'table_cloth', l.tableBorder); this.scene.append(table);
    const rules = this.roundButton('规则', l.rules, () => this.showRules(), 'ui_icon_rules'); rules.dataset.action = 'rules';
    const settings = this.roundButton('设置', l.settings, () => this.showSettings(), 'ui_icon_settings'); settings.dataset.action = 'settings';
    for (const b of [rules, settings]) b.style.setProperty('--icon-size', `${l.toolbarIcon}px`);
    if (this.screen === 'home') { this.buildHome(); return; }
    if (this.screen === 'adventure' && this.run?.phase === 'loot') { this.buildAdventureTop(); this.buildLoot(); return; }
    if (this.screen === 'adventure' && this.run?.result) { this.buildResult(); return; }
    const artId = this.screen === 'adventure' && this.run ? `mon_${this.run.monster.key}` : 'dummy';
    if (this.dummy.dataset.artId !== artId) {
      this.store.stop(this.dummy); this.dummy = this.store.createInline(artId);
      this.dummy.addEventListener('click', () => { if (!this.drag && this.screen === 'adventure') this.showMonster(); });
      this.dummy.addEventListener('keydown', e => { if (e.key === 'Enter') this.showMonster(); });
    }
    if (this.screen === 'practice' || this.run?.monster.key !== 'dragon') {
      const propId = this.screen === 'practice' ? 'prop_rack' : 'prop_pillar';
      const rack = this.store.create(propId); rack.classList.add('scene-prop'); this.placeAnchored(rack, propId, l.rackAnchor, l.rackScale); this.scene.prepend(rack);
    }
    this.placeAnchored(this.dummy, artId, l.dummyAnchor, this.monsterScale()); this.dummy.classList.add('scene-dummy');
    this.dummy.classList.toggle('scene-monster', this.screen === 'adventure'); this.dummy.tabIndex = this.screen === 'adventure' ? 0 : -1;
    this.scene.insertBefore(this.dummy, table);
    if (this.screen === 'adventure') this.buildAdventureTop();
    // 倍率牌钉在桌子上沿
    this.mult.replaceChildren(this.badge, this.multText); place(this.mult, l.multiplier); this.badge.style.width = '100%'; this.badge.style.height = '100%'; this.scene.append(this.mult);
    // 文字信息直接浮在场景上，不加底板
    place(this.turn, l.turn); place(this.records, l.records); this.scene.append(this.turn, this.records);
    const label = el('div', 'turn-label', '本回合'); place(label, l.turnLabel); this.scene.append(label);
    place(this.score, l.damage); this.score.dataset.testid = 'turn-damage'; this.scene.append(this.score);
    place(this.formula, l.formula); this.formula.replaceChildren(this.formulaToggle, this.formulaText); this.scene.append(this.formula);
    // 宝石成长：三个圆槽，外圈是进度
    this.growth = l.growth.centers.map((c, i) => {
      const button = document.createElement('button'); button.className = 'growth-socket'; button.type = 'button'; button.dataset.gem = COLORS[i];
      const s = l.growth.size; place(button, { x: c.x - s / 2, y: c.y - s / 2, w: s, h: s });
      button.style.setProperty('--gem-color', pal.gem[COLORS[i]].mid);
      button.addEventListener('click', () => this.showGrowth(i)); this.scene.append(button); return button;
    });
    // 桌沿上的按钮
    this.undoButton = this.roundButton('撤回', l.undo, () => this.rewind(), 'ui_icon_undo'); this.undoButton.dataset.action = 'undo';
    this.deckButton = this.roundButton('牌库', l.deck, () => this.showDeck(), 'ui_icon_deck'); this.deckButton.dataset.action = 'deck'; this.deckButton.append(this.deckCount);
    this.endButton = this.button('结束回合', l.end, () => this.finishTurn(), undefined, true); this.endButton.dataset.action = 'end-turn';
    this.rowNodes.clear(); this.rowLayer.replaceChildren(); this.handNodes.clear(); this.handLayer.replaceChildren();
  }
  private placeAnchored(node: HTMLElement | SVGElement, id: string, point: Point, scale = 1) {
    const asset = this.store.get(id).definition; const [w, h] = dimensions(asset); const anchor = asset.anchor || [w / 2, h];
    place(node, { x: point.x - anchor[0] * scale, y: point.y - anchor[1] * scale, w: w * scale, h: h * scale });
  }
  private render() {
    if (!this.playing) return;
    this.turn.textContent = this.screen === 'adventure' && this.run ? `第 ${this.run.fight} 仗 · 第 ${this.state.turn} 回合` : `第 ${this.state.turn} 回合`;
    this.records.hidden = this.screen === 'adventure';
    if (this.screen === 'adventure') this.renderBattleStatus();
    this.records.replaceChildren(el('span', '', `最高一回合 ${formatFull(this.state.best)}`), el('span', '', `累计 ${formatFull(this.displayTotal)}`));
    this.multText.textContent = `×${formatNumber(this.displayMultiplier)}`;
    this.setScore(this.displayScore);
    this.score.dataset.value = String(this.state.turnDmg);
    this.undoButton.disabled = this.state.hist.length === 0;
    this.deckCount.textContent = String(this.state.deck.length); this.deckButton.setAttribute('aria-label', `牌库 ${this.state.deck.length} 张`);
    this.renderGrowth(); this.renderRow(); this.renderHand(); this.renderFormula();
  }
  private renderGrowth() {
    const NS = 'http://www.w3.org/2000/svg';
    this.growth.forEach((socket, i) => {
      const l = this.layout.growth; const form = !this.state.opts.grow ? 0 : this.displayXp[i] >= CONFIG.formAt[2] ? 2 : this.displayXp[i] >= CONFIG.formAt[1] ? 1 : 0;
      const xp = this.displayXp[i];
      const progress = xp >= CONFIG.formAt[2] ? 100 : xp >= CONFIG.formAt[1] ? (xp - CONFIG.formAt[1]) / (CONFIG.formAt[2] - CONFIG.formAt[1]) * 100 : xp / CONFIG.formAt[1] * 100;
      // 外圈进度：一圈细的旧铜色弧
      const ring = document.createElementNS(NS, 'svg'); ring.setAttribute('viewBox', '0 0 100 100'); ring.classList.add('growth-ring');
      const track = document.createElementNS(NS, 'circle'); const arc = document.createElementNS(NS, 'circle');
      for (const c of [track, arc]) { c.setAttribute('cx', '50'); c.setAttribute('cy', '50'); c.setAttribute('r', '46'); c.setAttribute('pathLength', '100'); }
      track.classList.add('ring-track'); arc.classList.add('ring-fill'); arc.setAttribute('stroke-dasharray', `${progress} 100`);
      ring.append(track, arc);
      const image = this.store.createImage(`gem_${COLORS[i]}_${FORM_IDS[form]}`, { static: true }); image.classList.add('growth-gem');
      const g = l.gem; Object.assign(image.style, { width: `${g}px`, height: `${g}px`, left: `${(l.size - g) / 2}px`, top: `${(l.size - g) / 2}px` });
      const text = el('span', `growth-label form-${FORM_IDS[form]}`, `${FORMS[form]} ${CONFIG.gemValue[form]}`); if (l.labelSide === 'left') text.classList.add('label-left'), text.style.right = `${l.size + l.labelGap}px`; else text.style.top = `${l.size + l.labelGap}px`;
      const existingRing = socket.querySelector<SVGSVGElement>('.growth-ring');
      if (existingRing) {
        const fill = existingRing.querySelector<SVGCircleElement>('.ring-fill'); const oldXp = Number(socket.dataset.growthXp ?? xp);
        fill?.setAttribute('stroke-dasharray', `${progress} 100`);
        if (fill && socket.classList.contains('stone-growth') && xp > oldXp) {
          const percent = (count:number) => count >= CONFIG.formAt[2] ? 100 : count >= CONFIG.formAt[1] ? (count-CONFIG.formAt[1])/(CONFIG.formAt[2]-CONFIG.formAt[1])*100 : count/CONFIG.formAt[1]*100;
          const keyframes: Keyframe[] = [{strokeDasharray:`${percent(oldXp)} 100`,offset:0}];
          for (const threshold of [CONFIG.formAt[1],CONFIG.formAt[2]]) if (oldXp < threshold && xp >= threshold) { const offset=(threshold-oldXp)/(xp-oldXp);keyframes.push({strokeDasharray:'100 100',offset});if(threshold<CONFIG.formAt[2])keyframes.push({strokeDasharray:'0 100',offset}); }
          keyframes.push({strokeDasharray:`${progress} 100`,offset:1}); fill.animate(keyframes,{duration:600,easing:'linear'});
        }
        socket.querySelector('.growth-gem')?.remove(); socket.querySelector('.growth-label')?.remove(); socket.append(image, text); } else socket.replaceChildren(ring, image, text); socket.dataset.growthXp = String(xp); socket.setAttribute('aria-label', `${NAMES[i]}，${FORMS[form]}，用了 ${xp} 次。查看成长详情`);
    });
  }
  private renderRow() {
    if (!this.playing) return;
    const items = [...this.state.row.map(card => ({ ...card, rb: this.shownRainbow.has(card.id) })), ...(this.preview ? [{ ...this.preview, rb: false }] : [])];
    const positions = rowPositions(items, this.layout);
    const keep = new Set(this.state.row.map(c => c.id));
    for (const [id, node] of this.rowNodes) if (!keep.has(id)) { node.remove(); this.rowNodes.delete(id); }
    this.rowLayer.querySelector('.row-preview')?.remove(); this.rowLayer.querySelector('.empty-slot')?.remove();
    const size = rowSize(this.layout);
    if (!items.length) {
      // 空桌：第一张牌的位置画一个虚线牌位
      const empty = el('div', 'empty-slot'); empty.append(el('span', '', '拖到这里')); place(empty, { ...this.layout.rowStart, ...size }); this.rowLayer.append(empty);
    }
    items.forEach((entry, i) => {
      const preview = i === this.state.row.length;
      let node = preview ? undefined : this.rowNodes.get(entry.id);
      if (!node) { node = el('div', `row-card${preview ? ' row-preview' : ''}`); if (!preview) this.rowNodes.set(entry.id, node); this.rowLayer.append(node); }
      const p = positions[i]; place(node, { x: p.x, y: p.y, w: size.w, h: size.h }); node.style.zIndex = String(i + 1);
      const key = `${entry.v}:${entry.type}:${this.displayXp.map(xp => !this.state.opts.grow ? 0 : xp >= CONFIG.formAt[2] ? 2 : xp >= CONFIG.formAt[1] ? 1 : 0).join(',')}:${this.state.opts.grow}`;
      if (node.dataset.faceKey !== key) { const card = createCard(this.store, entry, this.displayXp, this.state.opts.grow, { static: true, resolved: true }); card.style.transform = `scale(${this.layout.rowScale})`; node.replaceChildren(card); node.dataset.faceKey = key; }
      node.querySelectorAll('.reaction-label,.card-damage').forEach(n => n.remove()); node.dataset.cardId = String(entry.id);
      if ((!preview || this.state.opts.hint) && entry.k !== 'plain' && p.showLabel) {
        const label = el('div', 'reaction-label', REACTION[entry.k]); label.style.top = `${-ROW.labelOffset}px`; node.append(label);
      }
      if ((!preview || this.state.opts.hint) && p.showDamage) {
        const damage = el('div', 'card-damage', `${preview ? '预计 ' : ''}${formatFull(preview ? entry.damage : entry.dmg)}`); damage.style.top = `${size.h + ROW.damageGap}px`; node.append(damage);
      }
    });
  }
  private renderHand(newIds: number[] = [], drawInterval = 60) {
    if (!this.playing) return;
    const cards = this.state.hand.filter(card => !this.pendingDrawIds.has(card.id) && !(this.drag?.dragging && this.drag.id === card.id));
    const keep = new Set(cards.map(card => card.id));
    for (const [id, node] of this.handNodes) if (!keep.has(id)) { node.remove(); this.handNodes.delete(id); }
    const positions = handPositions(cards.length, this.layout); const size = handSize(this.layout);
    cards.forEach((card, i) => {
      let node = this.handNodes.get(card.id);
      if (!node) { node = el('div', 'hand-card'); node.tabIndex = 0; node.setAttribute('role', 'button'); this.handNodes.set(card.id, node); this.handLayer.append(node); }
      const p = positions[i]; place(node, { x: p.x, y: p.y, w: size.w, h: size.h }); node.style.transform = `rotate(${p.rotation}deg)`; node.style.zIndex = String(i + 1); node.dataset.cardId = String(card.id); node.dataset.mask = String(card.v);
      node.classList.toggle('picked', this.drag?.id === card.id && !this.drag.dragging);
      if (this.drag?.id === card.id && !this.drag.dragging) { node.style.zIndex = '200'; node.style.transform = `translateY(${-MOTION.handLift}px) scale(${MOTION.handPickScale})`; }
      const face = createCard(this.store, card, this.displayXp, this.state.opts.grow); face.style.transform = `scale(${this.layout.hand.scale})`; node.replaceChildren(face); node.setAttribute('aria-label', `${face.getAttribute('aria-label')}。拖到桌面出牌，点按查看。`);
      const hintEntry = previewCard(this.state, card); const reaction = hintEntry.k;
      node.classList.toggle('has-hint', this.state.opts.hint && reaction !== 'plain');
      const weakHit = this.screen === 'adventure' && this.run ? hitsWeakness(this.run, hintEntry.v) : false; node.classList.toggle('hits-weak', weakHit);
      const hintText = [formatCardHint(hintEntry), weakHit ? '削韧' : ''].filter(Boolean).join(' · ');
      if (this.state.opts.hint && hintText) { const hint = el('span', 'hand-hint', hintText); hint.style.top = `${-MOTION.hintOffset}px`; node.append(hint); }
      if (newIds.includes(card.id)) {
        const delay = newIds.indexOf(card.id) * drawInterval;
        const back = this.store.create('card_back'); back.classList.add('dealing-card-back'); Object.assign(back.style, { width: `${size.w}px`, height: `${size.h}px` }); face.style.visibility = 'hidden'; node.append(back);
        this.later(() => { back.remove(); face.style.visibility = ''; }, delay + 220);
        node.animate([{ transform: `translate(${this.layout.deck.x + this.layout.deck.w / 2 - p.x - size.w / 2}px, ${this.layout.deck.y + this.layout.deck.h / 2 - p.y - size.h}px) rotate(0deg) scale(0.3)`, opacity: 0 }, { transform: `rotate(${p.rotation}deg)`, opacity: 1 }], { duration: 220, delay, fill: 'backwards', easing: 'ease-out' });
      }
    });
  }
  private renderFormula() {
    const entry = this.preview || this.state.row.at(-1);
    // 算式默认收起：玩家不关心怎么算，想看再点开（设置里记住）
    const open = this.prefs.formula; this.formula.classList.toggle('open', open);
    this.formulaToggle.textContent = open ? '收起算式 ▴' : '算式 ▾'; this.formulaToggle.setAttribute('aria-expanded', String(open));
    this.formulaText.textContent = !open || (this.preview && !this.state.opts.hint) ? '' : entry ? formatFormula(entry, Boolean(this.preview), formatFull) : '';
    this.formulaText.style.fontSize = '24px';
    let size = 24;
    while ((this.formulaText.scrollWidth > this.layout.formula.w || this.formula.scrollHeight > this.layout.formula.h + 2) && size > 18) this.formulaText.style.fontSize = `${--size}px`;
  }
  private point(event: PointerEvent): Point { const box = this.stage.getBoundingClientRect(); return { x: (event.clientX - box.left) / this.scale, y: (event.clientY - box.top) / this.scale }; }
  private canDrop(point: Point) {
    if (point.x < 0 || point.y < 0 || point.x > this.layout.width || point.y > this.layout.height || contains(this.layout.hand.region, point)) return false;
    return ![this.layout.undo, this.layout.deck, this.layout.end, this.layout.rules, this.layout.settings, ...growthRects(this.layout)].some(box => contains(box, point));
  }
  private onPointerDown = (event: PointerEvent) => {
    if (!this.playing || this.modal || this.drag || event.button !== 0) return;
    const target = (event.target as Element).closest<HTMLElement>('.hand-card'); if (!target) { this.hideCardPreview(); return; }
    if (event.pointerType !== 'mouse') { const card = this.state.hand.find(c => c.id === Number(target.dataset.cardId)); clearTimeout(this.holdTimer); this.holdTimer = setTimeout(() => { const node = this.handNodes.get(Number(target.dataset.cardId)); if (card && node && this.drag && !this.drag.dragging) this.showCardPreview(card, node, false); }, MOTION.holdMs); }
    event.preventDefault(); const p = this.point(event); const x = parseFloat(target.style.left); const y = parseFloat(target.style.top);
    this.drag = { id: Number(target.dataset.cardId), pointer: event.pointerId, start: p, last: p, touch: event.pointerType !== 'mouse', offset: { x: p.x - x, y: p.y - y }, dragging: false, node: target, origin: { x, y } };
    target.classList.add('picked'); target.style.zIndex = '200'; target.style.transform = `translateY(${-MOTION.handLift}px) scale(${MOTION.handPickScale})`;
    this.stage.setPointerCapture(event.pointerId);
  };
  private onPointerMove = (event: PointerEvent) => {
    const drag = this.drag; if (!drag || drag.pointer !== event.pointerId) return;
    event.preventDefault(); const p = this.point(event); drag.last = p;
    if (!drag.dragging && Math.hypot(p.x - drag.start.x, p.y - drag.start.y) > MOTION.dragThreshold) {
      drag.dragging = true; clearTimeout(this.holdTimer); this.hideCardPreview(); const card = this.state.hand.find(c => c.id === drag.id); if (!card) return this.cancelDrag();
      const node = el('div', 'drag-card'); const dragSize = handSize(this.layout); Object.assign(node.style, { width: `${dragSize.w}px`, height: `${dragSize.h}px` }); const face = createCard(this.store, card, this.displayXp, this.state.opts.grow); face.style.transform = `scale(${this.layout.hand.scale})`; node.append(face); drag.node = node; this.dragLayer.append(node); this.renderHand();
    }
    if (!drag.dragging) return;
    const size = handSize(this.layout);
    const x = drag.touch ? p.x - size.w / 2 : p.x - drag.offset.x;
    const y = drag.touch ? p.y - MOTION.touchOffset - size.h / 2 : p.y - drag.offset.y;
    drag.node.style.transform = `translate3d(${x}px, ${y}px, 0)`; drag.origin = { x, y };
    const card = this.state.hand.find(c => c.id === drag.id);
    const valid = Boolean(card && this.canDrop(p));
    if (valid !== Boolean(this.preview)) {
      this.preview = valid && card ? this.predict(card) : null;
      this.renderRow(); this.renderFormula(); this.stage.classList.toggle('drop-ready', valid);
    }
  };
  private onPointerUp = (event: PointerEvent) => {
    const drag = this.drag; if (!drag || drag.pointer !== event.pointerId) return;
    const p = this.point(event); this.drag = null; this.preview = null; this.stage.classList.remove('drop-ready');
    if (this.stage.hasPointerCapture(event.pointerId)) this.stage.releasePointerCapture(event.pointerId);
    clearTimeout(this.holdTimer);
    // 电脑：松手不弹东西（停在牌上就有大图）；手机：按住看大图，松手收起
    if (!drag.dragging) { this.renderHand(); if (drag.touch) this.hideCardPreview(); }
    else if (this.canDrop(p)) { const origin = drag.origin; drag.node.remove(); this.playById(drag.id, origin); }
    else this.returnCard(drag);
    this.renderRow(); this.renderFormula();
  };
  private onPointerCancel = (event: PointerEvent) => { if (this.drag?.pointer === event.pointerId) this.cancelDrag(); };
  private onLostPointerCapture = () => { if (this.drag) this.cancelDrag(); };
  private cancelDrag() {
    clearTimeout(this.holdTimer); const drag = this.drag; if (!drag) return; if (drag.touch) this.hideCardPreview(); this.drag = null; this.preview = null;
    if (this.stage.hasPointerCapture(drag.pointer)) this.stage.releasePointerCapture(drag.pointer);
    this.stage.classList.remove('drop-ready'); if (drag.dragging) this.returnCard(drag); else this.renderHand(); this.renderRow(); this.renderFormula();
  }
  private returnCard(drag: Drag) {
    this.renderHand(); const target = this.handNodes.get(drag.id); if (!target) { drag.node.remove(); return; }
    target.style.visibility = 'hidden'; const x = parseFloat(target.style.left); const y = parseFloat(target.style.top);
    const fromX = drag.origin.x; const fromY = drag.origin.y; drag.node.style.transform = ''; place(drag.node, { x: fromX, y: fromY, ...handSize(this.layout) });
    const animation = drag.node.animate([{ transform: 'translate(0,0)' }, { transform: `translate(${x - fromX}px, ${y - fromY}px) ${target.style.transform}` }], { duration: 200, easing: 'ease-out' });
    animation.onfinish = () => { drag.node.remove(); target.style.visibility = ''; }; animation.oncancel = () => { drag.node.remove(); target.style.visibility = ''; };
  }
  private playById(id: number | undefined, origin?: Point) {
    if (!this.playing) return;
    const index = this.state.hand.findIndex(card => card.id === id); if (index < 0) return;
    this.hideCardPreview(); const wasBroken = this.run?.monster.broken; const guardWas = this.run?.monster.guardDown; const beforeIds = new Set(this.state.hand.map(c => c.id));
    const entry = this.screen === 'adventure' && this.run ? playRunCard(this.run, index) : playCard(this.state, index);
    const drawnIds = entry.type === 'bag' ? this.state.hand.filter(c => !beforeIds.has(c.id)).map(c => c.id) : []; drawnIds.forEach(id => this.pendingDrawIds.add(id));
    this.preview = null; const brokeNow = !wasBroken && Boolean(this.run?.monster.broken); const guardNow = !guardWas && Boolean(this.run?.monster.guardDown); this.persist();
    this.growth.forEach(socket => socket.classList.toggle('stone-growth', entry.type === 'stone'));
    this.displayXp = [...this.state.xp]; this.displayMultiplier = this.state.m; this.displayTotal = this.state.total;
    this.shownRainbow = new Set(this.state.row.filter(c => c.rb).map(c => c.id));
    this.render(); const row = this.rowNodes.get(entry.id);
    if (row && origin) row.animate([{ transform: `translate(${origin.x - parseFloat(row.style.left)}px, ${origin.y - parseFloat(row.style.top)}px) scale(${this.layout.hand.scale / this.layout.rowScale})` }, { transform: 'translate(0,0) scale(1)' }], { duration: 180, easing: 'ease-out' });
    if (entry.type && row) playCardArt(row.querySelector<HTMLElement>('.gem-card')!);
    if (entry.type === 'mirror' && row) {
      const resolved = row.querySelector<HTMLElement>('.gem-card')!;
      const before = createCard(this.store, createToolCard('mirror', entry.id), this.displayXp, this.state.opts.grow, { static: true }); before.classList.add('temporary-mirror'); before.style.transform = `scale(${this.layout.rowScale})`;
      resolved.style.visibility = 'hidden'; row.prepend(before); playCardArt(before);
      this.later(() => { before.remove(); resolved.style.visibility = ''; resolved.animate([{opacity:0},{opacity:1}],{duration:200}); },200);
    }
    this.animateScore(this.displayScore, this.state.turnDmg);
    const hit = this.monsterHitPoint();
    this.later(() => {
      if (!this.state.row.some(c => c.id === entry.id)) return;
      const big = this.screen === 'adventure' && this.run ? entry.damage >= this.run.monster.maxHp * .2 || entry.rainbow > 0 || entry.type === 'hammer' : entry.damage >= 20000 || entry.k === 'white';
      this.store.play(this.dummy, big ? 'hit_big' : 'hit');
      this.store.play(this.badge, entry.type === 'lens' || entry.k === 'white' || entry.k === 'shun' ? 'double' : 'up');
      this.mult.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.15)' }, { transform: 'scale(1)' }], { duration: 200 });
      this.float(formatFull(entry.damage), big || Boolean(entry.guard), false, hit, entry.guard ? 'guard' : '');
      if (guardNow) { this.effect('fx_kill', hit, '#E8E2D6', 1.2); this.shake(false); this.toughNode.animate([{ scale: 1 }, { scale: 1.15 }, { scale: 1 }], { duration: 300 }); this.toast(`破防！这回合接下来的牌伤害 ×${RUN.guardDamage}`); }
      const color = this.store.manifest.palette.mix[String(entry.v)] || this.store.manifest.palette.text;
      this.effect('fx_hit', hit, color);
      if (entry.k !== 'plain') { const positions = rowPositions(this.state.row, this.layout); const p = positions[this.state.row.findIndex(c => c.id === entry.id)]; if (p) this.effect(`fx_${entry.k}`, { x: p.x, y: p.y + rowSize(this.layout).h / 2 }, color); }
      if (brokeNow && this.run?.monster.broken) {
        this.store.setStay(this.dummy, 'daze'); this.effect('fx_kill', hit, undefined, 1.5);
        if (!this.brokenHintShown) { this.brokenHintShown = true; this.toast('打穿了！接着出牌刷超杀，打完点"拿战利品"'); }
      }
    }, 180);
    if (entry.rainbow) this.later(() => { this.effect('fx_rainbow', { x: (this.layout.rowStart.x + this.layout.rowRight) / 2, y: this.layout.rowStart.y - ROW.labelOffset - MOTION.rainbowLift }); this.float(`彩虹 +${formatFull(entry.rainbow)}`, true, true); this.toast('彩虹！这回合 ×10'); }, 380);
    if (entry.type === 'hammer') this.later(() => {
      this.effect('fx_slam', { x: (this.layout.rowStart.x + this.layout.rowRight) / 2, y: this.layout.rowStart.y + rowSize(this.layout).h }, this.store.manifest.palette.mix['1'] ?? undefined, 1.5);
      this.score.animate([{ scale: 1 }, { scale: 1.25 }, { scale: 1 }], { duration: 300 }); this.shake(false);
    }, 300);
    if (entry.type === 'lens') this.float('倍率 ×2', true);
    if (entry.type === 'bag') this.later(() => { drawnIds.forEach(id => this.pendingDrawIds.delete(id)); this.renderHand(drawnIds, 120); }, 300);
    entry.grown.forEach(i => this.later(() => {
      this.effect('fx_grow', this.layout.growth.centers[i], this.store.manifest.palette.gem[COLORS[i]].mid);
      const form = gemForm(this.state, i); this.toast(`${NAMES[i]}变成${FORMS[form]}，底数 ${entry.gemValues[i]} → ${CONFIG.gemValue[form]}`);
    }, 580));
  }
  private animateScore(from: number, to: number) {
    cancelAnimationFrame(this.scoreAnimation); const start = performance.now();
    const step = (now: number) => { const progress = Math.min(1, (now - start) / 300); this.displayScore = Math.round(from + (to - from) * (1 - (1 - progress) ** 3)); this.setScore(this.displayScore); if (progress < 1) this.scoreAnimation = requestAnimationFrame(step); };
    this.scoreAnimation = requestAnimationFrame(step);
  }
  private effect(id: string, at: Point, color?: string, scale = 1) {
    const svg = this.store.createInline(id); const [w, h] = dimensions(this.store.get(id).definition);
    place(svg, { x: at.x - w * scale / 2, y: at.y - h * scale / 2, w: w * scale, h: h * scale }); if (color) svg.style.color = color; this.fxLayer.append(svg);
    const duration = this.store.play(svg, 'play'); this.later(() => svg.remove(), duration);
  }
  private setScore(value: number) {
    const text = formatFull(value); this.score.textContent = text;
    this.score.style.fontSize = `${Math.min(Math.round(this.layout.damage.h * 0.9), Math.floor(this.layout.damage.w / Math.max(1, [...text].reduce((s, ch) => s + (ch === ',' ? 0.3 : 0.6), 0))))}px`;
  }
  private float(text: string, big = false, rainbow = false, at = this.layout.floating, extra = '') {
    const node = el('div', `damage-float${big ? ' big' : ''}${rainbow ? ' rainbow' : ''}${extra ? ` ${extra}` : ''}`, text);
    Object.assign(node.style, { left: `${at.x + (++this.floatIndex % 3 - 1) * 32}px`, top: `${at.y - (rainbow ? 80 : 0)}px` });
    if (rainbow) node.style.backgroundImage = `linear-gradient(90deg, ${[1,3,2,6,4,5].map(mask => this.store.manifest.palette.mix[String(mask)]).join(',')})`;
    this.fxLayer.append(node); this.later(() => node.remove(), 900);
  }
  private toast(message: string) {
    this.toasts.push(message); if (this.toastActive) return;
    const show = () => {
      const next = this.toasts.shift(); if (!next) { this.toastActive = false; return; } this.toastActive = true;
      const node = el('div', 'toast', next); node.style.maxWidth = `${Math.min(940, 2 * Math.min(this.layout.toast.x, this.layout.width - this.layout.toast.x))}px`; this.store.nineSlice(node, 'ui_panel', 24); node.style.left = `${this.layout.toast.x}px`; node.style.top = `${this.layout.toast.y}px`; this.fxLayer.append(node);
      this.later(() => { node.remove(); show(); }, 1200);
    }; show();
  }
  private flyCards(nodes: HTMLElement[], interval = 30) {
    nodes.forEach((source, i) => { const node = source.cloneNode(true) as HTMLElement; this.fxLayer.append(node); const x = parseFloat(node.style.left); const y = parseFloat(node.style.top);
      node.animate([{ transform: 'translate(0,0)', opacity: 1 }, { transform: `translate(${this.layout.deck.x - x}px, ${this.layout.deck.y - y}px) scale(.3)`, opacity: 0 }], { duration: 250, delay: i * interval, easing: 'ease-in', fill: 'forwards' }).onfinish = () => node.remove(); });
  }
  private finishTurn() {
    if (!this.playing) return;
    this.hideCardPreview();
    this.cancelDrag(); this.closeModal(); this.resetEffects();
    const previousIds = new Set(this.state.hand.map(c => c.id));
    const broken = this.screen === 'adventure' && this.run?.monster.broken;
    this.flyCards([...this.rowNodes.values(), ...(broken ? [...this.handNodes.values()] : [])], broken ? 60 : 30);
    if (this.screen === 'practice') { endTurn(this.state); this.syncPresentation(); this.render(); this.renderHand(this.state.hand.filter(c => !previousIds.has(c.id)).map(c => c.id)); return; }
    if (!this.run) return;
    const oldHearts = this.run.hearts; const countdown = this.run.monster.countdown;
    endRunTurn(this.run); this.state = this.run.game; this.persist();
    if (this.run.result) this.settleRecords();
    if (broken) { this.deathTransition(); return; }
    if (oldHearts !== this.run.hearts) {
      this.transition = Boolean(this.run.result); this.attacking = true; this.losingHeart = oldHearts - 1; this.syncPresentation(); if (!this.transition) this.render(); else { this.rowLayer.replaceChildren(); this.rowNodes.clear(); } this.updateCountdown(0); this.store.play(this.dummy, 'attack');
      this.later(() => { this.effect('fx_attack', { x: this.layout.width / 2, y: this.layout.height / 2 }, undefined, 2); this.shake(true); const heart = this.heartNodes[oldHearts - 1]; if (heart instanceof SVGSVGElement) { const duration = this.store.play(heart, 'lose'); this.later(() => { this.losingHeart = -1; this.renderHearts(); }, duration); } }, 400);
      this.later(() => { this.transition = false; this.attacking = false; this.losingHeart = -1; this.syncPresentation(); if (this.run?.result) { this.store.play(this.dummy, 'hit_big'); this.later(() => { this.buildScene(); }, 700); } else { this.renderHearts(); this.updateCountdown(this.run!.monster.countdown, true); this.render(); this.renderHand(this.state.hand.filter(c => !previousIds.has(c.id)).map(c => c.id)); } }, 1100);
    } else { this.syncPresentation(); this.render(); if (countdown !== this.run.monster.countdown) this.updateCountdown(this.run.monster.countdown, true); this.renderHand(this.state.hand.filter(c => !previousIds.has(c.id)).map(c => c.id)); }
  }
  private rewind() { if (!this.playing) return; this.cancelDrag(); if (!(this.screen === 'adventure' && this.run ? undoRun(this.run) : undo(this.state))) return; this.resetEffects(); this.syncPresentation(); this.render(); this.persist(); }
  private onKeyDown = (event: KeyboardEvent) => {
    if (this.modal) {
      if (event.key === 'Escape') { event.preventDefault(); this.closeModal(); return; }
      if (event.key === 'Tab') {
        const focus = [...this.modal.querySelectorAll<HTMLElement>('button, select, input, [tabindex="0"]')].filter(n => !n.hasAttribute('disabled'));
        const index = focus.indexOf(document.activeElement as HTMLElement); const next = event.shiftKey ? index <= 0 ? focus.length - 1 : index - 1 : index >= focus.length - 1 ? 0 : index + 1;
        if (focus.length) { event.preventDefault(); focus[next].focus(); }
      }
      return;
    }
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || /INPUT|TEXTAREA|SELECT/.test((event.target as Element).tagName)) return;
    if (this.screen === 'adventure' && this.run?.phase === 'loot' && !this.transition) {
      if (/^[1-4]$/.test(event.key)) { event.preventDefault(); this.selectLoot(Number(event.key) - 1, false); }
      else if (event.key === 'Enter' && this.selectedLoot >= 0) { event.preventDefault(); this.takeLoot(this.selectedLoot); }
      else if (event.key === '0') { event.preventDefault(); this.takeLoot(-1); }
      return;
    }
    if (!this.playing) return;
    if (event.code === 'Space') { event.preventDefault(); this.finishTurn(); }
    else if (event.key.toLowerCase() === 'z') { event.preventDefault(); this.rewind(); }
    else if (event.key === 'Enter') { const card = (event.target as Element).closest<HTMLElement>('.hand-card'); const value = this.state.hand.find(c => c.id === Number(card?.dataset.cardId)); if (value) this.inspectCard(value); }
  };
  private openModal(title: string) {
    this.hideCardPreview(); this.cancelDrag(); this.closeModal(); this.modalReturn = document.activeElement as HTMLElement;
    const overlay = el('div', 'modal-overlay'); const panel = el('section', 'modal-panel');
    panel.style.width = `${this.layout.modalWidth}px`; panel.style.maxHeight = `${this.layout.height - 96}px`; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-label', title); this.store.nineSlice(panel, 'ui_panel', 48);
    const close = document.createElement('button'); close.className = 'modal-close'; close.textContent = '×'; close.setAttribute('aria-label', '关闭'); close.addEventListener('click', () => this.closeModal());
    panel.append(el('h2', '', title), close); overlay.append(panel); overlay.addEventListener('click', e => { if (e.target === overlay) this.closeModal(); }); this.overlayLayer.append(overlay); this.modal = panel; this.viewport.classList.add('modal-open'); this.scene.inert = true; this.handLayer.inert = true; close.focus(); return panel;
  }
  private closeModal() { if (!this.modal) return; this.overlayLayer.replaceChildren(); this.modal = null; this.viewport.classList.remove('modal-open'); this.scene.inert = false; this.handLayer.inert = false; this.modalReturn?.focus(); this.modalReturn = null; }
  /** 打出这张牌会怎样（冒险里含破防加成），不改动局面 */
  private predict(card: Card): RowEntry {
    return (this.screen === 'adventure' && this.run && previewRunCard(this.run, card)) || previewCard(this.state, card);
  }
  /** 像炉石：选中 / 按住 / 鼠标停在手牌上，在手牌上方显示这张牌的大图和说明 */
  private showCardPreview(card: Card, anchor: HTMLElement, sticky: boolean) {
    this.hideCardPreview(); this.previewSticky = sticky;
    const s = this.layout.inspect.scale; const w = MOTION.cardW * s; const h = MOTION.cardH * s;
    const box = el('div', 'card-preview'); box.dataset.cardId = String(card.id);
    const cx = parseFloat(anchor.style.left) + handSize(this.layout).w / 2;
    place(box, { x: Math.max(8, Math.min(this.layout.width - w - 8, cx - w / 2)), y: this.layout.inspect.bottom - h, w, h });
    const face = createCard(this.store, card, this.displayXp, this.state.opts.grow); face.style.transform = `scale(${s})`; box.append(face);
    const info = el('div', 'card-preview-info');
    if (card.type) info.append(el('div', 'help', TOOL_HELP[card.type]));
    if (this.playing) {
      const entry = this.predict(card); const weak = this.screen === 'adventure' && this.run ? hitsWeakness(this.run, entry.v) : false;
      const parts = [`现在打出：${REACTION[entry.k]}`, `预计 ${formatFull(entry.damage)}`]; if (weak) parts.push('削韧 1'); if (entry.guard) parts.push(`含破防 ×${RUN.guardDamage}`);
      info.append(el('div', 'predict', parts.join(' · ')));
    }
    if (info.childElementCount) box.append(info);
    this.dragLayer.append(box); this.cardPreview = box;
  }
  private hideCardPreview() { this.cardPreview?.remove(); this.cardPreview = null; this.previewSticky = false; }
  private inspectCard(card: Card) {
    const panel = this.openModal(card.type ? TOOLS[card.type].name : CARD_NAMES[card.v]); panel.classList.add('card-inspection');
    const wrap = el('div', 'inspection-card'); wrap.style.width = `${MOTION.cardW * MOTION.inspectScale}px`; wrap.style.height = `${MOTION.cardH * MOTION.inspectScale}px`;
    const face = createCard(this.store, card, this.displayXp, this.state.opts.grow); face.style.transform = `scale(${MOTION.inspectScale})`; wrap.append(face); panel.append(wrap);
    panel.addEventListener('click', () => this.closeModal());
  }
  private showRules() {
    const panel = this.openModal('规则');
    const gems = el('div', 'rule-gems'); COLORS.forEach(color => gems.append(this.store.create(`gem_icon_${color}`))); panel.append(gems);
    const rules = [
      '宝石：红是圆的，绿是方的，蓝是三角的。',
      '把手牌拖到桌上就打出去，接在这一排最右边。',
      '伤害 = 宝石底数 × 倍率 × 反应。倍率从 ×1 开始，每出一张 +1。',
      '和上一张比宝石：一样 → 同色 ×2；差一颗 → 顺色 ×2，倍率翻倍；三颗全不一样 → 凑白 ×5，倍率翻倍；差两颗 → 没反应。',
      '彩虹：顺色一路连出红、黄、绿、青、蓝、品红六种颜色，这回合 ×10，每回合一次。',
      '宝石越用越值钱：用 15 次变"切好"，底数 150；用 45 次变"闪光"，底数 200。',
      '结束回合：桌上的牌收走，倍率回到 ×1，手牌补满。',
    ];
    const list = el('ul', 'rules-list'); rules.forEach(rule => list.append(el('li', '', rule))); panel.append(list);
    const sections = [
      ['一局怎么打', '一局 6 仗：小怪、小怪、精英、小怪、小怪、首领。宝石的成长整局都在。', '怪头顶是它的血，旁边的数字是它还有几回合出手。数到 0 它就打你一下，你少 1 颗心；3 颗心都没了就输了。', '把怪的血打空就算打穿了。打穿以后这回合还能接着出牌，打得越多超杀越高。点“拿战利品”结束这一仗。'],
      ['额外牌', '额外牌也带宝石，宝石照常算伤害、照常起反应，效果是另外加的。', '口袋（绿）：摸 2 张。', '放大镜（蓝）：倍率再 ×2。', '锤子（红）：这回合到这里的伤害 ×2，最后打最划算。', '镜子（没宝石）：变成上一张缺的宝石，一定凑白。', '磨石（没宝石）：三颗宝石各长 5 次。'],
      ['战利品', '每打赢一仗，从几张额外牌里选一张放进牌组，也可以不拿、回 1 颗心。超杀到 10 倍多一张可选。打赢精英，手牌上限 +1。'],
    ];
    sections.forEach(([title,...paragraphs]) => { panel.append(el('h3','',title)); paragraphs.forEach(text=>panel.append(el('p','',text))); });
  }
  private showGrowth(i: number) {
    const f = gemForm(this.state, i); const xp = this.state.xp[i]; const panel = this.openModal(NAMES[i]);
    const image = this.store.create(`gem_${COLORS[i]}_${FORM_IDS[f]}`); image.classList.add('growth-detail-gem'); panel.append(image);
    const next = xp >= CONFIG.formAt[2] ? '已经是闪光' : xp >= CONFIG.formAt[1] ? `再用 ${CONFIG.formAt[2] - xp} 次变闪光（底数 ${CONFIG.gemValue[2]}）` : `再用 ${CONFIG.formAt[1] - xp} 次变切好（底数 ${CONFIG.gemValue[1]}）`;
    panel.append(el('p', 'growth-detail', `${NAMES[i]} · ${FORMS[f]} · 底数 ${CONFIG.gemValue[f]} · 用了 ${xp} 次 · ${next}`));
    if (!this.state.opts.grow) panel.append(el('p', 'dim', '成长已关闭，当前按原石计算，使用次数继续记录。'));
  }
  private showDeck() {
    const panel = this.openModal('牌库'); const list = el('div', 'deck-list');
    [1,2,4,3,6,5,7,0].forEach(mask => { const row = el('div', 'deck-item'); const icons = el('span', 'deck-icons'); COLORS.forEach((color, i) => { if (mask & (1 << i)) icons.append(this.store.create(`gem_icon_${color}`)); }); if (!mask) icons.textContent = '○'; row.append(icons, el('span', '', CARD_NAMES[mask]), el('strong', '', `${this.state.deck.filter(c => !c.type && c.v === mask).length} 张`)); list.append(row); });
    TOOL_TYPES.forEach(type => { const row = el('div', 'deck-item'); row.append(el('span', '', TOOLS[type].name), el('strong', '', `${this.state.deck.filter(c => c.type === type).length} 张`)); list.append(row); });
    panel.append(list, el('p', 'deck-summary', `弃牌堆 ${this.state.discard.length} 张`));
  }
  private monsterScale() {
    if (this.screen !== 'adventure' || !this.run) return this.layout.dummyScale;
    const kind = this.store.get(`mon_${this.run.monster.key}`).definition.monster ?? 'normal';
    return this.layout.monsterScale[kind];
  }
  private monsterHitPoint(): Point {
    if (this.screen !== 'adventure' || !this.run) return this.layout.floating;
    const def = this.store.get(`mon_${this.run.monster.key}`).definition; const [w,h] = dimensions(def);
    const anchor = def.anchor ?? [w/2,h]; const hit = def.hitPoint ?? [w/2,h/2]; const scale = this.monsterScale();
    return { x: this.layout.dummyAnchor.x + (hit[0]-anchor[0])*scale, y: this.layout.dummyAnchor.y + (hit[1]-anchor[1])*scale };
  }
  private buildHome() {
    const l = this.layout;
    const emblem = this.store.create('title_emblem'); this.placeAnchored(emblem, 'title_emblem', l.title.emblem, l.title.emblemScale); this.scene.append(emblem);
    const name = el('div', 'title-name', GAME_TITLE.name); name.append(el('small', '', GAME_TITLE.suffix)); place(name, l.title.name); this.scene.append(name);
    const start = this.button(this.savedRun ? '新开一局' : '开始冒险', l.title.start, () => this.savedRun ? this.confirm('新开一局', '现在这局会作废，确定新开一局吗？', '新开一局', () => this.startAdventure()) : this.startAdventure(), undefined, true); start.dataset.action = 'start';
    if (this.savedRun) this.button(`继续这局（第 ${this.savedRun.fight} 仗）`, l.title.resume, () => this.resumeAdventure()).dataset.action = 'resume';
    this.button('练习（打木桩）', l.title.practice, () => this.startPractice()).dataset.action = 'practice';
    const r = this.localRecords; const record = el('div', 'home-records'); place(record, l.title.record);
    if (!r.played) record.textContent = '还没有纪录';
    else { const farthest = r.farthest === 7 ? '已通关' : `第 ${r.farthest} 仗`; record.append(el('span', '', `最远：${farthest} · 通关 ${r.wins} 次`), el('span', '', `最高一回合 ${formatFull(r.bestTurn)} · 最大超杀 ${formatOverkill(r.maxOverkill)}`)); }
    this.scene.append(record);
    if (l.name === 'portrait') { const size = handSize(l); handPositions(5, l).forEach(p => { const back = this.store.create('card_back'); place(back, { ...p, ...size }); back.style.transform = `rotate(${p.rotation}deg)`; back.classList.add('decorative-card'); this.handLayer.append(back); }); }
  }
  private startAdventure() {
    if (this.run?.result) this.settleRecords(); this.flushSettlements();
    this.cancelDrag(); this.closeModal(); this.resetEffects(); this.transition = false;
    this.run = createRun(this.seed()); this.run.game.opts.hint = this.prefs.hint; this.state = this.run.game; this.savedRun = this.run;
    this.screen = 'adventure'; this.selectedLoot = -1; this.brokenHintShown = false; this.persist(); this.syncPresentation(); this.buildScene(); this.render(); this.enterFight();
  }
  private resumeAdventure() {
    if (!this.savedRun) return;
    this.cancelDrag(); this.closeModal(); this.resetEffects(); this.transition = false; this.run = this.savedRun; this.state = this.run.game;
    this.screen = 'adventure'; this.selectedLoot = -1; this.brokenHintShown = this.run.stats.fights.length > 0 || this.run.monster.broken;
    this.state.opts.hint = this.prefs.hint; this.syncPresentation(); this.buildScene(); this.render();
  }
  private startPractice() {
    if (this.run?.result) this.settleRecords(); this.flushSettlements();
    this.cancelDrag(); this.closeModal(); this.resetEffects(); this.transition = false; this.screen = 'practice'; this.run = null;
    this.state = createGame(this.seed(), this.ruleOptions()); this.syncPresentation(); this.buildScene(); this.render(); this.renderHand(this.state.hand.map(c => c.id));
  }
  private goHome() {
    if (this.run?.result) { this.settleRecords(); if (this.savedRun === this.run) this.savedRun = null; } this.flushSettlements();
    this.cancelDrag(); this.closeModal(); this.resetEffects(); this.transition = false;
    if (this.screen === 'adventure' && this.run && !this.run.result) { this.persist(); this.savedRun = this.run; }
    this.screen = 'home'; this.run = null; this.buildScene();
  }
  private buildAdventureTop() {
    if (!this.run) return;
    place(this.turn, this.layout.turn); this.turn.textContent = `第 ${this.run.fight} 仗 · 第 ${this.state.turn} 回合`; this.scene.append(this.turn);
    this.renderHearts();
    const p = this.layout.progress; const progress = el('div', 'fight-progress'); place(progress, { x:p.x, y:p.y-p.node/2, w:p.w, h:p.node });
    const line = el('div', 'progress-line'); progress.append(line);
    RUN.fights.forEach((fight,i) => {
      const node = el('div', 'progress-node'); const asset = fight.type === 'boss' ? 'ui_node_boss' : fight.type === 'elite' ? 'ui_node_elite' : 'ui_node_fight';
      node.append(this.store.create(asset)); place(node, { x: i*(p.w-p.node)/(RUN.fights.length-1), y:0, w:p.node, h:p.node });
      node.classList.toggle('done', i+1 < this.run!.fight || (this.run!.phase === 'loot' && i+1 === this.run!.fight)); node.classList.toggle('current', i+1 === this.run!.fight); node.setAttribute('aria-label', `第 ${i+1} 仗${i+1===this.run!.fight?'，当前':''}`); progress.append(node);
    }); this.scene.append(progress);
    if (this.run.phase !== 'battle') return;
    place(this.hpBar, this.layout.hpBar); this.hpBar.replaceChildren(); this.store.nineSlice(this.hpBar, 'ui_hp_frame', this.layout.hpBorder);
    const inner = this.store.get('ui_hp_frame').definition.inner ?? [8,8,8,8];
    const slot = el('div', 'hp-slot'); Object.assign(slot.style, { top:`${inner[0]}px`,right:`${inner[1]}px`,bottom:`${inner[2]}px`,left:`${inner[3]}px` }); slot.append(this.hpUnder,this.hpChip,this.hpFill); this.hpBar.append(slot,this.hpText); this.scene.append(this.hpBar); delete this.hpBar.dataset.layer;
    const m = this.run.monster;
    if (m.maxToughness > 0) { place(this.toughNode, this.layout.toughBar); const tb = this.layout.toughBar; const icon = this.store.create(`gem_icon_${COLORS[m.weak]}`); icon.classList.add('tough-weak'); Object.assign(icon.style, { width: `${tb.h}px`, height: `${tb.h}px` }); const pips = el('div', 'tough-pips'); pips.style.left = `${tb.h + 8}px`; this.toughNode.replaceChildren(icon, pips); this.toughNode.dataset.count = ''; this.scene.append(this.toughNode); }
    const c = this.layout.countdown; const hb = this.layout.hpBar; const coversBar = c.x - c.size/2 < hb.x + hb.w/2 && c.x + c.size/2 > hb.x; this.hpText.style.paddingLeft = this.run.monster.key === 'clock' || !coversBar ? '' : `${Math.max(0, c.x+c.size/2-hb.x)}px`; place(this.countdownNode, { x:c.x-c.size/2,y:c.y-c.size/2,w:c.size,h:c.size });
    this.countdownNode.replaceChildren(this.countdownArt,this.countdownText); if (this.run.monster.key !== 'clock') this.scene.append(this.countdownNode);
  }
  private renderHearts() {
    if (!this.run) return;
    const h = this.layout.hearts;
    for (let i=0;i<RUN.hearts;i++) {
      const id = i < this.run.hearts || i === this.losingHeart ? 'ui_heart' : 'ui_heart_empty'; let heart = this.heartNodes[i];
      if (!heart || heart.dataset.artId !== id) { if (heart instanceof SVGSVGElement) this.store.stop(heart); heart?.remove(); heart = this.store.create(id); this.heartNodes[i] = heart; this.scene.append(heart); }
      place(heart,{x:h.x+i*(h.size+h.gap),y:h.y,w:h.size,h:h.size}); heart.classList.add('adventure-heart'); heart.setAttribute('aria-label', i<this.run.hearts?'心':'空心');
    }
  }
  private renderBattleStatus() {
    if (!this.run) return;
    this.renderHearts(); const m = this.run.monster;
    // 血条不写数字：按层显示（小怪 1 层、精英 2、首领 3），每层一种颜色，当前层下面垫着下一层
    const layers = RUN.hpLayers[RUN.fights[this.run.fight - 1]!.type]; const per = m.maxHp / layers;
    const layer = m.hp > 0 ? Math.min(layers, Math.ceil(m.hp / per - 1e-9)) : 0; const fraction = layer ? (m.hp - (layer - 1) * per) / per : 0;
    const colorOf = (n: number) => n <= 1 ? 'var(--hpFill)' : HP_LAYER_COLORS[n - 1]!;
    this.hpFill.style.background = colorOf(layer); this.hpUnder.style.background = layer > 1 ? colorOf(layer - 1) : 'transparent';
    if (this.hpBar.dataset.layer !== String(layer)) { this.hpChip.style.transition = 'none'; this.hpFill.style.transition = 'none'; this.hpChip.style.transform = this.hpFill.style.transform = `scaleX(${fraction})`; void this.hpChip.offsetWidth; this.hpChip.style.transition = ''; this.hpFill.style.transition = ''; this.hpBar.dataset.layer = String(layer); }
    this.hpFill.style.transform = `scaleX(${fraction})`; this.hpChip.style.transform = `scaleX(${fraction})`;
    this.hpText.classList.toggle('broken',m.broken); this.hpText.replaceChildren();
    if (m.broken) this.hpText.textContent = `打穿了！超杀 ${formatOverkill(m.overkill)}`;
    else this.hpText.append(el('span','',MONSTERS[m.key].name), el('span','hp-layers', layers > 1 ? `×${layer}` : ''));
    this.hpBar.dataset.hp = String(m.hp); this.hpBar.setAttribute('aria-label', m.broken ? this.hpText.textContent ?? '' : `${MONSTERS[m.key].name}，还剩 ${Math.ceil(m.hp / m.maxHp * 100)}% 血${layers > 1 ? `，${layer} 层` : ''}`);
    if (m.maxToughness > 0) {
      this.toughNode.hidden = m.broken; this.toughNode.classList.toggle('guard-down', m.guardDown);
      const pips = this.toughNode.querySelector('.tough-pips'); const key = `${m.toughness}/${m.guardDown}`;
      if (pips && this.toughNode.dataset.count !== key) { this.toughNode.dataset.count = key; pips.replaceChildren(...(m.guardDown ? [el('span', 'tough-label', `破防！伤害 ×${RUN.guardDamage}`)] : Array.from({ length: m.maxToughness }, (_, i) => el('i', i < m.toughness ? 'on' : '')))); }
      this.toughNode.setAttribute('aria-label', m.guardDown ? '破防' : `弱点${NAMES[m.weak]}，韧性 ${m.toughness} / ${m.maxToughness}`);
    }
    const label = m.broken ? '拿战利品' : '结束回合'; this.endButton.lastElementChild!.textContent = label; this.endButton.setAttribute('aria-label',label); this.endButton.classList.toggle('claim-ready',m.broken);
    this.store.setStay(this.dummy,m.broken?'daze':null); this.updateCountdown(this.attacking ? 0 : m.countdown);
  }
  private updateCountdown(value: number, tick = false) {
    if (!this.run) return;
    if (this.run.monster.key === 'clock') { this.store.setSlotText(this.dummy,'countdown_slot',value); if (tick || value === 0) this.store.play(this.dummy,'tick'); return; }
    this.countdownText.textContent=String(value); this.countdownNode.setAttribute('aria-label',`还有 ${value} 回合出手`);
    this.store.setStay(this.countdownArt,value===1&&!this.run.monster.broken?'warn':null);
    if (tick || value===0) { this.store.play(this.countdownArt,'tick'); this.countdownText.animate([{scale:1.3},{scale:1}],{duration:300}); }
  }
  private banner(text: string, persistent = false) {
    const node=el('div','adventure-banner'); place(node,this.layout.banner); node.append(this.store.create('ui_banner'),el('strong','',text)); this.fxLayer.append(node);
    node.animate([{transform:'translateY(-40px)',opacity:0},{transform:'translateY(0)',opacity:1}],{duration:250,fill:'backwards'});
    if (!persistent) this.later(()=> { node.animate([{opacity:1},{opacity:0}],{duration:300,fill:'forwards'}).onfinish=()=>node.remove(); },1000);
    return node;
  }
  private enterFight() {
    if (!this.run) return;
    this.dummy.animate([{transform:'translateY(40px)',opacity:0},{transform:'translateY(0)',opacity:1}],{duration:500});
    this.banner(`第 ${this.run.fight} 仗`); this.toast(`${MONSTERS[this.run.monster.key].name}：${MONSTERS[this.run.monster.key].line}`);
    this.renderHand(this.state.hand.map(c=>c.id));
  }
  private shake(big: boolean) { const x=big?8:4,y=big?4:2; this.stage.animate([{translate:'0 0'},{translate:`${x}px ${-y}px`},{translate:`${-x}px ${y}px`},{translate:`${x}px ${y}px`},{translate:'0 0'}],{duration:big?300:200}); }
  private deathTransition() {
    if (!this.run) return;
    this.transition=true; this.rowLayer.replaceChildren(); this.handLayer.replaceChildren(); this.rowNodes.clear(); this.handNodes.clear();
    this.mult.style.opacity='0'; this.formula.style.opacity='0'; this.undoButton.hidden=true; this.deckButton.hidden=true; this.endButton.hidden=true; this.growth.forEach(g=>g.hidden=true);
    this.store.setStay(this.dummy,null); const defeated = this.dummy; const deathDuration = this.store.play(defeated,'die'); this.later(() => defeated.remove(), deathDuration);
    this.later(()=>{ this.effect('fx_overkill',this.layout.floating,undefined,1.5); const text=el('div','overkill-announcement',`超杀 ${formatOverkill(this.run!.monster.overkill)}`); text.style.left=`${this.layout.floating.x}px`;text.style.top=`${this.layout.floating.y}px`;this.fxLayer.append(text);this.later(()=>text.remove(),1300); },300);
    const finish=()=> { this.transition=false; this.resetEffects(); this.mult.style.opacity='';this.formula.style.opacity='';this.buildScene(); if (this.run?.phase==='loot') this.animateLoot(); };
    if (this.run.phase==='loot' && this.run.fight===3) this.later(()=>{ this.banner('背包变大');this.toast('手牌上限 7 → 8');this.later(finish,1200);},1800);
    else this.later(finish,1800);
  }
  private buildLoot() {
    if (!this.run) return;
    this.banner('战利品',true); this.lootCards=[];
    const chest=this.store.createInline('loot_chest');this.placeAnchored(chest,'loot_chest',this.layout.loot.chest,this.layout.monsterScale.normal);this.scene.append(chest);this.store.setStay(chest,'open');
    const points=this.run.loot.length===4?this.layout.loot.four:this.layout.loot.three;
    this.run.loot.forEach((type,i)=>{
      const card=el('button','loot-card') as HTMLButtonElement;card.type='button';card.dataset.lootIndex=String(i);card.setAttribute('aria-label',`${i+1} ${TOOLS[type].name}，点一下选中，再点一下拿走`);
      place(card,{...points[i],w:MOTION.cardW*this.layout.loot.scale,h:MOTION.cardH*this.layout.loot.scale});
      const face=createCard(this.store,createToolCard(type,-i-1),this.state.xp,true);face.style.transform=`scale(${this.layout.loot.scale})`;card.append(face);card.addEventListener('click',()=>this.selectLoot(i));this.scene.append(card);this.lootCards.push(card);
    });
    place(this.lootHint,this.layout.loot.hint);this.scene.append(this.lootHint);this.updateLootSelection();
    this.button(this.run.hearts<RUN.hearts?'不拿，回 1 颗心':'不拿',this.layout.loot.skip,()=>this.takeLoot(-1),this.run.hearts<RUN.hearts?'ui_heart':undefined).dataset.action='skip-loot';
  }
  private animateLoot() {
    const chest=this.scene.querySelector<SVGSVGElement>('[data-art-id="loot_chest"]');if (chest) {this.store.stop(chest);this.store.play(chest,'drop');this.later(()=>this.store.setStay(chest,'open'),500);}
    this.lootCards.forEach((node,i)=>{
      const face=node.firstElementChild as HTMLElement;const back=this.store.create('card_back');back.classList.add('loot-card-back');node.append(back);face.style.visibility='hidden';
      node.animate([{transform:`translate(${this.layout.loot.chest.x-parseFloat(node.style.left)}px,${this.layout.loot.chest.y-parseFloat(node.style.top)}px) scale(.3)`,opacity:0},{transform:'translate(0,0) scale(1)',opacity:1}],{duration:400,delay:700+i*120,fill:'backwards'});
      this.later(()=>{node.animate([{scale:'1 1'},{scale:'0 1'},{scale:'1 1'}],{duration:300});this.later(()=>{back.remove();face.style.visibility='';},150);},1100+i*120);
    });
  }
  private updateLootSelection() {
    if (!this.run) return;
    this.lootCards.forEach((node,i)=>{node.classList.toggle('selected',i===this.selectedLoot);node.setAttribute('aria-pressed',String(i===this.selectedLoot));});
    this.lootHint.textContent=this.selectedLoot>=0?'再点一下拿走':this.run.monster.overkill>=RUN.lootBonusOverkill?`超杀 ${formatOverkill(this.run.monster.overkill)}！多一张可选`:'选一张放进牌组';
  }
  private selectLoot(index: number, confirm = true) { if (this.transition || this.run?.phase!=='loot' || !this.run.loot[index]) return;if (this.selectedLoot===index&&confirm) this.takeLoot(index);else {this.selectedLoot=index;this.updateLootSelection();} }
  private takeLoot(index: number) {
    if (this.transition||this.run?.phase!=='loot') return;
    const beforeHearts=this.run.hearts;const node=this.lootCards[index];this.resetEffects();this.transition=true;
    if (index<0) skipLoot(this.run);else chooseLoot(this.run,index);
    this.state=this.run.game;this.persist();
    this.lootCards.forEach((card,i)=>{ if (i===index) {card.animate([{transform:'translateY(-40px) scale(1.15)'},{transform:`translate(${this.layout.deck.x-parseFloat(card.style.left)}px,${this.layout.deck.y-parseFloat(card.style.top)}px) scale(.3)`,opacity:0}],{duration:500,fill:'forwards'});}else card.animate([{opacity:1},{opacity:0}],{duration:300,fill:'forwards'});});
    if (this.run.hearts>beforeHearts) {this.renderHearts();const heart=this.heartNodes[beforeHearts];if (heart instanceof SVGSVGElement)this.store.play(heart,'gain');const h=this.layout.hearts;this.effect('fx_heal',{x:h.x+beforeHearts*(h.size+h.gap)+h.size/2,y:h.y+h.size/2});}
    if (node) {const count=this.roundButton('牌库',this.layout.deck,()=>{},'ui_icon_deck');count.disabled=true;const n=el('span','count-bubble',String(this.run.cards.length));count.append(n);n.animate([{scale:1.4},{scale:1}],{duration:300});}
    this.later(()=>{this.transition=false;this.selectedLoot=-1;this.resetEffects();this.syncPresentation();this.buildScene();this.render();this.enterFight();},index<0?Math.max(600,this.store.get('fx_heal').definition.events?.play ?? 700):500);
  }
  private buildResult() {
    const result=this.run?.result;if(!result)return;
    this.banner(result.outcome==='victory'?'胜利':'失败',true);
    const panel=el('section','result-panel');place(panel,this.layout.result.panel);this.store.nineSlice(panel,'ui_panel',48);
    if(result.outcome==='defeat')panel.append(el('div','result-heading',`倒在第 ${result.fight} 仗 · ${MONSTERS[result.monster].name}`));
    else if(result.newRecords.farthest)panel.append(el('div','result-heading','通关！ 新纪录'));
    const countRows: { node: HTMLElement; value: number; format: (n:number)=>string }[] = [];
    const add=(label:string,value:string,record=false,count?:{value:number;format:(n:number)=>string})=>{const row=el('div','result-row');const number=el('strong','',value);row.append(el('span','',label),number);if(record)row.append(el('em','new-record','新纪录'));panel.append(row);if(count)countRows.push({node:number,...count});};
    add(`打了 ${result.totalTurns} 回合`,'');add('最高一回合',`${formatFull(result.bestTurn)}   第 ${result.bestFight} 仗`,result.newRecords.bestTurn,{value:result.bestTurn,format:n=>`${formatFull(n)}   第 ${result.bestFight} 仗`});add('最大超杀',formatOverkill(result.maxOverkill),result.newRecords.maxOverkill,{value:result.maxOverkill,format:formatOverkill});add('总伤害',formatFull(result.totalDamage),false,{value:result.totalDamage,format:formatFull});
    add('宝石',result.gemForms.map((f,i)=>`${['红','绿','蓝'][i]} ${FORMS[f]}`).join(' · '));
    const extras=TOOL_TYPES.map(t=>{const n=result.extraCards.filter(c=>c.type===t).length;return n?`${TOOLS[t].name}${n>1?` ×${n}`:''}`:'';}).filter(Boolean).join(' · ');add('拿到的额外牌',extras||'没有');
    this.scene.append(panel);panel.animate([{transform:'translateY(60px)',opacity:0},{transform:'translateY(0)',opacity:1}],{duration:400});
    panel.querySelectorAll('.result-row').forEach((row,i)=>row.animate([{opacity:0,transform:'translateY(12px)'},{opacity:1,transform:'translateY(0)'}],{duration:300,delay:i*300,fill:'backwards'}));
    countRows.forEach((count,i)=>{for(let step=0;step<=10;step++)this.later(()=>{count.node.textContent=count.format(count.value*step/10);},(i+1)*300+step*30);});
    this.button('回首页',this.layout.result.home,()=>this.goHome()).dataset.action='home';this.button('再来一局',this.layout.result.again,()=>this.startAdventure(),undefined,true).dataset.action='again';
  }
  private showMonster() { if(!this.run)return;const m=this.run.monster;const panel=this.openModal('怪的介绍');panel.append(el('h3','',MONSTERS[m.key].name),el('p','',MONSTERS[m.key].line),el('p','',`血量 ${formatFull(m.hp)} / ${formatFull(m.maxHp)} · 每 ${m.maxCountdown} 回合出手一次`),el('p','',m.maxToughness?`弱点：${NAMES[m.weak]}。打出带${NAMES[m.weak]}的牌，韧性 −1；韧性打空就破防，这回合剩下的牌伤害 ×${RUN.guardDamage}，下回合韧性回满。`:'')); }
  private debugRefresh() {this.cancelDrag();this.closeModal();this.resetEffects();this.transition=false;this.syncPresentation();this.buildScene();this.render();this.persist();}
  private debugJumpFight(fight:number) {
    if(!this.debugEnabled||!Number.isInteger(fight)||fight<1||fight>6)return;
    this.startAdventure();
    while(this.run!.fight<fight){this.run!.monster.broken=true;this.run!.monster.hp=0;endRunTurn(this.run!);skipLoot(this.run!);}
    this.state=this.run!.game;this.debugRefresh();
  }
  private debugHp(value:number) {if(!this.debugEnabled||!this.run||this.run.phase!=='battle'||!Number.isFinite(value)||value<1)return;this.run.monster.hp=value;this.run.monster.maxHp=Math.max(value,this.run.monster.maxHp);this.run.monster.turnStartHp=value;this.run.monster.broken=false;this.run.monster.overkill=0;this.run.hist=[];this.state.hist=[];this.debugRefresh();}
  private debugToughness(value:number) {const m=this.run?.monster;if(!this.debugEnabled||!m||!Number.isInteger(value)||value<1||value>m.maxToughness)return;m.toughness=value;m.guardDown=false;this.debugRefresh();}
  private debugHearts(value:number) {if(!this.debugEnabled||!this.run||!Number.isInteger(value)||value<1||value>3)return;this.run.hearts=value;this.debugRefresh();}
  private debugGiveTool(type:ToolType) {if(!this.debugEnabled||!TOOL_TYPES.includes(type))return;if(!this.playing)this.startPractice();const cards=this.run?.cards??[...this.state.deck,...this.state.hand,...this.state.row,...this.state.discard];const card=createToolCard(type,Math.max(0,...cards.map(c=>c.id))+1);if(this.run)this.run.cards.push({...card});this.state.hand.push(card);this.state.hist=[];if(this.run)this.run.hist=[];this.debugRefresh();}
  private debugDeal(sequence: readonly (number|ToolType)[], test?:number) {
    if(!this.debugEnabled)return;if(!this.playing)this.startPractice();
    const original=this.run?.cards??[...this.state.deck,...this.state.hand,...this.state.row,...this.state.discard].map(c=>c.type?createToolCard(c.type,c.id):{...c});const pool=original.map(c=>({...c}));const hand:Card[]=[];let id=Math.max(0,...pool.map(c=>c.id));
    for(const value of sequence){if(typeof value==='number'&&(!Number.isInteger(value)||value<0||value>7))throw new Error('宝石位必须是 0–7');if(typeof value==='string'&&!TOOL_TYPES.includes(value))throw new Error('未知额外牌');const at=pool.findIndex(c=>typeof value==='number'?!c.type&&c.v===value:c.type===value);if(at>=0)hand.push(pool.splice(at,1)[0]);else{const card=typeof value==='number'?{id:++id,v:value}:createToolCard(value,++id);hand.push(card);if(this.run)this.run.cards.push({...card});}}
    this.state.hand=hand;this.state.deck=pool;this.state.row=[];this.state.discard=[];this.state.hist=[];this.state.m=1;this.state.turnDmg=0;this.state.rainbow=false;this.state.chain=[];this.state.chainIdx=[];this.state.xp=test===11?[10,0,0]:[0,0,0];
    if(this.run){this.run.hist=[];this.run.monster.broken=false;this.run.monster.hp=this.run.monster.maxHp;this.run.monster.turnStartHp=this.run.monster.hp;this.run.monster.overkill=0;}
    this.debugRefresh();if(test)this.toast(`用例 ${test}：按手牌从左到右出牌`);
  }
  private buildDebug(panel:HTMLElement) {
    panel.append(el('h3','','测试入口（仅 debug=1）'));
    const fights=el('div','debug-actions');for(let n=1;n<=6;n++){const button=el('button','',`第 ${n} 仗`);button.dataset.debugFight=String(n);button.addEventListener('click',()=>this.debugJumpFight(n));fights.append(button);}panel.append(fights);
    const inputRow=(label:string,value:string,apply:(v:string)=>void)=>{const row=el('div','setting-row debug-input');const input=document.createElement('input');input.value=value;input.setAttribute('aria-label',label);const button=el('button','',label);button.addEventListener('click',()=>{try{apply(input.value);}catch(error){this.toast(error instanceof Error?error.message:'输入不正确');}});row.append(input,button);panel.append(row);};
    if(this.run?.phase==='battle'){inputRow('设怪的血',String(this.run.monster.hp),v=>this.debugHp(Number(v)));inputRow('设心（1–3）',String(this.run.hearts),v=>this.debugHearts(Number(v)));if(this.run.monster.maxToughness)inputRow('设韧性',String(this.run.monster.toughness),v=>this.debugToughness(Number(v)));}
    const tools=el('div','debug-actions');TOOL_TYPES.forEach(type=>{const button=el('button','',`给一张${TOOLS[type].name}`);button.addEventListener('click',()=>this.debugGiveTool(type));tools.append(button);});panel.append(tools);
    inputRow('发指定的牌','1,3,2,6,4,5,hammer',v=>this.debugDeal(v.split(/[\s,，]+/).filter(Boolean).map(v=>/^\d+$/.test(v)?Number(v):v as ToolType)));
    const cases=el('div','debug-actions');Object.keys(DEBUG_SEQUENCES).forEach(key=>{const button=el('button','',`用例 ${key} 发牌`);button.dataset.debugCase=key;button.addEventListener('click',()=>this.debugDeal(DEBUG_SEQUENCES[Number(key)],Number(key)));cases.append(button);});panel.append(cases);
  }
  private installDebug() {
    const api={snapshot:()=>JSON.parse(JSON.stringify(this.state)) as GameState,runSnapshot:()=>this.run?JSON.parse(JSON.stringify(this.run)) as RunState:null,screen:()=>this.screen,
      startAdventure:()=>this.startAdventure(),practice:()=>this.startPractice(),goHome:()=>this.goHome(),resume:()=>this.resumeAdventure(),debugJumpFight:(n:number)=>this.debugJumpFight(n),setMonsterHp:(n:number)=>this.debugHp(n),setHearts:(n:number)=>this.debugHearts(n),giveTool:(type:ToolType)=>this.debugGiveTool(type),dealCards:(sequence:(number|ToolType)[])=>this.debugDeal(sequence),scenario:(n:number)=>this.debugDeal(DEBUG_SEQUENCES[n],n),
      deal:(n:number)=>this.debugDeal(DEBUG_SEQUENCES[n],n),endTurn:()=>this.finishTurn(),play:(index=0)=>this.playById(this.state.hand[index]?.id),undo:()=>this.rewind(),end:()=>this.finishTurn(),chooseLoot:(index:number)=>this.takeLoot(index),selectLoot:(index:number)=>this.selectLoot(index),skipLoot:()=>this.takeLoot(-1),records:()=>({...this.localRecords})};
    Object.assign(window,{__gemcard:api});
  }
  private showSettings() {
    const panel = this.openModal('设置');
    const addChoice = (title: string, choices: { label: string; value: string | number | boolean }[], current: string | number | boolean, select: (v: string | number | boolean) => void) => {
      const row = el('div', 'setting-row'); row.append(el('span', '', title)); const group = el('div', 'choice-group');
      choices.forEach(choice => { const button = document.createElement('button'); button.textContent = choice.label; button.className = choice.value === current ? 'selected' : ''; button.setAttribute('aria-pressed', String(choice.value === current)); button.addEventListener('click', () => { this.resetEffects(); this.transition = false; select(choice.value); this.savePreferences(); this.persist(); this.syncPresentation(); this.buildScene(); this.render(); this.showSettings(); }); group.append(button); }); row.append(group); panel.append(row);
    };
    addChoice('提示', [{ label: '开', value: true }, { label: '关', value: false }], this.prefs.hint, value => { this.prefs.hint = Boolean(value); updateSettings(this.state, { hint: this.prefs.hint }); });
    addChoice('布局', [{ label: '自动', value: 'auto' }, { label: '竖屏', value: 'portrait' }, { label: '横屏', value: 'landscape' }], this.prefs.layout, value => { this.prefs.layout = value as LayoutChoice; this.resize(); });
    if (new URLSearchParams(location.search).has('layout')) panel.append(el('p', 'dim', '网址的 layout 参数优先于布局设置。'));
    if (this.screen === 'practice') {
      addChoice('手牌', [6,7,8].map(value => ({ label: String(value), value })), this.prefs.hand, value => { this.prefs.hand = Number(value) as 6|7|8; updateSettings(this.state, { hand: this.prefs.hand }); });
      addChoice('成长', [{ label: '开', value: true }, { label: '关', value: false }], this.prefs.grow, value => { this.prefs.grow = Boolean(value); updateSettings(this.state, { grow: this.prefs.grow }); });
      addChoice('额外牌', [{ label: '不带', value: false }, { label: '每种 1 张', value: true }], this.prefs.tools, value => { this.prefs.tools = Boolean(value); updateSettings(this.state, { tools: this.prefs.tools }); });
      this.modalAction(panel, '成长清零', () => { resetGrowth(this.state); this.resetEffects(); this.syncPresentation(); this.render(); this.closeModal(); this.toast('宝石成长已清零'); });
      this.modalAction(panel, '重新开始', () => this.confirm('重新开始', '重新开始会清掉这局的回合、伤害和宝石成长', '确认重新开始', () => this.startPractice()));
      this.modalAction(panel, '回首页', () => this.goHome());
    } else if (this.screen === 'adventure' && this.run && !this.run.result) this.modalAction(panel, '放弃这局', () => this.confirm('放弃这局', '放弃以后这局算输，确定吗？', '放弃', () => { abandonRun(this.run!); this.settleRecords(); this.goHome(); }));
    if (this.debugEnabled) this.buildDebug(panel);
  }
  private modalAction(panel: HTMLElement, label: string, action: () => void) { const actions = el('div', 'settings-actions'); const button = document.createElement('button'); button.textContent = label; button.addEventListener('click', action); actions.append(button); panel.append(actions); return button; }
  private confirm(title: string, text: string, label: string, action: () => void) { const panel = this.openModal(title); panel.append(el('p', '', text)); this.modalAction(panel, label, () => { this.closeModal(); action(); }); this.modalAction(panel, '算了', () => this.closeModal()); }
}
