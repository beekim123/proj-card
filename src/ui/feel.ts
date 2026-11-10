import './feel.css';

export interface FeelSettings { shake: boolean; animationSpeed: 'normal' | 'fast' }
export type FeelNode = HTMLElement | SVGElement;
export type ShakeLevel = 'small' | 'medium' | 'large';
export type RuleFeel = 'bite' | 'hug' | 'unwind' | 'wound_down' | 'bell' | 'layer';

/** All impact tuning lives here, in design pixels and wall-clock milliseconds. */
export const FEEL = {
  cardDrop: { pixels: 6, ms: 120 },
  hitstop: { normal: 60, big: 120, cap: 120, fastFactor: 0.5 },
  flash: { brightness: 2.2, normalHold: 16, bigHold: 80, fadeMs: 80 },
  recoil: { normal: 16, big: 32, reachMs: 50, holdMs: 80, returnMs: 250, overshoot: 0.12 },
  number: { ms: 280, startScale: 0.6, peakScale: 1.3, smallSize: 44, mediumSize: 60, largeSize: 80, mediumAt: 10_000, largeAbove: 1_000_000 },
  multiplier: { ms: 300, doubleScale: 1.25, plusScale: 1.1 },
  shake: { small: { pixels: 3, ms: 150 }, medium: { pixels: 8, ms: 250 }, large: { pixels: 14, ms: 380 } },
  slow: { ms: 300, rate: 0.5 },
  whiteScale: 1.3,
  rainbow: { stepMs: 60, lightMs: 120, brightness: 1.8, effectScale: 2 },
  relic: { ms: 200, scale: 1.3, brightness: 1.7 },
  rule: { ms: 300, pixels: 5, flipMs: 400, changeMs: 200 },
  heal: { ms: 300, scale: 1.25, gapMs: 150 },
  attack: { windupMs: 250, impactMs: 330, holdUntilMs: 450, totalMs: 800, scale: 1.3, down: 40 },
  vignette: { ms: 500, opacity: 0.55 },
} as const;

export function damageTier(damage: number): 'small' | 'medium' | 'large' {
  return damage > FEEL.number.largeAbove ? 'large' : damage >= FEEL.number.mediumAt ? 'medium' : 'small';
}
export function hitstopDuration(big = false, fast = false): number {
  return Math.min(FEEL.hitstop.cap, big ? FEEL.hitstop.big : FEEL.hitstop.normal) * (fast ? FEEL.hitstop.fastFactor : 1);
}

interface PauseRecord { timer: ReturnType<typeof setTimeout> }
interface SlowRecord { rate: number; timer: ReturnType<typeof setTimeout> }
export interface FeelRoots { stage: HTMLElement; fxLayer: HTMLElement }
export interface HitFeedback { monster: FeelNode; damage?: number; big?: boolean; pierce?: boolean; roots?: Element[] }

/**
 * Pure presentation: callers provide rule results, positioned nodes and artwork events.
 * Every method starts immediately; there is no action queue, input lock or rules mutation.
 * Transform animations are additive, preserving anchors, layout scale and card rotation.
 */
export class FeelSystem {
  private settings: FeelSettings;
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private animations = new Set<Animation>();
  private paused = new Map<Animation, PauseRecord>();
  private slowed = new Map<Animation, SlowRecord>();
  private overlays = new Set<HTMLElement>();
  private disposed = false;

  constructor(private readonly roots: FeelRoots, settings: Partial<FeelSettings> = {}) {
    this.settings = { shake: settings.shake ?? true, animationSpeed: settings.animationSpeed ?? 'normal' };
  }
  configure(settings: Partial<FeelSettings>): void {
    if (typeof settings.shake === 'boolean') this.settings.shake = settings.shake;
    if (settings.animationSpeed === 'normal' || settings.animationSpeed === 'fast') this.settings.animationSpeed = settings.animationSpeed;
    if (this.settings.animationSpeed === 'fast') this.restoreSlow();
  }

  private later(callback: () => void, ms: number): ReturnType<typeof setTimeout> {
    const timer = setTimeout(() => { this.timers.delete(timer); if (!this.disposed) callback(); }, ms);
    this.timers.add(timer); return timer;
  }
  private cancelTimer(timer: ReturnType<typeof setTimeout>): void { clearTimeout(timer); this.timers.delete(timer); }
  private animate(node: Element, frames: Keyframe[], options: KeyframeAnimationOptions, additive = false): Animation | null {
    if (this.disposed || typeof node.animate !== 'function') return null;
    const animation = node.animate(frames, { ...options, ...(additive ? { composite: 'add' as CompositeOperation } : {}) });
    this.animations.add(animation);
    animation.addEventListener('finish', () => this.animations.delete(animation), { once: true });
    animation.addEventListener('cancel', () => this.animations.delete(animation), { once: true });
    return animation;
  }
  private collect(roots: readonly Element[]): Animation[] {
    const all = new Set<Animation>();
    for (const root of roots) for (const animation of root.getAnimations?.({ subtree: true }) ?? []) all.add(animation);
    return [...all];
  }

