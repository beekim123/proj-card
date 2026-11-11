import { dimensions, type ArtStore } from '../art';
import { CONFIG, displayedRule, canDoubleTool, debugEnterShop, debugJumpRoom, debugSetDoors, debugGiveTool as giveRunTool, debugFillHand, debugSetSealed, doorOptions, chooseDoor, shopState, canCopyCard, shopDrop, shopCopy, shopSkip, ruleSealed, createGame, playCard, previewCard, undo, endTurn, updateSettings, resetGrowth, gemForm, formatFormula, formatNumber, formatFull, formatCardHint, previewRunCard, cardWarnings, bestHintCard, rainbowStatus, currentRule, previewCountdown, growthThresholds, chooseRelic, debugGiveRelic, debugSetMonsterHp, debugSetCountdown, debugSetWind, debugRelicSelection, RELICS, RULES, createRun, playRunCard, undoRun, endRunTurn, chooseLoot, skipLoot, abandonRun, createToolCard, formatOverkill, MONSTERS, RUN, TOOLS, TOOL_TYPES, type Card, type RowEntry, type GameState, type RunState, type RunRecords, type ToolType, type RelicId } from '../rules';
import { loadRun, saveRun, loadRecords, recordResult, loadSettings, saveSettings, type Settings } from '../save';
import { portrait } from '../layout/portrait';
import { landscape } from '../layout/landscape';
import { fitLayout } from '../layout/fit';
import { MOTION, ROW, handSize, rowSize, growthRects, type Layout, type Point, type Rect } from '../layout/types';
import { CARD_NAMES, createCard, playCardArt } from './card';
import { handPositions, handScale, rowPositions } from './geometry';
import { SoundSystem } from './sound';
import { FeelSystem } from './feel';
import { scoreAt } from './presentation';

const COLORS = ['red', 'green', 'blue'] as const;
const NAMES = ['红宝石', '绿宝石', '蓝宝石'];
const FORMS = ['原石', '切好', '闪光'];
const FORM_IDS = ['rough', 'cut', 'shine'];
const REACTION = { plain: '普通', same: '同色', shun: '顺色', white: '凑白' };
/** 手牌大图里额外牌的效果说明 */
const TOOL_HELP: Record<ToolType, string> = {
  bag: '打出后从牌库摸 2 张。', lens: '打出后倍率再 ×2。', hammer: '打出后，这回合到这里的伤害 ×3。',
  hourglass: '倒计时 +1。打穿了就不加。', seal: '从下一张牌起，到这回合结束。', shadow: '宝石和反应都照抄上一张。第一张打它，什么都没有。', whistle: '从牌堆里找最上面的一张额外牌。牌堆里没有就不摸。',
  mirror: '变成上一张缺的宝石，一定和上一张凑白；这回合第一张打出时没有宝石。', stone: '打出后三颗宝石各长 5 次。',
};
/** 多层血条每层的颜色（第 1 层是最后打的那层） */
const HP_LAYER_COLORS = ['', '#C7742B', '#8A4FC4'];
/** 按“打出去”后的连打节奏（毫秒）：第一张间隔 firstGap，之后每张乘 decay，最快 minGap；所有间隔加起来最多 maxTotal */
/** 摸牌动画（毫秒）：每张间隔、飞行、翻面，弧线抬高多少设计像素 */
const DRAW = { interval: 90, fly: 380, flip: 180, arc: 140 };
const STRIKE = { lead: 80, firstGap: 230, decay: 0.86, minGap: 110, maxTotal: 2600, hold: 520, breakHold: 700, lift: 36 };
const DEBUG_SEQUENCES: Record<number, (number | ToolType)[]> = { 1: [1,'lens'], 2: [3,'lens'], 3: [1,3,'hammer'], 4: [1,3,2,6,4,5,'hammer'], 5: [1,3,2,6,'lens',5], 6: [1,'mirror'], 7: [0,'mirror'], 8: ['mirror'], 9: [7,'mirror'], 10: [1,'mirror',1], 11: ['stone',1], 12: ['hammer','hammer'], 13: [1,'bag'], 14: [1,3,2,6,4,'mirror'] };
const GAME_TITLE = { name: '新卡牌', suffix: '（暂名）' }; 
type LayoutChoice = 'auto' | 'portrait' | 'landscape';
type Preferences = Settings;
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
  private selectedDoor = -1;
  private shopMode: 'drop' | 'copy' | null = null;
  private shopSelected: number[] = [];

  private brokenHintShown = false;
  private heartNodes: (HTMLElement | SVGSVGElement)[] = [];
  private hpFill = el('div', 'hp-fill');
  private hpChip = el('div', 'hp-chip');
  private hpText = el('div', 'hp-text');
  private hpBar = el('div', 'hp-bar');
  private hpUnder = el('div', 'hp-under');
  private ruleSign!: SVGSVGElement;
  private ruleButton = el('button', 'rule-sign') as HTMLButtonElement;
  private monsterMotion = el('div', 'monster-motion');
  private relicNodes = new Map<string, HTMLElement>();
  private rainbowSlots: SVGSVGElement[] = [];
  private rainbowReady = el('div', 'rainbow-ready', '这手能出彩虹');
  private countdownPreview = el('span', 'countdown-preview');
  private rainbowLit = new Set<number>();
  private rainbowTriggered = false;
  private selectedRelic = -1;
  private countdownFlashId = 0;
  private readonly sound: SoundSystem;
  private readonly feel: FeelSystem;
  private cardPreview: HTMLElement | null = null;
  private previewSticky = false;
  private countdownArt: SVGSVGElement;
  private countdownText = el('strong', 'countdown-number');
  private countdownNode = el('div', 'countdown');
  private endButton!: HTMLButtonElement;
  private lootCards: HTMLElement[] = [];
  /** 选中以后才能按的“拿 / 拿这件” */
  private takeButton: HTMLButtonElement | null = null;
  private lootHint = el('div', 'loot-hint');
  private saveWarningShown = false;
  private pendingSettlements: RunState[] = [];
  private floatIndex = 0;
  private losingHeart = -1;
  private healingHearts: number | null = null;
  private attacking = false;
  private pendingDrawIds = new Set<number>();
  /** 排牌阶段不打怪；按“打出去”后按顺序一张张打。strikeHp 是演出中血条显示的血 */
  private striking = false;
  private strikeHp: number | null = null;
  private arrangeHintShown = false;
  private hpGhost = el('div', 'hp-ghost');
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
  private activeToast: HTMLElement | null = null;
  private epoch = 0;

  constructor(root: HTMLElement, store: ArtStore) {
    this.store = store;
    this.stage.style.setProperty('--rainbow-colors', [1,3,2,6,4,5].map(mask => store.manifest.palette.mix[String(mask)]).join(','));
    this.stage.style.setProperty('--gem-red', store.manifest.palette.gem.red.mid);
    this.stage.style.setProperty('--gem-green', store.manifest.palette.gem.green.mid);
    this.stage.style.setProperty('--gem-blue', store.manifest.palette.gem.blue.mid);
    this.stage.style.setProperty('--gem-white', store.manifest.palette.mix['7'] ?? store.manifest.palette.text);
    this.prefs = loadSettings();
    this.sound = new SoundSystem(this.prefs); this.sound.bindUnlock(document);
    this.feel = new FeelSystem({ stage: this.stage, fxLayer: this.fxLayer }, this.prefs);
    this.stage.addEventListener('click', e => { if ((e.target as Element).closest('button')) this.sound.button(); });
    const restored = loadRun(); this.savedRun = restored.state;
    this.localRecords = loadRecords();
    this.state = createGame(this.seed(), this.ruleOptions());
    this.syncPresentation();
    this.dummy = store.createInline('dummy');
    this.badge = store.createInline('ui_mult_badge');
    this.countdownArt = store.createInline('ui_countdown');
    this.ruleSign = store.createInline('ui_rule_sign'); this.ruleButton.type = 'button'; this.ruleButton.addEventListener('click', () => this.showMonster());
    this.viewport.append(this.stage);
    this.stage.id = 'stage'; this.stage.setAttribute('aria-label', '宝石卡牌冒险');
    this.stage.append(this.scene, this.rowLayer, this.handLayer, this.fxLayer, this.dragLayer, this.overlayLayer);
    root.replaceChildren(this.viewport);
    document.body.style.backgroundImage = `radial-gradient(ellipse 80% 75% at 50% 45%, transparent 45%, rgba(7,9,15,.82) 100%), url("${store.imageUrl('bg_tile')}")`;
    this.stage.addEventListener('pointerdown', this.onPointerDown);
    this.formulaToggle.type = 'button'; this.formulaToggle.addEventListener('click', () => { this.prefs.formula = !this.prefs.formula; this.savePreferences(); this.renderFormula(); });
    this.handLayer.addEventListener('pointerover', e => { if (e.pointerType !== 'mouse' || this.drag || this.modal || this.previewSticky) return; const node = (e.target as Element).closest<HTMLElement>('.hand-card'); const card = this.state.hand.find(c => c.id === Number(node?.dataset.cardId)); if (node && card) this.showCardPreview(card, node, false); });
    this.handLayer.addEventListener('pointerout', e => { if (e.pointerType !== 'mouse' || this.previewSticky) return; const from = (e.target as Element).closest('.hand-card'); const to = (e.relatedTarget as Element | null)?.closest?.('.hand-card'); if (from && from !== to) this.hideCardPreview(); });
    this.rowLayer.addEventListener('click', e => { if (!this.playing || this.drag) return; const node = (e.target as Element).closest<HTMLElement>('.row-card:not(.row-preview)'); const index = this.state.row.findIndex(c => c.id === Number(node?.dataset.cardId)); if (index >= 0) this.rewindTo(index); });
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
    else if (restored.clear) this.toast(restored.reason === 'outdated' ? '游戏更新了，上次那局没法接着打，已经清掉了' : '上次的进度读不出来，已经清掉了');
    window.addEventListener('pagehide', () => this.persist());
    document.addEventListener('visibilitychange', () => { if (document.hidden) { this.cancelDrag(); this.persist(); } });
    if (this.debugEnabled) this.installDebug();

  }

  private get debugEnabled() { return new URLSearchParams(location.search).get('debug') === '1'; }
  private get playing() { return !this.striking && (this.screen === 'practice' || (this.screen === 'adventure' && this.run?.phase === 'battle' && !this.transition)); }
  private seed() { const requested = new URLSearchParams(location.search).get('seed'); return requested !== null && Number.isFinite(Number(requested)) ? Number(requested) >>> 0 : Date.now() >>> 0; }
  private ruleOptions() { const { hint, hand, grow, tools } = this.prefs; return { hint, hand, grow, tools }; }
  private savePreferences() { this.sound.configure(this.prefs); this.feel.configure(this.prefs); if (!saveSettings(this.prefs)) this.storageWarning(); }
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
    this.losingHeart = -1; this.healingHearts = null; this.attacking = false; this.pendingDrawIds.clear(); this.striking = false; this.strikeHp = null;
    this.epoch++; this.timers.forEach(clearTimeout); this.timers.clear(); cancelAnimationFrame(this.scoreAnimation);
    this.stage.querySelectorAll('.temporary-mirror,.dealing-card-back,.loot-card-back').forEach(node => node.remove()); this.stage.querySelectorAll<HTMLElement>('.gem-card').forEach(node => { node.style.visibility = ''; });
    this.fxLayer.replaceChildren(); this.dragLayer.replaceChildren(); this.activeToast = null; this.feel.reset();
    this.store.stop(this.dummy); this.store.stop(this.badge); this.store.stop(this.countdownArt); this.store.stop(this.ruleSign); this.monsterMotion.style.zIndex = ''; this.countdownNode.classList.remove('countdown-red','countdown-green');
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
    if (changed) { this.transition = false; this.cancelDrag(); this.closeModal(); this.resetEffects(); this.syncPresentation(); }
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
    if (this.screen === 'adventure' && this.run?.phase === 'relic') { this.buildAdventureTop(); this.buildRelicPick(); return; }
    if (this.screen === 'adventure' && this.run?.phase === 'doors') { this.buildAdventureTop(); this.buildDoors(); return; }
    if (this.screen === 'adventure' && this.run?.phase === 'shop') { this.buildAdventureTop(); this.buildShop(); return; }
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
    place(this.monsterMotion, { x: 0, y: 0, w: l.width, h: l.height });
    this.monsterMotion.style.transformOrigin = `${l.dummyAnchor.x}px ${l.dummyAnchor.y}px`;
    this.monsterMotion.replaceChildren(this.dummy); this.scene.insertBefore(this.monsterMotion, table);
    if (this.screen === 'adventure') this.buildAdventureTop();
    this.buildRainbow();
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
    if (this.screen === 'practice') this.setEndLabel(this.state.row.length ? '打出去' : '结束回合');
    this.deckCount.textContent = String(this.state.deck.length); this.deckButton.setAttribute('aria-label', `牌库 ${this.state.deck.length} 张`);
    this.renderGrowth(); this.renderRow(); this.renderHand(); this.renderFormula(); this.renderRainbow();
  }
  private renderGrowth() {
    const NS = 'http://www.w3.org/2000/svg';
    const thresholds = growthThresholds(this.run ?? this.state);
    this.growth.forEach((socket, i) => {
      const l = this.layout.growth; const form = !this.state.opts.grow ? 0 : this.displayXp[i] >= thresholds[2] ? 2 : this.displayXp[i] >= thresholds[1] ? 1 : 0;
      const xp = this.displayXp[i];
      const progress = xp >= thresholds[2] ? 100 : xp >= thresholds[1] ? (xp - thresholds[1]) / (thresholds[2] - thresholds[1]) * 100 : xp / thresholds[1] * 100;
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
        if (fill && socket.classList.contains('stone-growth') && xp > oldXp) socket.animate([{filter:'brightness(1)'},{filter:'brightness(1.5)'},{filter:'brightness(1)'}],{duration:600});
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
      const key = `${entry.v}:${entry.type}:${this.displayXp.map((_, i) => gemForm(this.state, i)).join(',')}:${this.state.opts.grow}`;
      if (node.dataset.faceKey !== key) { const card = createCard(this.store, entry, this.displayXp, this.state.opts.grow, { static: true, resolved: true, thresholds: growthThresholds(this.run ?? this.state) }); card.style.transform = `scale(${this.layout.rowScale})`; node.replaceChildren(card); node.dataset.faceKey = key; }
      node.querySelectorAll('.reaction-label,.card-damage,.card-details').forEach(n => n.remove()); node.dataset.cardId = String(entry.id);
      if ((!preview || this.state.opts.hint) && entry.k !== 'plain' && p.showLabel) {
        const label = el('div', 'reaction-label', REACTION[entry.k]); label.style.top = `${-ROW.labelOffset}px`; node.append(label);
      }
      if (!preview || this.state.opts.hint) {
        const damage = el('div', 'card-damage', `${preview ? '预计 ' : ''}${formatFull(entry.damage)}`); damage.dataset.damage = String(entry.damage); damage.style.top = `${size.h + ROW.damageGap}px`; node.append(damage);
        const details = el('div', 'card-details');
        details.style.top = `${size.h + ROW.damageGap + 32}px`;
        if (entry.rainbow) details.append(el('div', 'card-bonus rainbow-text', `彩虹 +${formatFull(entry.rainbow)}`));
        if (entry.hammer) details.append(el('div', 'card-bonus', `锤子 +${formatFull(entry.hammer)}`));
        const effects = el('div', 'card-effects');
        entry.effects?.filter(effect => effect.id in RULES || effect.id === 'layers' || effect.id in RELICS || effect.id in TOOLS).forEach(effect => effects.append(el('span', `effect-label ${effect.id in RELICS ? 'relic-effect' : 'rule-effect'}`, effect.id === 'twice' ? '打两次' : effect.text)));
        details.append(effects); node.append(details);
      }
    });
  }
  private renderHand(newIds: number[] = [], drawInterval: number = DRAW.interval) {
    if (!this.playing) return;
    const cards = this.state.hand.filter(card => !this.pendingDrawIds.has(card.id) && !(this.drag?.dragging && this.drag.id === card.id));
    const keep = new Set(cards.map(card => card.id));
    for (const [id, node] of this.handNodes) if (!keep.has(id)) { node.remove(); this.handNodes.delete(id); }
    const best = bestHintCard(this.run ?? this.state); const rainbow = rainbowStatus(this.run ?? this.state);
    const positions = handPositions(cards.length, this.layout); const scale = handScale(cards.length, this.layout); const size = { w: MOTION.cardW * scale, h: MOTION.cardH * scale };
    cards.forEach((card, i) => {
      let node = this.handNodes.get(card.id);
      if (!node) { node = el('div', 'hand-card'); node.tabIndex = 0; node.setAttribute('role', 'button'); this.handNodes.set(card.id, node); this.handLayer.append(node); }
      const p = positions[i]; place(node, { x: p.x, y: p.y, w: size.w, h: size.h }); node.style.transform = `rotate(${p.rotation}deg)`; node.style.zIndex = String(i + 1); node.dataset.cardId = String(card.id); node.dataset.mask = String(card.v);
      node.classList.toggle('picked', this.drag?.id === card.id && !this.drag.dragging);
      if (this.drag?.id === card.id && !this.drag.dragging) { node.style.zIndex = '200'; node.style.transform = `translateY(${-MOTION.handLift}px) scale(${MOTION.handPickScale})`; }
      const shown = card.type === 'shadow' || card.type === 'mirror' ? { ...card, v: this.predict(card).v } : card;
      const face = createCard(this.store, shown, this.displayXp, this.state.opts.grow, { thresholds: growthThresholds(this.run ?? this.state), resolved: shown !== card }); face.style.transform = `scale(${scale})`; node.replaceChildren(face); node.setAttribute('aria-label', `${face.getAttribute('aria-label')}。拖到桌面出牌，点按查看。`);
      const hintEntry = this.predict(card);
      const chosen = this.state.opts.hint && best === card.id;
      node.classList.toggle('has-hint', chosen);
      node.classList.toggle('rainbow-candidate', rainbow.ready && rainbow.readyIds.includes(card.id));
      const warnings = this.run ? cardWarnings(this.run, card) : { attack: false, unwind: false };
      const tags = el('div', 'hand-tags'); tags.style.bottom = `calc(100% + ${MOTION.hintOffset / 4}px)`;
      if (chosen) tags.append(el('span', 'hand-hint', formatCardHint(hintEntry)));
      if (warnings.attack) tags.append(el('span', 'hand-warning attack-warning', '会挨打'));
      if (warnings.unwind) tags.append(el('span', 'hand-warning unwind-warning', '松发条'));
      if(this.run && canDoubleTool(this.run,card))node.append(el('span','twice-badge','×2'));
      node.append(tags);
      if (newIds.includes(card.id)) {
        // 摸牌：牌背从牌库按钮飞出来，划一道弧落到手里，落下后翻面
        const delay = newIds.indexOf(card.id) * drawInterval; const target = node;
        const back = this.store.create('card_back'); back.classList.add('dealing-card-back'); Object.assign(back.style, { width: `${size.w}px`, height: `${size.h}px` }); face.style.visibility = 'hidden'; node.append(back);
        const from = { x: this.layout.deck.x + this.layout.deck.w / 2 - p.x - size.w / 2, y: this.layout.deck.y + this.layout.deck.h / 2 - p.y - size.h / 2 };
        const startScale = Math.min(1, this.layout.deck.w * 0.9 / size.w);
        target.animate([
          { transform: `translate(${from.x}px, ${from.y}px) rotate(-8deg) scale(${startScale})` },
          { transform: `translate(${from.x * .45}px, ${from.y * .45 - DRAW.arc}px) rotate(${p.rotation - 4}deg) scale(${(startScale + 1) / 2 + .06})`, offset: .55 },
          { transform: `rotate(${p.rotation}deg)` },
        ], { duration: DRAW.fly, delay, fill: 'backwards', easing: 'cubic-bezier(.25,.7,.35,1)' });
        this.later(() => { if (!this.deckButton?.isConnected) return; this.deckButton.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' }], { duration: 140 }); this.sound.draw(); }, delay);
        this.later(() => {
          if (!target.isConnected) return;
          target.animate([{ transform: `rotate(${p.rotation}deg) scaleX(1)` }, { transform: `rotate(${p.rotation}deg) scaleX(0)` }, { transform: `rotate(${p.rotation}deg) scaleX(1)` }], { duration: DRAW.flip, easing: 'ease-in-out' });
          this.later(() => { back.remove(); face.style.visibility = ''; }, DRAW.flip / 2);
        }, delay + DRAW.fly);
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
    if (this.striking) { event.preventDefault(); this.skipStrike(); return; }
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
    if (drag.touch && !drag.dragging && p.y >= this.layout.hand.region.y) {
      if (Math.abs(p.x - drag.start.x) > MOTION.dragThreshold) { clearTimeout(this.holdTimer); this.hideCardPreview(); }
      const cards = this.state.hand; const positions = handPositions(cards.length, this.layout);
      let index = 0; positions.forEach((position, i) => { if (p.x >= position.x) index = i; });
      const next = cards[index];
      if (next && next.id !== drag.id) { drag.id = next.id; drag.node = this.handNodes.get(next.id)!; drag.origin = positions[index]; drag.offset = { x: p.x - positions[index].x, y: p.y - positions[index].y }; this.renderHand(); }
      return;
    }
    if (!drag.dragging && Math.hypot(p.x - drag.start.x, p.y - drag.start.y) > MOTION.dragThreshold) {
      drag.dragging = true; clearTimeout(this.holdTimer); this.hideCardPreview(); const card = this.state.hand.find(c => c.id === drag.id); if (!card) return this.cancelDrag();
      const node = el('div', 'drag-card'); const dragSize = handSize(this.layout); Object.assign(node.style, { width: `${dragSize.w}px`, height: `${dragSize.h}px` }); const face = createCard(this.store, card, this.displayXp, this.state.opts.grow, { thresholds: growthThresholds(this.run ?? this.state) }); face.style.transform = `scale(${this.layout.hand.scale})`; node.append(face); drag.node = node; this.dragLayer.append(node); this.renderHand();
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
      this.renderRow(); this.renderFormula(); this.renderDragWarnings(card ?? undefined); this.stage.classList.toggle('drop-ready', valid);
    }
  };
  private onPointerUp = (event: PointerEvent) => {
    const drag = this.drag; if (!drag || drag.pointer !== event.pointerId) return;
    const p = this.point(event); this.drag = null; this.preview = null; this.stage.classList.remove('drop-ready'); this.renderDragWarnings();
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
    this.stage.classList.remove('drop-ready'); this.renderDragWarnings(); if (drag.dragging) this.returnCard(drag); else this.renderHand(); this.renderRow(); this.renderFormula();
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
    this.hideCardPreview(); const wasBroken = this.run?.monster.broken; const countdownBefore = this.run?.monster.countdown; const oldRule = this.run ? currentRule(this.run) : undefined; const beforeIds = new Set(this.state.hand.map(c => c.id));
    const entry = this.screen === 'adventure' && this.run ? playRunCard(this.run, index) : playCard(this.state, index);
    const drawnIds = entry.type === 'bag' || entry.type === 'whistle' ? this.state.hand.filter(c => !beforeIds.has(c.id)).map(c => c.id) : []; drawnIds.forEach(id => this.pendingDrawIds.add(id));
    this.preview = null; const brokeNow = !wasBroken && Boolean(this.run?.monster.broken); this.persist();
    this.growth.forEach(socket => socket.classList.toggle('stone-growth', entry.type === 'stone'));
    this.displayXp = [...this.state.xp]; this.displayMultiplier = this.state.m; this.displayTotal = this.state.total;
    this.shownRainbow = new Set(this.state.row.filter(c => c.rb).map(c => c.id));
    this.render(); const row = this.rowNodes.get(entry.id);
    if (row && origin) row.animate([{ transform: `translate(${origin.x - parseFloat(row.style.left)}px, ${origin.y - parseFloat(row.style.top)}px) scale(${this.layout.hand.scale / this.layout.rowScale})` }, { transform: 'translate(0,0) scale(1)' }], { duration: 180, easing: 'ease-out' });
    if (entry.type && row) playCardArt(row.querySelector<HTMLElement>('.gem-card')!);
    if (entry.type === 'mirror' && row) {
      const resolved = row.querySelector<HTMLElement>('.gem-card')!;
      const before = createCard(this.store, createToolCard('mirror', entry.id), this.displayXp, this.state.opts.grow, { static: true, thresholds: growthThresholds(this.run ?? this.state) }); before.classList.add('temporary-mirror'); before.style.transform = `scale(${this.layout.rowScale})`;
      resolved.style.visibility = 'hidden'; row.prepend(before); playCardArt(before);
      this.later(() => { before.remove(); resolved.style.visibility = ''; resolved.animate([{opacity:0},{opacity:1}],{duration:200}); },200);
    }
    this.animateScore(this.displayScore, this.state.turnDmg);
    // 排牌阶段只在桌上演：牌落桌、倍率、反应。怪要等按“打出去”才挨打
    if(entry.type==='shadow')this.sound.shadow(Math.max(0,this.state.row.length-2));else this.sound.playCard(this.state.row.length - 1);
    if (row) this.feel.cardDrop(row);
    const doubled = entry.m2 >= entry.m * 2 && (entry.k === 'shun' || entry.k === 'white' || entry.type === 'lens' || entry.effects?.some(effect => effect.id === 'same'));
    this.store.play(this.badge, doubled ? 'double' : 'up'); this.feel.multiplier(this.mult, doubled);
    if (doubled) this.sound.double(this.state.row.length - 1);
    const color = this.store.manifest.palette.mix[String(entry.v)] || this.store.manifest.palette.text;
    if (entry.k !== 'plain') {
      const positions = rowPositions(this.state.row, this.layout); const p = positions[this.state.row.findIndex(c => c.id === entry.id)];
      if (p) this.effect(`fx_${entry.k}`, { x: p.x, y: p.y + rowSize(this.layout).h / 2 }, color, entry.k === 'white' ? 1.3 : 1);
      if (entry.k === 'white') this.sound.white();
    }
    this.presentEffects(entry, countdownBefore, oldRule);
    if (brokeNow && this.run?.monster.broken) {
      this.hpBar.animate([{ filter: 'brightness(1)' }, { filter: 'brightness(1.6)' }, { filter: 'brightness(1)' }], { duration: 400 });
      if (!this.brokenHintShown) { this.brokenHintShown = true; this.toast('这些牌能打穿它了！还能接着加牌刷超杀'); }
    } else if (!this.arrangeHintShown && this.state.row.length === 1) { this.arrangeHintShown = true; this.toast('排好了点“打出去”。点桌上的牌能收回'); }
    if (entry.rainbow) {
      this.sound.rainbow();
      this.feel.rainbow(this.state.row.filter(c => c.rb).map(c => this.rowNodes.get(c.id)!).filter(Boolean), () => {
        this.effect('fx_rainbow', { x: this.layout.width / 2, y: this.layout.height / 2 }, undefined, 2);
        this.float(`彩虹 +${formatFull(entry.rainbow)}`, true, true, this.layout.floating, '', entry.rainbow);
      });
    }
    if (entry.type === 'hammer') { this.effect('fx_slam', { x: (this.layout.rowStart.x + this.layout.rowRight) / 2, y: this.layout.rowStart.y + rowSize(this.layout).h }, color, 1.5); }
    if (entry.type === 'bag' || entry.type === 'whistle') this.later(() => { drawnIds.forEach(id => this.pendingDrawIds.delete(id)); this.renderHand(drawnIds, 140); }, 300);
    entry.grown.forEach(i => {
      this.effect('fx_grow', this.layout.growth.centers[i], this.store.manifest.palette.gem[COLORS[i]].mid);
      const label = el('span', 'growth-upgrade', `变成${FORMS[gemForm(this.state, i)]}`); this.growth[i]?.append(label); this.later(() => label.remove(), 900);
    });
  }
  private isBigHit(entry: RowEntry) {
    return this.run ? entry.damage >= this.run.monster.maxHp * .1 || entry.k === 'white' || entry.rainbow > 0 || entry.type === 'hammer' : entry.damage >= 20000 || entry.k === 'white' || entry.rainbow > 0 || entry.type === 'hammer';
  }
  private setEndLabel(label: string) { this.endButton.lastElementChild!.textContent = label; this.endButton.setAttribute('aria-label', label); }
  /** 按“打出去”：桌上的牌按顺序一张张打到怪身上，越打越快，满手也不超过 3 秒。点屏幕跳过。 */
  private strike() {
    const entries = [...this.state.row]; if (!entries.length) { this.settleTurn(); return; }
    this.hideCardPreview(); this.cancelDrag(); this.closeModal(); this.resetEffects(); this.syncPresentation();
    this.striking = true; this.strikeHp = this.run ? this.run.monster.turnStartHp : null;
    this.endButton.disabled = true; this.undoButton.disabled = true; this.stage.classList.add('striking');
    const gaps = entries.map((_, i) => Math.max(STRIKE.minGap, STRIKE.firstGap * STRIKE.decay ** i));
    const total = gaps.reduce((sum, gap) => sum + gap, 0); const fit = Math.min(1, STRIKE.maxTotal / total);
    let at = STRIKE.lead;
    entries.forEach((entry, i) => { this.later(() => this.strikeOne(entry, i), at); at += gaps[i]! * fit; });
    const last = entries.at(-1)!; const broke = Boolean(this.run?.monster.broken);
    this.later(() => this.endStrike(), at + (broke ? STRIKE.breakHold : STRIKE.hold) + (this.isBigHit(last) ? 120 : 0));
  }
  private strikeOne(entry: RowEntry, index: number) {
    const row = this.rowNodes.get(entry.id); const hit = this.monsterHitPoint(); const big = this.isBigHit(entry);
    if (row) { row.animate([{ transform: 'translateY(0) scale(1)', filter: 'brightness(1)' }, { transform: `translateY(${-STRIKE.lift}px) scale(1.08)`, filter: 'brightness(1.5)', offset: .35 }, { transform: 'translateY(0) scale(1)', filter: 'brightness(1)' }], { duration: 220, easing: 'ease-out' }); }
    const before = this.strikeHp; if (before !== null) this.strikeHp = before - entry.damage;
    const brokeNow = before !== null && before > 0 && this.strikeHp! <= 0;
    this.store.play(this.dummy, big ? 'hit_big' : 'hit'); this.sound.hit(big); this.sound.playCard(index);
    if (brokeNow) this.sound.pierce();
    this.float(formatFull(entry.damage), big, false, hit, '', entry.damage);
    if (entry.rainbow) this.float(`彩虹 +${formatFull(entry.rainbow)}`, true, true, this.layout.floating, '', entry.rainbow);
    const color = this.store.manifest.palette.mix[String(entry.v)] || this.store.manifest.palette.text;
    this.effect('fx_hit', hit, color, big ? 1.25 : 1);
    if (brokeNow) { this.store.setStay(this.dummy, 'daze'); this.effect('fx_kill', hit, undefined, 1.5); }
    this.feel.hit({ monster: this.monsterMotion, damage: entry.damage, big, pierce: brokeNow, roots: [this.monsterMotion, ...this.fxLayer.querySelectorAll('svg')] });
    if (brokeNow) this.feel.slow([this.monsterMotion, this.fxLayer, this.rowLayer, this.mult]);
    if (this.run) this.renderBattleStatus();
  }
  private endStrike() { this.striking = false; this.strikeHp = null; this.stage.classList.remove('striking'); this.endButton.disabled = false; this.settleTurn(); }
  private skipStrike() { if (!this.striking) return; this.resetEffects(); this.stage.classList.remove('striking'); this.endButton.disabled = false; this.settleTurn(); }

  private animateScore(from: number, to: number) {
    cancelAnimationFrame(this.scoreAnimation); from = Math.max(0, this.displayScore); to = Math.max(0, to); const start = performance.now();
    const step = (now: number) => { const progress = Math.max(0, Math.min(1, (now - start) / 300)); this.displayScore = scoreAt(from, to, now - start); this.setScore(this.displayScore); if (progress < 1) this.scoreAnimation = requestAnimationFrame(step); };
    this.scoreAnimation = requestAnimationFrame(step);
  }
  private effect(id: string, at: Point, color?: string, scale = 1) {
    const svg = this.store.effect(id, this.fxLayer, at.x, at.y, color); const [w, h] = dimensions(this.store.get(id).definition);
    place(svg, { x: at.x - w * scale / 2, y: at.y - h * scale / 2, w: w * scale, h: h * scale });
    return svg;
  }
  private setScore(value: number) {
    const text = formatFull(value); this.score.textContent = text;
    this.score.style.fontSize = `${Math.min(Math.round(this.layout.damage.h * 0.9), Math.floor(this.layout.damage.w / Math.max(1, [...text].reduce((s, ch) => s + (ch === ',' ? 0.3 : 0.6), 0))))}px`;
  }
  private float(text: string, big = false, rainbow = false, at = this.layout.floating, extra = '', damage = 0) {
    const node = el('div', `damage-float${big ? ' big' : ''}${rainbow ? ' rainbow' : ''}${extra ? ` ${extra}` : ''}`);
    const value = el('span', rainbow ? 'rainbow-text' : '', text); node.append(value);
    Object.assign(node.style, { left: `${at.x + (++this.floatIndex % 3 - 1) * 32}px`, top: `${at.y - (rainbow ? 80 : 0)}px` });
    if (rainbow) value.style.backgroundImage = `linear-gradient(90deg, ${[1,3,2,6,4,5].map(mask => this.store.manifest.palette.mix[String(mask)]).join(',')})`;
    this.fxLayer.append(node); this.feel.number(value, damage); this.later(() => node.remove(), 900);
  }
  private toast(message: string) {
    this.activeToast?.remove();
    const node = el('div', 'toast', message); this.activeToast = node;
    node.style.maxWidth = `${Math.min(940, 2 * Math.min(this.layout.toast.x, this.layout.width - this.layout.toast.x))}px`;
    this.store.nineSlice(node, 'ui_panel', 24); node.style.left = `${this.layout.toast.x}px`; node.style.top = `${this.layout.banner.y}px`;
    this.fxLayer.append(node); this.later(() => { node.remove(); if (this.activeToast === node) this.activeToast = null; }, 1200);
  }
  private flyCards(nodes: HTMLElement[], interval = 30) {
    nodes.forEach((source, i) => { const node = source.cloneNode(true) as HTMLElement; this.fxLayer.append(node); const x = parseFloat(node.style.left); const y = parseFloat(node.style.top);
      node.animate([{ transform: 'translate(0,0)', opacity: 1 }, { transform: `translate(${this.layout.deck.x - x}px, ${this.layout.deck.y - y}px) scale(.3)`, opacity: 0 }], { duration: 250, delay: i * interval, easing: 'ease-in', fill: 'forwards' }).onfinish = () => node.remove(); });
  }
  private finishTurn() {
    if (!this.playing) return;
    if (this.state.row.length) this.strike(); else this.settleTurn();
  }
  private settleTurn() {
    if (!this.playing) return;
    this.hideCardPreview();
    this.cancelDrag(); this.closeModal(); this.resetEffects();
    const previousIds = new Set(this.state.hand.map(c => c.id));
    const broken = this.screen === 'adventure' && this.run?.monster.broken;
    this.flyCards([...this.rowNodes.values(), ...(broken ? [...this.handNodes.values()] : [])], broken ? 60 : 30);
    if (this.screen === 'practice') { endTurn(this.state); this.syncPresentation(); this.render(); this.renderHand(this.state.hand.filter(c => !previousIds.has(c.id)).map(c => c.id)); return; }
    if (!this.run) return;
    const oldHearts = this.run.hearts; const countdown = this.run.monster.countdown;
    if(ruleSealed(this.run))this.sound.unseal();
    endRunTurn(this.run); this.state = this.run.game; this.persist();
    if (this.run.result) this.settleRecords();
    if(!broken&&this.run.phase==='battle'){const start=this.relicNodes.get('start2');if(start)this.feel.relic(start);}
    if (broken) { this.deathTransition(oldHearts); return; }
    if (oldHearts !== this.run.hearts) {
      this.transition = Boolean(this.run.result); this.attacking = true; this.losingHeart = oldHearts - 1; this.syncPresentation(); if (!this.transition) this.render(); else { this.rowLayer.replaceChildren(); this.rowNodes.clear(); } this.updateCountdown(0); this.store.play(this.dummy, 'attack');
      this.monsterMotion.style.zIndex = '2'; this.feel.attack(this.monsterMotion, () => {
        this.effect('fx_attack', { x: this.layout.width / 2, y: this.layout.height / 2 }, undefined, 2); this.sound.heartLose();
        const heart = this.heartNodes[oldHearts - 1]; if (heart instanceof SVGSVGElement) { const duration = this.store.play(heart, 'lose'); this.later(() => { this.losingHeart = -1; this.renderHearts(); }, duration); }
      });
      this.later(() => { this.transition = false; this.attacking = false; this.monsterMotion.style.zIndex = ''; this.losingHeart = -1; this.syncPresentation(); if (this.run?.result) { this.store.play(this.dummy, 'hit_big'); this.later(() => { this.buildScene(); }, 700); } else { this.renderHearts(); this.updateCountdown(this.run!.monster.countdown, true); this.render(); this.renderHand(this.state.hand.filter(c => !previousIds.has(c.id)).map(c => c.id)); } }, 1100);
    } else { this.syncPresentation(); this.render(); if (countdown !== this.run.monster.countdown) this.updateCountdown(this.run.monster.countdown, true); this.renderHand(this.state.hand.filter(c => !previousIds.has(c.id)).map(c => c.id)); }
  }
  private rewind() { this.rewindTo(this.state.row.length - 1); }
  /** 收回桌上第 index 张和它后面的所有牌（撤回到打它之前） */
  private rewindTo(index: number) {
    if (!this.playing || index < 0) return; this.cancelDrag(); let undone = 0;
    while (this.state.row.length > index && (this.screen === 'adventure' && this.run ? undoRun(this.run) : undo(this.state))) undone++;
    if (!undone) return; const visible = this.displayScore; this.resetEffects(); this.syncPresentation(); this.displayScore = visible; this.render(); this.animateScore(visible, this.state.turnDmg); this.persist(); }
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
    if (this.screen === 'adventure' && this.run?.phase === 'doors' && !this.transition) {
      if (/^[12]$/.test(event.key)) { event.preventDefault(); this.selectDoor(Number(event.key) - 1, false); }
      else if (event.key === 'Enter' && this.selectedDoor >= 0) { event.preventDefault(); this.selectDoor(this.selectedDoor); }
      return;
    }
    if (this.screen === 'adventure' && this.run?.phase === 'relic' && !this.transition) {
      if (/^[1-3]$/.test(event.key)) { event.preventDefault(); this.selectRelic(Number(event.key) - 1); }
      else if (event.key === 'Enter' && this.selectedRelic >= 0) { event.preventDefault(); this.takeRelic(this.selectedRelic); }
      return;
    }
    if (this.screen === 'adventure' && this.run?.phase === 'loot' && !this.transition) {
      if (/^[1-4]$/.test(event.key)) { event.preventDefault(); this.selectLoot(Number(event.key) - 1); }
      else if (event.key === 'Enter' && this.selectedLoot >= 0) { event.preventDefault(); this.takeLoot(this.selectedLoot); }
      else if (event.key === '0') { event.preventDefault(); this.takeLoot(-1); }
      return;
    }
    if (this.striking && (event.code === 'Space' || event.key === 'Enter')) { event.preventDefault(); this.skipStrike(); return; }
    if (!this.playing) return;
    if (/^[1-9]$/.test(event.key)) { event.preventDefault(); this.playById(this.state.hand[Number(event.key) - 1]?.id); }
    else if (event.code === 'Space') { event.preventDefault(); this.finishTurn(); }
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
  /** 所有预览与警告均来自规则层，不改变局面。 */
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
    const face = createCard(this.store, card, this.displayXp, this.state.opts.grow, { thresholds: growthThresholds(this.run ?? this.state) }); face.style.transform = `scale(${s})`; box.append(face);
    const info = el('div', 'card-preview-info');
    if (card.type) info.append(el('div', 'help', TOOL_HELP[card.type]));
    if (this.playing) {
      const entry = this.predict(card);
      info.append(el('div', 'predict', `现在打出：${REACTION[entry.k]} · 预计 ${formatFull(entry.damage)}`));
      entry.effects?.filter(effect => effect.id in RULES).forEach(effect => {
        const text = effect.id === 'bite' || effect.id === 'bell' ? '出手提前 1 回合' : effect.id === 'hug' ? '红宝石算 0' : effect.text;
        info.append(el('div', 'rule-impact', `${RULES[effect.id as keyof typeof RULES].name}：${text}`));
      });
    }
    if (info.childElementCount) box.append(info);
    this.dragLayer.append(box); this.cardPreview = box;
  }
  private hideCardPreview() { this.cardPreview?.remove(); this.cardPreview = null; this.previewSticky = false; }
  private inspectCard(card: Card) {
    const panel = this.openModal(card.type ? TOOLS[card.type].name : CARD_NAMES[card.v]); panel.classList.add('card-inspection');
    const wrap = el('div', 'inspection-card'); wrap.style.width = `${MOTION.cardW * MOTION.inspectScale}px`; wrap.style.height = `${MOTION.cardH * MOTION.inspectScale}px`;
    const face = createCard(this.store, card, this.displayXp, this.state.opts.grow, { thresholds: growthThresholds(this.run ?? this.state) }); face.style.transform = `scale(${MOTION.inspectScale})`; wrap.append(face); panel.append(wrap);
    if(card.type)panel.append(el('p','',TOOL_HELP[card.type]));
    panel.addEventListener('click', () => this.closeModal());
  }
  private showRules() {
    const panel = this.openModal('规则');
    const gems = el('div', 'rule-gems'); COLORS.forEach(color => gems.append(this.store.create(`gem_icon_${color}`))); panel.append(gems);
    const rules = [
      '宝石：红是圆的，绿是方的，蓝是三角的。',
      '把手牌拖到桌上排成一排，新的接在最右边。排的时候怪还没挨打，血条上的斜纹是打出去以后会掉的血。',
      '伤害 = 宝石底数 × 倍率 × 反应。倍率从 ×1 开始，每出一张 +1。',
      '和上一张比宝石：一样 → 同色 ×2；差一颗 → 顺色 ×2，倍率翻倍；三颗全不一样 → 凑白 ×5，倍率翻倍；差两颗 → 没反应。',
      '彩虹：顺色一路连出红、黄、绿、青、蓝、品红六种颜色，这回合 ×10，每回合一次。',
      '宝石越用越值钱：用 15 次变"切好"，底数 150；用 45 次变"闪光"，底数 200。',
      '排好了点“打出去”：桌上的牌从左到右一张张打到怪身上。点桌上的某张牌，它和它后面的牌都收回手里；撤回按钮收回最后一张。',
      '打完这回合就结束：桌上的牌收走，倍率回到 ×1，手牌补满。一张都没排时按钮是“结束回合”。',
    ];
    const list = el('ul', 'rules-list'); rules.forEach(rule => list.append(el('li', '', rule))); panel.append(list);
    const sections = [
      ['一局怎么打', '每一间：打赢小怪拿额外牌。到了门前，两扇门各写着打谁、赢了拿什么，挑一扇。打赢精英回满心，再挑一件宝物。', '怪头顶是它的血，旁边的数字是它还有几回合出手。数到 0 它就打你一下，你少 1 颗心；3 颗心都没了就输了。', '排的牌够把怪的血打空，血条上会写“能打穿”。这时还能接着加牌，打得越多超杀越高。点“打出去”打穿它，这一仗就赢了。'],
      ['额外牌', '每种额外牌最多带 2 张。手里最多拿 12 张。', '额外牌也带宝石，宝石照常算伤害、照常起反应，效果是另外加的。', '口袋（绿）：摸 2 张。', '放大镜（蓝）：倍率再 ×2。', '锤子（红）：这回合到这里的伤害 ×3，最后打最划算。', '镜子（没宝石）：变成上一张缺的宝石，一定凑白。', '磨石（没宝石）：三颗宝石各长 5 次。', '沙漏：怪出手推后 1 回合。', '封条：这回合怪的规矩不算。', '影子：跟上一张一模一样。', '哨子：叫来 1 张额外牌。'],
      ['战利品', '奖励是额外牌时，从几张额外牌里选一张放进牌组，也可以不拿。超杀到 10 倍多一张可选。工坊里扔牌或者抄牌；回心门打赢回一颗心。打赢精英，手牌上限 +1，心回满，再挑一件宝物。'],
    ];
    sections.push(['怪的规矩', ...Object.values(RULES).map(rule => `${rule.name}：${rule.text}`)]);
    if (this.run?.relics.length) sections.push(['宝物', ...this.run.relics.map(id => `${RELICS[id].name}：${RELICS[id].text}`)]);
    sections.forEach(([title,...paragraphs]) => { panel.append(el('h3','',title)); paragraphs.forEach(text=>panel.append(el('p','',text))); });
  }
  private showGrowth(i: number) {
    const thresholds = growthThresholds(this.run ?? this.state); const f = gemForm(this.state, i); const xp = this.state.xp[i]; const panel = this.openModal(NAMES[i]);
    const image = this.store.create(`gem_${COLORS[i]}_${FORM_IDS[f]}`); image.classList.add('growth-detail-gem'); panel.append(image);
    const next = xp >= thresholds[2] ? '已经是闪光' : xp >= thresholds[1] ? `再用 ${thresholds[2] - xp} 次变闪光（底数 ${CONFIG.gemValue[2]}）` : `再用 ${thresholds[1] - xp} 次变切好（底数 ${CONFIG.gemValue[1]}）`;
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
    this.screen = 'adventure'; this.selectedDoor = -1; this.shopMode = null; this.shopSelected = []; this.selectedLoot = -1; this.selectedRelic = -1; this.brokenHintShown = false; this.persist(); this.syncPresentation(); this.buildScene(); this.render();
  }
  private resumeAdventure() {
    if (!this.savedRun) return;
    this.cancelDrag(); this.closeModal(); this.resetEffects(); this.transition = false; this.run = this.savedRun; this.state = this.run.game;
    this.screen = 'adventure'; this.selectedDoor = -1; this.shopMode = null; this.shopSelected = []; this.selectedLoot = -1; this.brokenHintShown = this.run.stats.fights.length > 0 || this.run.monster.broken;
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
  private buildKnocker() {
    const lines = ['又来一个找宝石的。老规矩：宝物带出大门才算你的。', '挑一件带上吧。里头那条龙，可比你会攒东西。', '我赌你过不了门厅。敢不敢？'];
    const art = this.store.createInline('npc_knocker'); this.placeAnchored(art, 'npc_knocker', this.layout.knocker, this.layout.knocker.scale);
    const say = el('p', 'knocker-say', lines[this.localRecords.played % 3]); place(say, this.layout.knockerSay); this.scene.append(art, say); this.store.play(art, 'talk');
  }
  private buildDoors() {
    if (!this.run) return;
    this.banner('挑一扇门', true);
    const layout = this.layout.doors;
    doorOptions(this.run).forEach((option, i) => {
      const group = el('button', 'door-choice') as HTMLButtonElement; group.type = 'button'; group.dataset.doorIndex = String(i);
      place(group, { x: 0, y: 0, w: this.layout.width, h: this.layout.height });
      group.classList.toggle('selected', this.selectedDoor === i); group.classList.toggle('dimmed', this.selectedDoor >= 0 && this.selectedDoor !== i);
      group.setAttribute('aria-pressed', String(this.selectedDoor === i)); group.setAttribute('aria-label', `${i + 1} ${MONSTERS[option.monster].name}，${{card:'额外牌',shop:'工坊',heal:'回一颗心'}[option.reward]}`);
      const point = layout.points[i]; const door = this.store.createInline('ui_door'); this.placeAnchored(door, 'ui_door', point, layout.scale); group.append(door);
      const monster = this.store.createInline(`mon_${option.monster}`); this.placeAnchored(monster, `mon_${option.monster}`, point, layout.monsterScale); group.append(monster);
      const reward = this.store.createInline('ui_rule_sign'); place(reward, { x: point.x - layout.reward.w / 2, y: point.y + layout.reward.dy, w: layout.reward.w, h: layout.reward.h });
      this.store.setSlotText(reward, 'rule_text', {card:'额外牌',shop:'工坊',heal:'回一颗心'}[option.reward]); this.store.setSlotIcon(reward, 'icon_slot', `ui_reward_${option.reward}`); group.append(reward);
      const rule = this.store.createInline('ui_rule_sign'); place(rule, { x: point.x - layout.ruleSign.w / 2, y: point.y + layout.ruleSign.dy, w: layout.ruleSign.w, h: layout.ruleSign.h }); this.store.setSlotText(rule, 'rule_text', RULES[option.rule].name); this.store.setSlotIcon(rule, 'icon_slot', `rule_${option.rule}`); group.append(rule);
      group.addEventListener('click', () => this.selectDoor(i, false)); this.scene.append(group);
    });
    const detail = el('div', 'door-detail'); place(detail, layout.detail); this.store.nineSlice(detail, 'ui_panel', 24);
    const option = doorOptions(this.run)[this.selectedDoor];
    if (option) detail.append(el('p','',`${MONSTERS[option.monster].name} · ${MONSTERS[option.monster].line}`), el('p','',`${RULES[option.rule].name} · ${RULES[option.rule].text}`), el('p','',`打赢拿：${{card:'额外牌，三张里挑一张。',shop:'进一次工坊，扔牌或者抄牌。',heal:'回一颗心。'}[option.reward]}`));
    else detail.hidden = true;
    const hint = el('div', 'loot-hint', option ? '' : '点门看看打谁、赢了拿什么'); place(hint, layout.hint); this.scene.append(detail, hint);
    const enter = this.button('进这扇门', layout.enter, () => { if (this.selectedDoor >= 0) this.selectDoor(this.selectedDoor); }, undefined, true); enter.disabled = !option; enter.dataset.action = 'enter-door';
  }
  private selectDoor(index: number, confirm = true) {
    if (this.transition || this.run?.phase !== 'doors' || !doorOptions(this.run)[index]) return;
    if (this.selectedDoor !== index || !confirm) { this.selectedDoor = index; this.buildScene(); return; }
    this.transition = true; this.sound.doorOpen();
    const point = this.layout.doors.points[index];
    this.scene.querySelectorAll<HTMLElement>('.door-choice').forEach((node, i) => {
      if (i !== index) node.animate([{opacity:1},{opacity:0}], {duration:600,fill:'forwards'});
      else { const door = node.querySelector<SVGSVGElement>('[data-art-id="ui_door"]'); if (door) this.store.play(door,'open'); }
    });
    this.later(() => {
      if (!this.run) return; chooseDoor(this.run,index); this.state=this.run.game; this.selectedDoor=-1; this.transition=false; this.persist(); this.syncPresentation(); this.buildScene(); this.render(); this.enterFight();
      this.monsterMotion.animate([{ transform:`translate(${point.x-this.layout.dummyAnchor.x}px,${point.y-this.layout.dummyAnchor.y}px) scale(${this.layout.doors.monsterScale/this.monsterScale()})` },{ transform:'translate(0,0) scale(1)' }],{duration:500,easing:'ease-out'});
    },600);
  }
  private buildShop() {
    if (!this.run) return;
    const status=shopState(this.run), layout=this.layout.shop;
    this.banner(this.shopMode === 'drop' ? '扔牌：挑 1–3 张' : this.shopMode === 'copy' ? '抄牌：挑 1 张' : '工坊',true);
    const count = this.roundButton('牌库',this.layout.deck,()=>this.showDeck(),'ui_icon_deck'); count.append(el('span','count-bubble',String(this.run.cards.length)));
    if (!this.shopMode) {
      (['drop','copy'] as const).forEach((mode,i)=>{
        const allowed=mode==='drop'?status.canDrop:status.canCopy;
        const button=el('button','shop-operation') as HTMLButtonElement; button.type='button'; button.dataset.shopMode=mode; button.classList.toggle('unavailable',!allowed);button.setAttribute('aria-disabled',String(!allowed));place(button,layout.ops[i]);this.store.nineSlice(button,'ui_panel',24);
        button.append(el('strong','',mode==='drop'?'扔牌':'抄牌'),el('p','',mode==='drop'?'从整副牌里扔掉 1–3 张。':'挑 1 张，多一张一模一样的。'),el('small','',mode==='drop'?`现在 ${this.run!.cards.length} 张，最少留 20 张`:'每种额外牌最多带 2 张'));
        button.addEventListener('click',()=>{if(!allowed){this.toast(mode==='drop'?'牌已经只剩 20 张，不能再扔':'这种牌已经带满 2 张，不能再抄');return;}this.shopMode=mode;this.shopSelected=[];this.buildScene();});this.scene.append(button);
      });
      this.button('不用了',this.layout.loot.skip,()=>{const panel=this.openModal('什么都不做就走？');this.modalAction(panel,'走',()=>{this.closeModal();if(this.run)shopSkip(this.run);this.finishShop();});this.modalAction(panel,'再看看',()=>this.closeModal());}).dataset.action='skip-shop';
      return;
    }
    const grid=el('div','shop-grid');place(grid,layout.grid); grid.style.setProperty('--shop-card-w',`${MOTION.cardW*layout.gridScale}px`);grid.style.setProperty('--shop-card-h',`${MOTION.cardH*layout.gridScale}px`);
    const groups=new Map<string,Card[]>();const sorted=[...this.run.cards].sort((a,b)=>a.type&&b.type?TOOL_TYPES.indexOf(a.type)-TOOL_TYPES.indexOf(b.type):a.type?-1:b.type?1:[1,2,4,3,6,5,7,0].indexOf(a.v)-[1,2,4,3,6,5,7,0].indexOf(b.v));
    sorted.forEach(card=>{const key=card.type??String(card.v);groups.set(key,[...(groups.get(key)??[]),card]);});
    groups.forEach(cards=>{
      const card=cards[0],selected=cards.filter(c=>this.shopSelected.includes(c.id)); const allowed=this.shopMode!=='copy'||canCopyCard(this.run!,card.id);
      const button=el('button','shop-card') as HTMLButtonElement;button.type='button';button.dataset.cardId=String(card.id);button.classList.toggle('selected',selected.length>0);button.classList.toggle('unavailable',!allowed);button.setAttribute('aria-pressed',String(selected.length>0));button.setAttribute('aria-label',`${card.type?TOOLS[card.type].name:CARD_NAMES[card.v]}，${cards.length} 张${allowed?'':'，带满了'}`);
      const face=createCard(this.store,card,this.state.xp,true,{static:true,thresholds:growthThresholds(this.run!)});face.style.transform=`scale(${layout.gridScale})`;button.append(face,el('span','shop-count',!allowed?'带满了':selected.length?`选了 ${selected.length}`:`×${cards.length}`));
      let held=false,timer:ReturnType<typeof setTimeout>|undefined;button.addEventListener('pointerdown',()=>{held=false;timer=setTimeout(()=>{held=true;this.inspectCard(card);},MOTION.holdMs);});for(const name of ['pointerup','pointercancel','pointerleave'])button.addEventListener(name,()=>clearTimeout(timer));
      button.addEventListener('click',()=>{
        if(held||this.transition)return;if(!allowed){this.toast('这种牌已经带满 2 张，不能再抄');return;}
        if(this.shopMode==='copy')this.shopSelected=selected.length?[]:[card.id];
        else if(selected.length===cards.length)this.shopSelected=this.shopSelected.filter(id=>!cards.some(c=>c.id===id));
        else if(this.shopSelected.length>=status.maxDrop){if(selected.length)this.shopSelected=this.shopSelected.filter(id=>!cards.some(c=>c.id===id));else this.toast(status.maxDrop<3?'整副牌最少留 20 张':'最多扔 3 张');}
        else this.shopSelected.push(cards.find(c=>!this.shopSelected.includes(c.id))!.id);
        const scroll=grid.scrollTop;this.buildScene();const next=this.scene.querySelector('.shop-grid');if(next)next.scrollTop=scroll;
      });grid.append(button);
    });this.scene.append(grid);
    this.button('换个做法',layout.back,()=>{if(this.transition)return;this.shopMode=null;this.shopSelected=[];this.buildScene();}).dataset.action='shop-back';
    const confirm=this.button(this.shopMode==='drop'?`扔掉这 ${this.shopSelected.length} 张`:'抄这张',layout.confirm,()=>this.confirmShop(),undefined,true);confirm.disabled=!this.shopSelected.length;confirm.dataset.action='shop-confirm';
  }
  private confirmShop() {
    if(this.transition||this.run?.phase!=='shop'||!this.shopSelected.length)return;
    this.transition=true;const mode=this.shopMode;
    const nodes:HTMLElement[]=[];const grid=this.scene.querySelector<HTMLElement>('.shop-grid')!;
    for(const id of this.shopSelected){const card=this.run.cards.find(c=>c.id===id)!;const representative=[...this.scene.querySelectorAll<HTMLElement>('.shop-card')].find(node=>{const item=this.run!.cards.find(c=>c.id===Number(node.dataset.cardId));return item?.type===card.type&&item?.v===card.v;});if(!representative)continue;
      const clone=representative.cloneNode(true) as HTMLElement;clone.classList.remove('selected');clone.style.margin='0';const box=representative.getBoundingClientRect(),stage=this.stage.getBoundingClientRect();place(clone,{x:(box.left-stage.left)/this.scale,y:(box.top-stage.top)/this.scale,w:box.width/this.scale,h:box.height/this.scale});this.fxLayer.append(clone);nodes.push(clone);
    }
    if(mode==='drop')for(const node of this.scene.querySelectorAll<HTMLElement>('.shop-card.selected')){const source=this.run.cards.find(card=>card.id===Number(node.dataset.cardId));if(!source)continue;const group=this.run.cards.filter(card=>card.type===source.type&&card.v===source.v);const remaining=group.filter(card=>!this.shopSelected.includes(card.id)).length;if(!remaining)node.style.opacity='0';else{node.classList.remove('selected');const badge=node.querySelector('.shop-count');if(badge)badge.textContent=`×${remaining}`;}}
    grid.inert=true;
    if(mode==='drop')shopDrop(this.run,this.shopSelected);else shopCopy(this.run,this.shopSelected[0]);this.persist();
    nodes.forEach((_,i)=>this.later(()=>mode==='drop'?this.sound.shopRemove():this.sound.shopCopy(),i*120));
    nodes.forEach((node,i)=>node.animate(mode==='drop'?[{transform:'translateY(-20px)',opacity:1},{transform:`translateY(${this.layout.height}px)`,opacity:0}]:[{transform:'translateX(0)',filter:'brightness(1)'},{transform:'translateX(40px)',filter:'brightness(1.7)'},{transform:'translateX(0)',filter:'brightness(1)'}],{duration:400,delay:i*120,fill:'forwards'}));
    this.later(()=>{const count=this.scene.querySelector('.count-bubble');if(count){count.textContent=String(this.run!.cards.length);count.animate([{transform:'scale(1.4)'},{transform:'scale(1)'}],{duration:300});}this.later(()=>this.finishShop(),400);},400+Math.max(0,nodes.length-1)*120);
  }
  private finishShop() {
    if(!this.run)return;this.shopMode=null;this.shopSelected=[];this.transition=false;this.state=this.run.game;this.resetEffects();this.persist();this.syncPresentation();this.buildScene();this.render();this.enterFight();
  }

  private buildRelicBar() {
    this.relicNodes.clear(); if (!this.run) return;
    const l = this.layout.relics;
    this.run.relics.forEach((id, i) => {
      const button = el('button', 'relic-icon') as HTMLButtonElement; button.type = 'button'; button.dataset.relic = id;
      place(button, { x: l.x + i * (l.size + l.gap), y: l.y, w: l.size, h: l.size }); button.append(this.store.create(`relic_${id}`));
      button.setAttribute('aria-label', RELICS[id].name); button.addEventListener('click', () => { const panel = this.openModal(RELICS[id].name); panel.append(el('p', '', RELICS[id].text)); });
      this.scene.append(button); this.relicNodes.set(id, button);
    });
  }
  private buildRelicPick() {
    if (!this.run) return; this.banner(this.run.relics.length ? '再挑一件宝物' : '选一个宝物带进古堡', true); this.lootCards = [];
    if (!this.run.relics.length) this.buildKnocker();
    const layout = this.layout.relicPick;
    this.run.relicOptions.forEach((id, i) => {
      const node = el('button', 'relic-pick loot-card') as HTMLButtonElement; node.type = 'button'; node.dataset.relicIndex = String(i);
      place(node, { ...layout.points[i], w: MOTION.cardW * layout.scale, h: MOTION.cardH * layout.scale }); this.store.nineSlice(node, 'ui_panel', 24);
      const icon = this.store.create(`relic_${id}`); Object.assign(icon.style, { width: `${layout.icon}px`, height: `${layout.icon}px` });
      const name = el('strong', '', RELICS[id].name); name.style.fontSize = `${layout.nameSize}px`;
      const detail = el('span', '', RELICS[id].text); detail.style.fontSize = `${layout.textSize}px`;
      node.append(icon, name, detail); node.addEventListener('click', () => this.selectRelic(i));
      node.setAttribute('aria-label', `${i + 1} ${RELICS[id].name}：${RELICS[id].text}。点一下选中，再点“拿这件”`);
      this.scene.append(node); this.lootCards.push(node);
    });
    place(this.lootHint, this.layout.loot.hint); this.scene.append(this.lootHint);
    this.takeButton = this.button('拿这件', this.layout.loot.take, () => { if (this.selectedRelic >= 0) this.takeRelic(this.selectedRelic); }, undefined, true); this.takeButton.dataset.action = 'take-relic';
    this.updateRelicSelection();
  }
  private updateRelicSelection() {
    this.lootCards.forEach((node, i) => { node.classList.toggle('selected', i === this.selectedRelic); node.setAttribute('aria-pressed', String(i === this.selectedRelic)); });
    const id = this.run?.relicOptions[this.selectedRelic]; this.lootHint.textContent = id ? `选了「${RELICS[id].name}」，点“拿这件”带走` : '选一件，再点“拿这件”'; if (this.takeButton) this.takeButton.disabled = !id;
  }
  /** 只选中；带走要按“拿这件” */
  private selectRelic(index: number) { if (this.transition || this.run?.phase !== 'relic' || !this.run.relicOptions[index]) return; this.selectedRelic = index; this.updateRelicSelection(); }
  private takeRelic(index: number) {
    if (this.transition || this.run?.phase !== 'relic' || !this.run.relicOptions[index]) return;
    const id = this.run.relicOptions[index]; const card = this.lootCards[index]; this.transition = true;
    chooseRelic(this.run, index); this.state = this.run.game; this.persist();
    const icon = this.store.create(`relic_${id}`); const point = this.layout.relicPick.points[index]; const l = this.layout.relics;
    place(icon, { x: point.x, y: point.y, w: this.layout.relicPick.icon, h: this.layout.relicPick.icon }); this.fxLayer.append(icon);
    icon.animate([{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: `translate(${l.x + (this.run.relics.length - 1) * (l.size + l.gap) - point.x}px,${l.y - point.y}px) scale(${l.size / this.layout.relicPick.icon})`, opacity: 1 }], { duration: 500, fill: 'forwards', easing: 'ease-in-out' });
    this.lootCards.forEach(node => node.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: 'forwards' })); card?.setAttribute('aria-pressed', 'true');
    this.later(() => { this.transition = false; this.selectedRelic = -1; this.resetEffects(); this.syncPresentation(); this.buildScene(); this.render(); this.enterFight(); }, 500);
  }
  private renderRuleSign(override?: keyof typeof RULES) {
    if (!this.run) return; const sealed = ruleSealed(this.run); const id = override ?? currentRule(this.run) ?? (sealed ? displayedRule(this.run) : undefined); this.ruleButton.classList.toggle('sealed', sealed); this.ruleButton.hidden = !id; if (!id) return;
    const m = this.run.monster; const text = id === 'wind' ? m.woundDown ? '发条松完' : `${RULES[id].name} ${'●'.repeat(m.wind)}${'○'.repeat(Math.max(0, m.maxWind - m.wind))}` : RULES[id].name;
    this.ruleButton.dataset.rule = id; this.ruleButton.setAttribute('aria-label', `${text}，查看规矩`);
    const label = this.store.setSlotText(this.ruleSign, 'rule_text', text); if (id === 'wind') label.setAttribute('font-size', '24'); this.store.setSlotIcon(this.ruleSign, 'icon_slot', `rule_${id}`);
  }
  private buildRainbow() {
    this.rainbowSlots = []; this.rainbowLit.clear(); this.rainbowTriggered = false;
    const r = this.layout.rainbow; const group = el('div', 'rainbow-progress');
    place(group, { x: r.x, y: r.y, w: r.slot * 6 + r.gap * 5, h: r.slot });
    [1, 3, 2, 6, 4, 5].forEach((mask, i) => {
      const slot = this.store.createInline('ui_rainbow_slot'); place(slot, { x: i * (r.slot + r.gap), y: 0, w: r.slot, h: r.slot });
      slot.style.color = this.store.manifest.palette.mix[String(mask)] ?? ''; slot.dataset.color = String(mask); group.append(slot); this.rainbowSlots.push(slot);
    });
    const note = el('span', 'rainbow-need'); note.textContent = rainbowStatus(this.run ?? this.state).need === 5 ? '5 种就够' : ''; group.append(note);
    this.scene.append(group); place(this.rainbowReady, this.layout.rainbowReady); this.scene.append(this.rainbowReady);
  }
  private renderRainbow() {
    if (!this.playing) return; const status = rainbowStatus(this.run ?? this.state); const lit = new Set(this.state.rainbow ? [1,3,2,6,4,5] : status.lit);
    this.rainbowReady.hidden = !status.ready;
    this.rainbowSlots.forEach(slot => {
      const color = Number(slot.dataset.color); const on = lit.has(color); const before = this.rainbowLit.has(color);
      slot.dataset.lit = String(on); slot.setAttribute('aria-label', `${CARD_NAMES[color]} ${on ? '已亮' : '未亮'}`);
      if (on && !before) this.store.setStay(slot, 'light');
      if (!on && before) { this.store.setStay(slot, null); this.store.play(slot, 'out'); }
      if (this.state.rainbow && !this.rainbowTriggered) slot.animate([{ opacity: 1, filter: 'brightness(1)' }, { opacity: .3, filter: 'brightness(2.2)' }, { opacity: 1, filter: 'brightness(1)' }], { duration: 240, iterations: 2 });
    });
    this.rainbowLit = lit; this.rainbowTriggered = this.state.rainbow;
  }
  private renderDragWarnings(card?: Card) {
    this.countdownPreview.textContent = ''; this.countdownNode.classList.remove('attack-preview'); this.monsterMotion.classList.remove('warning-shiver');
    if (!this.preview || !card || !this.run) return;
    const after = previewCountdown(this.run, card); if (after !== this.run.monster.countdown) this.countdownPreview.textContent = `${this.run.monster.countdown} → ${after}`;
    const warning = cardWarnings(this.run, card); this.countdownNode.classList.toggle('attack-preview', warning.attack); this.monsterMotion.classList.toggle('warning-shiver', warning.attack);
  }
  private presentEffects(entry: RowEntry, countdownBefore?: number, oldRule?: keyof typeof RULES) {
    if (!this.run) return;
    entry.effects?.forEach(effect => {
      if(effect.id==='hourglass')this.sound.hourglass();
      if(effect.id==='seal'){this.sound.seal();this.ruleButton.animate([{filter:'brightness(1.5)'},{filter:'brightness(1)'}],{duration:200});}
      if(effect.id==='whistle')this.sound.whistle();
      if(effect.text==='手里拿不下了'){this.toast(effect.text);this.feel.handFull(this.deckButton);}
      if(effect.text==='牌堆里没有额外牌')this.toast(effect.text);
      if(effect.id==='twice'){const soundIndex=this.state.row.length-1;const face=this.rowNodes.get(entry.id)?.querySelector<HTMLElement>('.gem-card');this.later(()=>{
        if(face)playCardArt(face);
        if(entry.type==='hourglass'){this.sound.hourglass();this.store.play(this.countdownArt,'tick');this.feel.countdown(this.countdownNode);}
        else if(entry.type==='whistle')this.sound.whistle();
        else {this.sound.playCard(soundIndex);if(entry.type==='hammer')this.effect('fx_slam',{x:(this.layout.rowStart.x+this.layout.rowRight)/2,y:this.layout.rowStart.y+rowSize(this.layout).h},this.store.manifest.palette.mix[String(entry.v)] ?? undefined,1.5);if(entry.type==='lens'){this.store.play(this.badge,'double');this.feel.multiplier(this.mult,true);this.sound.double(soundIndex);}if(entry.type==='stone')this.growth.forEach((_,i)=>this.effect('fx_grow',this.layout.growth.centers[i],this.store.manifest.palette.gem[COLORS[i]].mid));}
      },150);}
      const relic = this.relicNodes.get(effect.id); if (relic) this.feel.relic(relic);
      if (effect.id === 'layers') {
        this.store.play(this.dummy, 'layer'); this.store.play(this.ruleSign, 'flip'); this.sound.rule('layer');
        if (oldRule) this.renderRuleSign(oldRule); this.later(() => this.renderRuleSign(), (this.store.get('ui_rule_sign').definition.events?.flip ?? 400) / 2);
      } else if (effect.id === 'bite' || effect.id === 'hug' || effect.id === 'bell') {
        this.feel.rule(this.ruleButton, effect.id); this.sound.rule(effect.id);
        if (effect.id !== 'hug') { const event = effect.id === 'bite' ? 'bite' : 'ring'; if (this.store.get(this.dummy.dataset.artId!).definition.events?.[event] !== undefined) this.store.play(this.dummy, event); }
      } else if (effect.id === 'wind') {
        const woundDown = effect.text === '发条松完'; this.store.play(this.dummy, 'unwind'); this.sound.rule(woundDown ? 'wound_down' : 'unwind');
        if (woundDown) this.store.setStay(this.dummy, 'wound_down');
      }
    });
    const woundDown = entry.effects?.some(effect => effect.id === 'wind' && effect.text === '发条松完');
    const hastened = entry.effects?.some(effect => effect.id === 'bite' || effect.id === 'bell');
    if (woundDown || hastened || (countdownBefore !== undefined && countdownBefore !== this.run.monster.countdown)) {
      this.updateCountdown(this.run.monster.countdown, true); this.countdownNode.classList.remove('countdown-red', 'countdown-green');
      const flash = woundDown || (countdownBefore !== undefined && this.run.monster.countdown > countdownBefore) ? 'countdown-green' : 'countdown-red'; this.countdownNode.classList.add(flash); const version = ++this.countdownFlashId; this.later(() => { if (version === this.countdownFlashId) this.countdownNode.classList.remove(flash); }, 300);
    }
  }

  private buildAdventureTop() {
    if (!this.run) return;
    place(this.turn, this.layout.turn); this.turn.textContent = `第 ${this.run.fight} 仗 · 第 ${this.state.turn} 回合`; this.scene.append(this.turn);
    this.renderHearts(); this.buildRelicBar();
    const act = el('div', 'act-label', `门厅 · 第 ${this.run.room} 间`); place(act, this.layout.actLabel); this.scene.append(act);
    const p = this.layout.progress; const progress = el('div', 'fight-progress'); place(progress, { x:p.x, y:p.y-p.node/2, w:p.w, h:p.node });
    const line = el('div', 'progress-line'); progress.append(line);
    RUN.fights.forEach((fight,i) => {
      const node = el('div', 'progress-node'); const asset = fight.type === 'doors' ? 'ui_node_door' : fight.type === 'boss' ? 'ui_node_boss' : fight.type === 'elite' ? 'ui_node_elite' : 'ui_node_fight';
      node.append(this.store.create(asset)); place(node, { x: i*(p.w-p.node)/(RUN.fights.length-1), y:0, w:p.node, h:p.node });
      node.classList.toggle('done', i+1 < this.run!.fight || (this.run!.phase === 'loot' && i+1 === this.run!.fight)); node.classList.toggle('current', i+1 === this.run!.fight); node.setAttribute('aria-label', `第 ${i+1} 仗${i+1===this.run!.fight?'，当前':''}`); progress.append(node);
    }); this.scene.append(progress);
    if (this.run.phase !== 'battle') return;
    place(this.hpBar, this.layout.hpBar); this.hpBar.replaceChildren(); this.store.nineSlice(this.hpBar, 'ui_hp_frame', this.layout.hpBorder);
    const inner = this.store.get('ui_hp_frame').definition.inner ?? [8,8,8,8];
    const slot = el('div', 'hp-slot'); Object.assign(slot.style, { top:`${inner[0]}px`,right:`${inner[1]}px`,bottom:`${inner[2]}px`,left:`${inner[3]}px` }); slot.append(this.hpUnder,this.hpChip,this.hpFill,this.hpGhost); this.hpBar.append(slot,this.hpText); this.scene.append(this.hpBar); delete this.hpBar.dataset.layer;
    place(this.ruleButton, this.layout.ruleSign); this.ruleButton.replaceChildren(this.ruleSign); this.scene.append(this.ruleButton);
    const c = this.layout.countdown; const hb = this.layout.hpBar; const coversBar = c.x - c.size/2 < hb.x + hb.w/2 && c.x + c.size/2 > hb.x; this.hpText.style.paddingLeft = this.run.monster.key === 'clock' || !coversBar ? '' : `${Math.max(0, c.x+c.size/2-hb.x)}px`; place(this.countdownNode, { x:c.x-c.size/2,y:c.y-c.size/2,w:c.size,h:c.size });
    this.countdownNode.replaceChildren(this.countdownArt,this.countdownText,this.countdownPreview); this.scene.append(this.countdownNode);
  }
  private renderHearts() {
    if (!this.run) return;
    const h = this.layout.hearts;
    for (let i=0;i<this.run.maxHearts;i++) {
      const id = i < (this.healingHearts ?? this.run.hearts) || i === this.losingHeart ? 'ui_heart' : 'ui_heart_empty'; let heart = this.heartNodes[i];
      if (!heart || heart.dataset.artId !== id) { if (heart instanceof SVGSVGElement) this.store.stop(heart); heart?.remove(); heart = this.store.create(id); this.heartNodes[i] = heart; this.scene.append(heart); }
      place(heart,{x:h.x+i*(h.size+h.gap),y:h.y,w:h.size,h:h.size}); heart.classList.add('adventure-heart'); heart.setAttribute('aria-label', i<this.run.hearts?'心':'空心');
    }
  }
  private renderBattleStatus() {
    if (!this.run) return;
    this.renderHearts(); const m = this.run.monster;
    // 血条不写数字：按层显示（小怪 1 层、精英 2、首领 3），每层一种颜色，当前层下面垫着下一层
    const fightType = RUN.fights[this.run.fight - 1]!.type; const layers = RUN.hpLayers[fightType === 'doors' ? 'normal' : fightType]; const per = m.maxHp / layers;
    // 排牌时血条还停在回合开始的血，虚线段是“打出去以后会掉的”；连打时 strikeHp 一下下往下掉
    const shown = Math.max(0, Math.min(m.maxHp, this.strikeHp ?? (this.state.row.length ? m.turnStartHp : m.hp))); const predicted = Math.max(0, m.hp);
    const layerOf = (hp: number) => hp > 0 ? Math.min(layers, Math.ceil(hp / per - 1e-9)) : 0;
    const layer = layerOf(shown); const fraction = layer ? (shown - (layer - 1) * per) / per : 0;
    const predictedLayer = layerOf(predicted); const ghostFrom = predicted < shown ? predictedLayer === layer ? (predicted - (layer - 1) * per) / per : 0 : fraction;
    const shownBroken = this.strikeHp !== null ? this.strikeHp <= 0 : this.state.row.length ? false : m.broken;
    const willBreak = !shownBroken && m.broken;
    const colorOf = (n: number) => n <= 1 ? 'var(--hpFill)' : HP_LAYER_COLORS[n - 1]!;
    this.hpFill.style.background = colorOf(layer); this.hpUnder.style.background = layer > 1 ? colorOf(layer - 1) : 'transparent';
    if (this.hpBar.dataset.layer !== String(layer)) { this.hpChip.style.transition = 'none'; this.hpFill.style.transition = 'none'; this.hpChip.style.transform = this.hpFill.style.transform = `scaleX(${fraction})`; void this.hpChip.offsetWidth; this.hpChip.style.transition = ''; this.hpFill.style.transition = ''; this.hpBar.dataset.layer = String(layer); }
    this.hpFill.style.transform = `scaleX(${fraction})`; this.hpChip.style.transform = `scaleX(${fraction})`;
    Object.assign(this.hpGhost.style, { left: `${ghostFrom * 100}%`, width: `${Math.max(0, fraction - ghostFrom) * 100}%` }); this.hpGhost.hidden = this.strikeHp !== null || ghostFrom >= fraction;
    this.hpText.classList.toggle('broken', shownBroken || willBreak); this.hpText.replaceChildren();
    if (shownBroken) this.hpText.textContent = `打穿了！超杀 ${formatOverkill(m.overkill)}`;
    else if (willBreak) this.hpText.textContent = `能打穿！超杀 ${formatOverkill(m.overkill)}`;
    else this.hpText.append(el('span','',MONSTERS[m.key].name), el('span','hp-layers', layers > 1 ? predictedLayer < layer && this.strikeHp === null ? `×${layer} → ×${predictedLayer}` : `×${layer}` : ''));
    this.hpBar.dataset.hp = String(m.hp); this.hpBar.dataset.shownHp = String(shown); this.hpBar.setAttribute('aria-label', shownBroken || willBreak ? this.hpText.textContent ?? '' : `${MONSTERS[m.key].name}，还剩 ${Math.ceil(shown / m.maxHp * 100)}% 血${predicted < shown ? `，打出去以后剩 ${Math.ceil(predicted / m.maxHp * 100)}%` : ''}${layers > 1 ? `，${layer} 层` : ''}`);
    this.renderRuleSign();
    const label = !this.state.row.length ? '结束回合' : '打出去'; this.setEndLabel(label); this.endButton.classList.toggle('claim-ready', m.broken);
    this.store.setStay(this.dummy,shownBroken?'daze':m.woundDown?'wound_down':null); this.updateCountdown(this.attacking ? 0 : m.countdown);
  }
  private updateCountdown(value: number, tick = false) {
    if (!this.run) return;
    if (this.run.monster.key === 'clock') { this.store.setSlotText(this.dummy,'countdown_slot',value); if (tick) this.store.play(this.dummy,'tick'); }
    this.countdownText.textContent=String(value); this.countdownNode.setAttribute('aria-label',`还有 ${value} 回合出手`);
    this.store.setStay(this.countdownArt,value<=1&&!this.run.monster.broken?'warn':null);
    if (tick) { this.store.play(this.countdownArt,'tick'); this.countdownText.animate([{transform:'scale(1.3)'},{transform:'scale(1)'}],{duration:300}); }
  }
  private banner(text: string, persistent = false) {
    const node=el('div','adventure-banner'); place(node,this.layout.banner); node.append(this.store.create('ui_banner'),el('strong','',text)); this.fxLayer.append(node);
    node.animate([{transform:'translateY(-40px)',opacity:0},{transform:'translateY(0)',opacity:1}],{duration:250,fill:'backwards'});
    if (!persistent) this.later(()=> { node.animate([{opacity:1},{opacity:0}],{duration:300,fill:'forwards'}).onfinish=()=>node.remove(); },1000);
    return node;
  }
  private enterFight() {
    if (!this.run || this.run.phase !== 'battle') return;
    this.monsterMotion.animate([{transform:'translateY(40px)',opacity:0},{transform:'translateY(0)',opacity:1}],{duration:500});
    this.banner(`第 ${this.run.fight} 仗`); this.toast(`${MONSTERS[this.run.monster.key].name}：${MONSTERS[this.run.monster.key].line}`);
    this.renderHand(this.state.hand.map(c=>c.id));
    for(const id of ['start2','slow','first2']){const node=this.relicNodes.get(id);if(node)this.feel.relic(node);}
    if(this.run.relics.includes('slow')){this.sound.slowBeat();this.countdownNode.classList.add('countdown-green');this.feel.countdown(this.countdownNode);this.later(()=>this.countdownNode.classList.remove('countdown-green'),300);}

  }
  private deathTransition(oldHearts: number) {
    if (!this.run) return;
    this.transition=true; this.rowLayer.replaceChildren(); this.handLayer.replaceChildren(); this.rowNodes.clear(); this.handNodes.clear();
    this.mult.style.opacity='0'; this.formula.style.opacity='0'; this.undoButton.hidden=true; this.deckButton.hidden=true; this.endButton.hidden=true; this.growth.forEach(g=>g.hidden=true);
    this.store.setStay(this.dummy,null); const defeated = this.dummy; const deathDuration = this.store.play(defeated,'die'); this.later(() => defeated.remove(), deathDuration);
    this.later(()=>{ this.effect('fx_overkill',this.layout.floating,undefined,1.5); const text=el('div','overkill-announcement',`超杀 ${formatOverkill(this.run!.monster.overkill)}`); text.style.left=`${this.layout.floating.x}px`;text.style.top=`${this.layout.floating.y}px`;this.fxLayer.append(text);this.later(()=>text.remove(),1300); },300);
    const finish=()=> { this.transition=false; this.resetEffects(); this.mult.style.opacity='';this.formula.style.opacity='';this.syncPresentation(); this.buildScene(); this.render(); this.enterFight(); if (this.run?.phase==='loot') this.animateLoot(); };
    if (this.run.phase==='relic' && this.run.relics.length > 0) this.later(()=>{ this.banner('背包变大 · 心回满');this.toast('手牌上限 7 → 8，心回满了');this.healingHearts=oldHearts;this.renderHearts();for(let i=oldHearts;i<this.run!.hearts;i++)this.later(()=>{this.healingHearts=i+1;this.renderHearts();const heart=this.heartNodes[i];if(heart instanceof SVGSVGElement)this.store.play(heart,'gain');const h=this.layout.hearts;this.effect('fx_heal',{x:h.x+i*(h.size+h.gap)+h.size/2,y:h.y+h.size/2});if(heart instanceof HTMLElement || heart instanceof SVGElement)this.feel.heal(heart);this.sound.heal();},(i-oldHearts)*150);this.later(finish,1200);},1800);
    else if (this.run.hearts > oldHearts) this.later(() => { this.banner('回了一颗心'); this.renderHearts(); const h = this.layout.hearts; const heart = this.heartNodes[oldHearts]; if (heart instanceof SVGSVGElement) this.store.play(heart, 'gain'); this.effect('fx_heal', { x: h.x + oldHearts * (h.size + h.gap), y: h.y }); this.sound.heal(); this.later(finish, 800); }, 1800);
    else this.later(finish,1800);
  }
  private buildLoot() {
    if (!this.run) return;
    this.banner('战利品',true); this.lootCards=[];
    const chest=this.store.createInline('loot_chest');this.placeAnchored(chest,'loot_chest',this.layout.loot.chest,this.layout.monsterScale.normal);this.scene.append(chest);this.store.setStay(chest,'open');
    const points=this.run.loot.length===4?this.layout.loot.four:this.layout.loot.three;
    this.run.loot.forEach((type,i)=>{
      const card=el('button','loot-card') as HTMLButtonElement;card.type='button';card.dataset.lootIndex=String(i);card.setAttribute('aria-label',`${i+1} ${TOOLS[type].name}，点一下选中，再点“拿”`);
      place(card,{...points[i],w:MOTION.cardW*this.layout.loot.scale,h:MOTION.cardH*this.layout.loot.scale});
      const face=createCard(this.store,createToolCard(type,-i-1),this.state.xp,true,{ thresholds: growthThresholds(this.run ?? this.state) });face.style.transform=`scale(${this.layout.loot.scale})`;card.append(face);card.addEventListener('click',()=>this.selectLoot(i));this.scene.append(card);this.lootCards.push(card);
    });
    place(this.lootHint,this.layout.loot.hint);this.scene.append(this.lootHint);
    this.button('不拿',this.layout.loot.skip,()=>this.takeLoot(-1)).dataset.action='skip-loot';
    this.takeButton=this.button('拿',this.layout.loot.take,()=>{if(this.selectedLoot>=0)this.takeLoot(this.selectedLoot);},undefined,true);this.takeButton.dataset.action='take-loot';
    this.updateLootSelection();
  }
  private animateLoot() {
    const chest=this.scene.querySelector<SVGSVGElement>('[data-art-id="loot_chest"]');if (chest) {this.store.stop(chest);this.store.play(chest,'drop');this.later(()=>this.store.setStay(chest,'open'),500);}
    this.lootCards.forEach((node,i)=>{
      const face=node.firstElementChild as HTMLElement;const back=this.store.create('card_back');back.classList.add('loot-card-back');node.append(back);face.style.visibility='hidden';
      node.animate([{transform:`translate(${this.layout.loot.chest.x-parseFloat(node.style.left)}px,${this.layout.loot.chest.y-parseFloat(node.style.top)}px) scale(.3)`,opacity:0},{transform:'translate(0,0) scale(1)',opacity:1}],{duration:400,delay:700+i*120,fill:'backwards'});
      this.later(()=>{node.animate([{transform:'scaleX(1)'},{transform:'scaleX(0)'},{transform:'scaleX(1)'}],{duration:300});this.later(()=>{back.remove();face.style.visibility='';},150);},1100+i*120);
    });
  }
  private updateLootSelection() {
    if (!this.run) return;
    this.lootCards.forEach((node,i)=>{node.classList.toggle('selected',i===this.selectedLoot);node.setAttribute('aria-pressed',String(i===this.selectedLoot));});
    const picked=this.run.loot[this.selectedLoot];
    this.lootHint.textContent=picked?`选了「${TOOLS[picked].name}」，点“拿”放进牌组`:this.run.monster.overkill>=RUN.lootBonusOverkill?`超杀 ${formatOverkill(this.run.monster.overkill)}！多一张可选`:'选一张，再点“拿”';
    if(this.takeButton)this.takeButton.disabled=!picked;
  }
  /** 只选中；拿走要按“拿” */
  private selectLoot(index: number) { if (this.transition || this.run?.phase!=='loot' || !this.run.loot[index]) return; this.selectedLoot=index;this.updateLootSelection(); }
  private takeLoot(index: number) {
    if (this.transition||this.run?.phase!=='loot') return;
    const node=this.lootCards[index];this.resetEffects();this.transition=true;
    if (index<0) skipLoot(this.run);else chooseLoot(this.run,index);
    this.state=this.run.game;this.persist();
    this.lootCards.forEach((card,i)=>{ if (i===index) {card.animate([{transform:'translateY(-40px) scale(1.15)'},{transform:`translate(${this.layout.deck.x-parseFloat(card.style.left)}px,${this.layout.deck.y-parseFloat(card.style.top)}px) scale(.3)`,opacity:0}],{duration:500,fill:'forwards'});}else card.animate([{opacity:1},{opacity:0}],{duration:300,fill:'forwards'});});

    if (node) {const count=this.roundButton('牌库',this.layout.deck,()=>{},'ui_icon_deck');count.disabled=true;const n=el('span','count-bubble',String(this.run.cards.length));count.append(n);n.animate([{transform:'scale(1.4)'},{transform:'scale(1)'}],{duration:300});}
    this.later(()=>{this.transition=false;this.selectedLoot=-1;this.resetEffects();this.syncPresentation();this.buildScene();this.render();this.enterFight();},500);
  }
  private buildResult() {
    const result=this.run?.result;if(!result)return;
    this.banner(result.outcome==='victory'?'胜利':'失败',true);
    const panel=el('section','result-panel');place(panel,this.layout.result.panel);this.store.nineSlice(panel,'ui_panel',48);
    panel.append(el('p','knocker-result',result.outcome==='victory'?'老门环：行，这回算你的。龙叼着宝石往长廊里跑了，长廊的门过些日子才开。':`老门环：倒在${MONSTERS[result.monster].name}手上了。身上的宝物，龙收下了。`));
    if(result.outcome==='defeat')panel.append(el('div','result-heading',`倒在第 ${result.fight} 仗 · ${MONSTERS[result.monster].name}`));
    else if(result.newRecords.farthest)panel.append(el('div','result-heading','通关！ 新纪录'));
    const countRows: { node: HTMLElement; value: number; format: (n:number)=>string }[] = [];
    const add=(label:string,value:string,record=false,count?:{value:number;format:(n:number)=>string})=>{const row=el('div','result-row');const number=el('strong','',value);row.append(el('span','',label),number);if(record)row.append(el('em','new-record','新纪录'));panel.append(row);if(count)countRows.push({node:number,...count});};
    add(`打了 ${result.totalTurns} 回合`,'');add('最高一回合',`${formatFull(result.bestTurn)}   第 ${result.bestFight} 仗`,result.newRecords.bestTurn,{value:result.bestTurn,format:n=>`${formatFull(n)}   第 ${result.bestFight} 仗`});add('最大超杀',formatOverkill(result.maxOverkill),result.newRecords.maxOverkill,{value:result.maxOverkill,format:formatOverkill});add('总伤害',formatFull(result.totalDamage),false,{value:result.totalDamage,format:formatFull});
    add('宝石',result.gemForms.map((f,i)=>`${['红','绿','蓝'][i]} ${FORMS[f]}`).join(' · '));
    const extras=TOOL_TYPES.map(t=>{const n=result.extraCards.filter(c=>c.type===t).length;return n?`${TOOLS[t].name}${n>1?` ×${n}`:''}`:'';}).filter(Boolean).join(' · ');add('拿到的额外牌',extras||'没有');add('进了几次工坊',String(this.run!.shopsVisited));add('带了几件宝物',String(this.run!.relics.length));
    this.scene.append(panel);panel.animate([{transform:'translateY(60px)',opacity:0},{transform:'translateY(0)',opacity:1}],{duration:400});
    panel.querySelectorAll('.result-row').forEach((row,i)=>row.animate([{opacity:0,transform:'translateY(12px)'},{opacity:1,transform:'translateY(0)'}],{duration:300,delay:i*300,fill:'backwards'}));
    countRows.forEach((count,i)=>{for(let step=0;step<=10;step++)this.later(()=>{count.node.textContent=count.format(count.value*step/10);},(i+1)*300+step*30);});
    this.button('回首页',this.layout.result.home,()=>this.goHome()).dataset.action='home';this.button('再来一局',this.layout.result.again,()=>this.startAdventure(),undefined,true).dataset.action='again';
  }
  private showMonster() {
    if (!this.run) return;
    const m = this.run.monster; const panel = this.openModal('怪的介绍');
    panel.append(el('h3', '', MONSTERS[m.key].name), el('p', '', MONSTERS[m.key].line), el('p', '', `血量 ${formatFull(m.hp)} / ${formatFull(m.maxHp)} · 每 ${m.maxCountdown} 回合出手一次`));
    const active = currentRule(this.run); const ids = m.key === 'dragon' ? ['hug', 'bite', 'bell'] as const : active ? [active] : [];
    ids.forEach(id => panel.append(el('h3', '', `${RULES[id].name}${active === id ? ' · 现在' : ''}`), el('p', '', RULES[id].text)));
    if (ruleSealed(this.run)) panel.append(el('p', '', '这回合不算'));
    if (m.broken) panel.append(el('p', '', '打穿了，这回合规矩不再起作用。'));
  }
  private debugRefresh() {if(this.screen==='adventure'&&this.run)this.state=this.run.game;this.cancelDrag();this.closeModal();this.resetEffects();this.transition=false;this.syncPresentation();this.buildScene();this.render();this.persist();}
  private debugJumpFight(fight:number) {
    if(!this.debugEnabled||!Number.isInteger(fight)||fight<1||fight>6)return;
    if(!this.run)this.startAdventure(); if(this.run!.phase==='relic'&&!this.run!.relics.length)chooseRelic(this.run!,0); debugJumpRoom(this.run!,fight);
    this.state=this.run!.game;this.debugRefresh();
  }
  private debugHp(value:number) { if (!this.debugEnabled || !this.run) return; debugSetMonsterHp(this.run, value); this.debugRefresh(); }
  private debugCountdown(value:number) { if (!this.debugEnabled || !this.run) return; debugSetCountdown(this.run, value); this.debugRefresh(); }
  private debugWind(value:number) { if (!this.debugEnabled || !this.run) return; debugSetWind(this.run, value); this.debugRefresh(); }
  private debugRelic(id:RelicId) { if (!this.debugEnabled || !this.run) return; debugGiveRelic(this.run, id); this.debugRefresh(); }
  private debugHearts(value:number) {if(!this.debugEnabled||!this.run||!Number.isInteger(value)||value<1||value>this.run.maxHearts)return;this.run.hearts=value;this.debugRefresh();}
  private debugGiveTool(type:ToolType,ignoreCap=false) {if(!this.debugEnabled||!TOOL_TYPES.includes(type))return;if(this.run){try{giveRunTool(this.run,type,ignoreCap);this.debugRefresh();}catch(error){this.toast(error instanceof Error?error.message:'带满了');}return;}if(!this.playing)this.startPractice();const cards=[...this.state.deck,...this.state.hand,...this.state.row,...this.state.discard];this.state.hand.push(createToolCard(type,Math.max(0,...cards.map(c=>c.id))+1));this.state.hist=[];this.debugRefresh();}
  private debugDeal(sequence: readonly (number|ToolType)[], test?:number) {
    if(!this.debugEnabled)return;if(!this.playing)this.startPractice();
    const original=this.run?.cards??[...this.state.deck,...this.state.hand,...this.state.row,...this.state.discard].map(c=>c.type?createToolCard(c.type,c.id):{...c});const pool=original.map(c=>({...c}));const hand:Card[]=[];let id=Math.max(0,...pool.map(c=>c.id));
    for(const value of sequence){if(typeof value==='number'&&(!Number.isInteger(value)||value<0||value>7))throw new Error('宝石位必须是 0–7');if(typeof value==='string'&&!TOOL_TYPES.includes(value))throw new Error('未知额外牌');const at=pool.findIndex(c=>typeof value==='number'?!c.type&&c.v===value:c.type===value);if(at>=0)hand.push(pool.splice(at,1)[0]);else{const card=typeof value==='number'?{id:++id,v:value}:createToolCard(value,++id);hand.push(card);if(this.run)this.run.cards.push({...card});}}
    this.state.hand=hand;this.state.deck=pool;this.state.row=[];this.state.discard=[];this.state.hist=[];this.state.m=1;this.state.turnDmg=0;this.state.rainbow=false;this.state.chain=[];this.state.chainIdx=[];this.state.xp=test===11?[10,0,0]:[0,0,0];
    if(this.run){this.run.hist=[];this.run.monster.broken=false;this.run.monster.hp=this.run.monster.maxHp;this.run.monster.turnStartHp=this.run.monster.hp;this.run.monster.overkill=0;debugSetMonsterHp(this.run,this.run.monster.maxHp);}
    this.debugRefresh();if(test)this.toast(`用例 ${test}：按手牌从左到右出牌`);
  }
  private buildDebug(panel:HTMLElement) {
    panel.append(el('h3','','测试入口（仅 debug=1）'));
    const scaleRow=el('div','debug-actions');scaleRow.append(el('span','',`血量倍数 ×${RUN.hpScale}（新开一局生效）`));[1,1.5,2,3,4].forEach(value=>{const button=el('button','',`×${value}`);button.addEventListener('click',()=>{RUN.hpScale=value;this.closeModal();this.showSettings();});scaleRow.append(button);});panel.append(scaleRow);
    this.modalAction(panel,'直接进工坊',()=>{if(!this.run)this.startAdventure();debugEnterShop(this.run!);this.shopMode=null;this.shopSelected=[];this.debugRefresh();});
    if(this.run){this.modalAction(panel,ruleSealed(this.run)?'撕掉封条':'给怪贴封条',()=>{debugSetSealed(this.run!,!ruleSealed(this.run!));this.debugRefresh();});}
    const forced=el('div','debug-actions');const picks=Array.from({length:2},()=>{const monster=document.createElement('select'),reward=document.createElement('select');RUN.normalMonsters.forEach(key=>{const option=document.createElement('option');option.value=key;option.textContent=MONSTERS[key].name;monster.append(option);});(['card','shop','heal'] as const).forEach(key=>{const option=document.createElement('option');option.value=key;option.textContent={card:'额外牌',shop:'工坊',heal:'回一颗心'}[key];reward.append(option);});forced.append(monster,reward);return{monster,reward};});picks[1].monster.selectedIndex=1;picks[1].reward.selectedIndex=1;
    const force=el('button','','指定两扇门');force.addEventListener('click',()=>{if(!this.run)this.startAdventure();try{debugSetDoors(this.run!,picks.map(p=>{const monster=p.monster.value as typeof RUN.normalMonsters[number];return{monster,rule:MONSTERS[monster].rule,reward:p.reward.value as 'card'|'shop'|'heal'};}));this.selectedDoor=-1;this.debugRefresh();}catch(error){this.toast(error instanceof Error?error.message:'门设置无效');}});forced.append(force);panel.append(forced);

    const fights=el('div','debug-actions');for(let n=1;n<=6;n++){const button=el('button','',`第 ${n} 仗`);button.dataset.debugFight=String(n);button.addEventListener('click',()=>this.debugJumpFight(n));fights.append(button);}panel.append(fights);
    const inputRow=(label:string,value:string,apply:(v:string)=>void)=>{const row=el('div','setting-row debug-input');const input=document.createElement('input');input.value=value;input.setAttribute('aria-label',label);const button=el('button','',label);button.addEventListener('click',()=>{try{apply(input.value);}catch(error){this.toast(error instanceof Error?error.message:'输入不正确');}});row.append(input,button);panel.append(row);};
    if(this.run)inputRow('把手牌加到 N 张（最多 12）',String(this.state.hand.length),v=>{debugFillHand(this.run!,Number(v));this.debugRefresh();});
    if(this.run?.phase==='battle'){inputRow('设怪的血',String(this.run.monster.hp),v=>this.debugHp(Number(v)));inputRow(`设心（1–${this.run.maxHearts}）`,String(this.run.hearts),v=>this.debugHearts(Number(v)));inputRow('设倒计时',String(this.run.monster.countdown),v=>this.debugCountdown(Number(v)));if(this.run.monster.maxWind)inputRow('设发条',String(this.run.monster.wind),v=>this.debugWind(Number(v)));}
    const relics=el('div','debug-actions'); (Object.keys(RELICS) as RelicId[]).forEach(id => { const button=el('button','',`给宝物：${RELICS[id].name}`);button.addEventListener('click',()=>this.debugRelic(id));relics.append(button); }); panel.append(relics);
    this.modalAction(panel,'跳到选宝物画面',()=>{if(this.run) {debugRelicSelection(this.run);this.selectedRelic=-1;this.debugRefresh();}else this.startAdventure();});
    const capLabel=el('label','','不管上限');const ignoreCap=document.createElement('input');ignoreCap.type='checkbox';capLabel.prepend(ignoreCap);panel.append(capLabel);
    const tools=el('div','debug-actions');TOOL_TYPES.forEach(type=>{const button=el('button','',`给一张${TOOLS[type].name}`);button.addEventListener('click',()=>this.debugGiveTool(type,ignoreCap.checked));tools.append(button);});panel.append(tools);
    inputRow('发指定的牌','1,3,2,6,4,5,hammer',v=>this.debugDeal(v.split(/[\s,，]+/).filter(Boolean).map(v=>/^\d+$/.test(v)?Number(v):v as ToolType)));
    const cases=el('div','debug-actions');Object.keys(DEBUG_SEQUENCES).forEach(key=>{const button=el('button','',`用例 ${key} 发牌`);button.dataset.debugCase=key;button.addEventListener('click',()=>this.debugDeal(DEBUG_SEQUENCES[Number(key)],Number(key)));cases.append(button);});panel.append(cases);
  }
  private installDebug() {
    const api={enterShop:()=>{if(this.run){debugEnterShop(this.run);this.shopMode=null;this.debugRefresh();}},selectDoor:(n:number)=>this.selectDoor(n,false),chooseDoor:(n:number)=>{this.selectedDoor=n;this.selectDoor(n);},fillHand:(n:number)=>{if(this.run){debugFillHand(this.run,n);this.debugRefresh();}},setSealed:(sealed:boolean)=>{if(this.run){debugSetSealed(this.run,sealed);this.debugRefresh();}},setHpScale:(n:number)=>{RUN.hpScale=n;},snapshot:()=>JSON.parse(JSON.stringify(this.state)) as GameState,runSnapshot:()=>this.run?JSON.parse(JSON.stringify(this.run)) as RunState:null,screen:()=>this.screen,
      startAdventure:()=>this.startAdventure(),practice:()=>this.startPractice(),goHome:()=>this.goHome(),resume:()=>this.resumeAdventure(),debugJumpFight:(n:number)=>this.debugJumpFight(n),setMonsterHp:(n:number)=>this.debugHp(n),setCountdown:(n:number)=>this.debugCountdown(n),setWind:(n:number)=>this.debugWind(n),giveRelic:(id:RelicId)=>this.debugRelic(id),selectRelic:(n:number)=>this.selectRelic(n),chooseRelic:(n:number)=>this.takeRelic(n),setHearts:(n:number)=>this.debugHearts(n),giveTool:(type:ToolType)=>this.debugGiveTool(type),dealCards:(sequence:(number|ToolType)[])=>this.debugDeal(sequence),scenario:(n:number)=>this.debugDeal(DEBUG_SEQUENCES[n],n),
      deal:(n:number)=>this.debugDeal(DEBUG_SEQUENCES[n],n),endTurn:()=>this.finishTurn(),play:(index=0)=>this.playById(this.state.hand[index]?.id),undo:()=>this.rewind(),end:()=>this.finishTurn(),chooseLoot:(index:number)=>this.takeLoot(index),selectLoot:(index:number)=>this.selectLoot(index),skipLoot:()=>this.takeLoot(-1),records:()=>({...this.localRecords})};
    Object.assign(window,{__gemcard:api});
  }
  private showSettings() {
    const panel = this.openModal('设置');
    const addChoice = (title: string, choices: { label: string; value: string | number | boolean }[], current: string | number | boolean, select: (v: string | number | boolean) => void) => {
      const row = el('div', 'setting-row'); row.append(el('span', '', title)); const group = el('div', 'choice-group');
      choices.forEach(choice => { const button = document.createElement('button'); button.textContent = choice.label; button.className = choice.value === current ? 'selected' : ''; button.setAttribute('aria-pressed', String(choice.value === current)); button.addEventListener('click', () => { this.resetEffects(); this.transition = false; select(choice.value); this.savePreferences(); this.persist(); this.syncPresentation(); this.buildScene(); this.render(); this.showSettings(); }); group.append(button); }); row.append(group); panel.append(row);
    };
    addChoice('声音', [{label:'开',value:true},{label:'关',value:false}],this.prefs.sound,value=>{this.prefs.sound=Boolean(value);});
    addChoice('音量', [{label:'低',value:1},{label:'中',value:2},{label:'高',value:3}],this.prefs.volume,value=>{this.prefs.volume=Number(value) as 1|2|3;});
    addChoice('震屏', [{label:'开',value:true},{label:'关',value:false}],this.prefs.shake,value=>{this.prefs.shake=Boolean(value);});
    addChoice('动画速度', [{label:'正常',value:'normal'},{label:'快',value:'fast'}],this.prefs.animationSpeed,value=>{this.prefs.animationSpeed=value as 'normal'|'fast';});
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