  cardDrop(node: FeelNode): void {
    this.animate(node, [{ transform: 'translateY(0)' }, { transform: `translateY(${FEEL.cardDrop.pixels}px)`, offset: 0.42 }, { transform: 'translateY(0)' }], { duration: FEEL.cardDrop.ms, easing: 'ease-out' }, true);
  }

  hit({ monster, big = false, pierce = false, roots = [monster, this.roots.fxLayer] }: HitFeedback): void {
    // Pause artwork already playing. The new flash/recoil starts now, not after hitstop.
    this.pause(hitstopDuration(big, this.settings.animationSpeed === 'fast'), roots);
    const distance = big ? FEEL.recoil.big : FEEL.recoil.normal;
    const total = FEEL.recoil.reachMs + FEEL.recoil.holdMs + FEEL.recoil.returnMs;
    this.animate(monster, [
      { transform: 'translate(0, 0)' },
      { transform: `translate(${distance}px, ${-distance}px)`, offset: FEEL.recoil.reachMs / total },
      { transform: `translate(${distance}px, ${-distance}px)`, offset: (FEEL.recoil.reachMs + FEEL.recoil.holdMs) / total },
      { transform: `translate(${-distance * FEEL.recoil.overshoot}px, ${distance * FEEL.recoil.overshoot}px)`, offset: 0.86 },
      { transform: 'translate(0, 0)' },
    ], { duration: total, easing: 'ease-out' }, true);
    const hold = big ? FEEL.flash.bigHold : FEEL.flash.normalHold;
    this.animate(monster, [
      { filter: `brightness(${FEEL.flash.brightness})` },
      { filter: `brightness(${FEEL.flash.brightness})`, offset: hold / (hold + FEEL.flash.fadeMs) },
      { filter: 'brightness(1)' },
    ], { duration: hold + FEEL.flash.fadeMs });
    if (pierce) { this.shake('large'); this.slow(roots); }
    else this.shake(big ? 'medium' : 'small');
  }

  /** Call on the inner text node so an outer floating-number translation can continue. */
  number(node: FeelNode, damage: number): void {
    const tier = damageTier(damage);
    node.dataset.feelTier = tier;
    node.classList.add('feel-damage');
    const size = FEEL.number[tier === 'large' ? 'largeSize' : tier === 'medium' ? 'mediumSize' : 'smallSize'];
    node.style.setProperty('--feel-damage-size', `${size}px`);
    node.style.fontSize = `${size}px`;
    this.animate(node, [
      { transform: `scale(${FEEL.number.startScale})` },
      { transform: `scale(${FEEL.number.peakScale})`, offset: 0.45 },
      { transform: 'scale(1)' },
    ], { duration: FEEL.number.ms, easing: 'ease-out' }, true);
  }

  multiplier(node: FeelNode, doubled: boolean): void {
    const peak = doubled ? FEEL.multiplier.doubleScale : FEEL.multiplier.plusScale;
    const frames = doubled ? [
      { transform: 'rotateX(0deg) scale(1)' },
      { transform: `rotateX(180deg) scale(${peak})`, offset: 0.5 },
      { transform: 'rotateX(360deg) scale(1)' },
    ] : [{ transform: 'scale(1)' }, { transform: `scale(${peak})` }, { transform: 'scale(1)' }];
    this.animate(node, frames, { duration: FEEL.multiplier.ms, easing: 'ease-in-out' }, true);
  }

  shake(level: ShakeLevel): void {
    if (!this.settings.shake) return;
    const { pixels: p, ms } = FEEL.shake[level];
    this.animate(this.roots.stage, [
      { transform: 'translate(0, 0)' }, { transform: `translate(${p}px, ${-p * 0.5}px)` },
      { transform: `translate(${-p}px, ${p * 0.5}px)` }, { transform: `translate(${p * 0.6}px, ${p * 0.3}px)` },
      { transform: `translate(${-p * 0.3}px, ${-p * 0.2}px)` }, { transform: 'translate(0, 0)' },
    ], { duration: ms, easing: 'linear' }, true);
  }

  /** Artwork attack must begin in the same call stack; the hit callback is exactly 330ms later. */
  attack(monster: FeelNode, onImpact: () => void): void {
    this.animate(monster, [
      { transform: 'translateY(0) scale(1)' },
      { transform: 'translateY(0) scale(1)', offset: FEEL.attack.windupMs / FEEL.attack.totalMs },
      { transform: `translateY(${FEEL.attack.down}px) scale(${FEEL.attack.scale})`, offset: FEEL.attack.impactMs / FEEL.attack.totalMs },
      { transform: `translateY(${FEEL.attack.down}px) scale(${FEEL.attack.scale})`, offset: FEEL.attack.holdUntilMs / FEEL.attack.totalMs },
      { transform: 'translateY(0) scale(1)' },
    ], { duration: FEEL.attack.totalMs, easing: 'linear' }, true);
    this.later(() => { this.vignette(); this.shake('large'); onImpact(); }, FEEL.attack.impactMs);
  }

  private vignette(): void {
    const node = this.roots.stage.ownerDocument.createElement('div'); node.className = 'feel-vignette'; node.setAttribute('aria-hidden', 'true');
    this.roots.fxLayer.append(node); this.overlays.add(node);
    this.animate(node, [{ opacity: 0 }, { opacity: FEEL.vignette.opacity, offset: 0.18 }, { opacity: 0 }], { duration: FEEL.vignette.ms });
    this.later(() => { node.remove(); this.overlays.delete(node); }, FEEL.vignette.ms);
  }

  heal(node: FeelNode): void {
    this.animate(node, [{ transform: 'scale(1)' }, { transform: `scale(${FEEL.heal.scale})` }, { transform: 'scale(1)' }], { duration: FEEL.heal.ms }, true);
  }
  relic(node: FeelNode): void {
    this.animate(node, [{ transform: 'scale(1)', filter: 'brightness(1)' }, { transform: `scale(${FEEL.relic.scale})`, filter: `brightness(${FEEL.relic.brightness})` }, { transform: 'scale(1)', filter: 'brightness(1)' }], { duration: FEEL.relic.ms }, true);
  }
  rule(node: FeelNode, kind: RuleFeel): void {
    if (kind === 'layer') {
      this.animate(node, [{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(90deg)', offset: 0.5 }, { transform: 'rotateY(0deg)' }], { duration: FEEL.rule.flipMs }, true);
      return;
    }
    this.animate(node, [{ transform: 'translateX(0)' }, { transform: `translateX(${FEEL.rule.pixels}px)` }, { transform: `translateX(${-FEEL.rule.pixels}px)` }, { transform: 'translateX(0)' }], { duration: FEEL.rule.ms }, true);
  }
  rainbow(cards: readonly FeelNode[], flashCallback?: () => void): void {
    cards.forEach((card, i) => this.animate(card, [{ filter: 'brightness(1)' }, { filter: `brightness(${FEEL.rainbow.brightness})` }, { filter: 'brightness(1)' }], { duration: FEEL.rainbow.lightMs, delay: i * FEEL.rainbow.stepMs }));
    this.later(() => { this.shake('large'); flashCallback?.(); }, cards.length ? (cards.length - 1) * FEEL.rainbow.stepMs + FEEL.rainbow.lightMs : 0);
  }

  /** Pause only running animations. Repeated hits overlap instead of adding to a queue. */
  pause(ms: number, roots: readonly Element[]): void {
    const duration = Math.max(0, Math.min(FEEL.hitstop.cap, ms));
    for (const animation of this.collect(roots)) {
      const existing = this.paused.get(animation);
      if (!existing && animation.playState !== 'running') continue;
      if (existing) this.cancelTimer(existing.timer);
      else animation.pause();
      const timer = this.later(() => {
        this.paused.delete(animation);
        // A reset/cancel by the artwork owner must not resurrect the old event.
        if (animation.playState === 'paused') animation.play();
      }, duration);
      this.paused.set(animation, { timer });
    }
  }

  slow(roots: readonly Element[]): void {
    if (this.settings.animationSpeed === 'fast') return;
    for (const animation of this.collect(roots)) {
      if (animation.playState === 'idle' || animation.playState === 'finished') continue;
      const existing = this.slowed.get(animation);
      if (existing) this.cancelTimer(existing.timer);
      const rate = existing?.rate ?? animation.playbackRate;
      animation.playbackRate = rate * FEEL.slow.rate;
      const timer = this.later(() => { animation.playbackRate = rate; this.slowed.delete(animation); }, FEEL.slow.ms);
      this.slowed.set(animation, { rate, timer });
    }
  }

  private restoreSlow(): void {
    for (const [animation, record] of this.slowed) { this.cancelTimer(record.timer); animation.playbackRate = record.rate; }
    this.slowed.clear();
  }
  reset(): void {
    this.restoreSlow();
    for (const [animation, record] of this.paused) {
      this.cancelTimer(record.timer);
      if (animation.playState === 'paused') animation.play();
    }
    this.paused.clear();
    for (const timer of this.timers) clearTimeout(timer); this.timers.clear();
    for (const animation of this.animations) animation.cancel(); this.animations.clear();
    for (const node of this.overlays) node.remove(); this.overlays.clear();
  }
  dispose(): void { this.reset(); this.disposed = true; }
}
