import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { damageTier, FEEL, FeelSystem, hitstopDuration } from './feel';

class MockAnimation {
  playState: AnimationPlayState = 'running';
  playbackRate = 1;
  listeners = new Map<string, (() => void)[]>();
  pause = vi.fn(() => { this.playState = 'paused'; });
  play = vi.fn(() => { this.playState = 'running'; });
  cancel = vi.fn(() => { this.playState = 'idle'; this.listeners.get('cancel')?.forEach(callback => callback()); });
  addEventListener(name: string, callback: () => void) { this.listeners.set(name, [...this.listeners.get(name) ?? [], callback]); }
}
class MockNode {
  dataset: Record<string, string> = {};
  style = { fontSize: '', setProperty: vi.fn() };
  classList = { add: vi.fn() };
  className = '';
  children: MockNode[] = [];
  animations: MockAnimation[] = [];
  animate = vi.fn((_frames: Keyframe[], _options: KeyframeAnimationOptions) => { const animation = new MockAnimation(); this.animations.push(animation); return animation as unknown as Animation; });
  getAnimations = vi.fn(() => this.animations as unknown as Animation[]);
  append(node: MockNode) { this.children.push(node); }
  remove = vi.fn();
  setAttribute = vi.fn();
  ownerDocument = { createElement: () => new MockNode() };
}
const element = (node: MockNode) => node as unknown as HTMLElement;

let stage: MockNode;
let fx: MockNode;
let monster: MockNode;
let feel: FeelSystem;
beforeEach(() => { vi.useFakeTimers(); stage = new MockNode(); fx = new MockNode(); monster = new MockNode(); feel = new FeelSystem({ stage: element(stage), fxLayer: element(fx) }); });
afterEach(() => { feel.dispose(); vi.useRealTimers(); });

describe('central feel values', () => {
  it('uses exact damage font boundaries', () => {
    expect([0, 9999, 10_000, 1_000_000, 1_000_001].map(damageTier)).toEqual(['small', 'small', 'medium', 'medium', 'large']);
  });
  it('caps each normal/big hitstop and halves only hitstop in fast mode', () => {
    expect([hitstopDuration(), hitstopDuration(true), hitstopDuration(false, true), hitstopDuration(true, true)]).toEqual([60, 120, 30, 60]);
  });
});

describe('non-blocking presentation', () => {
  it('starts eight card drops immediately, with no timer or feedback queue', () => {
    const card = new MockNode();
    for (let i = 0; i < 8; i++) feel.cardDrop(element(card));
    expect(card.animate).toHaveBeenCalledTimes(8);
    expect(vi.getTimerCount()).toBe(0);
    expect(card.animate.mock.calls[0]![1]).toMatchObject({ duration: 120, composite: 'add' });
  });
  it('uses all three shakes, respecting the switch', () => {
    for (const level of ['small', 'medium', 'large'] as const) feel.shake(level);
    expect(stage.animate.mock.calls.map(call => call[1].duration)).toEqual([150, 250, 380]);
    expect(stage.animate.mock.calls.every(call => call[1].composite === 'add')).toBe(true);
    feel.configure({ shake: false }); feel.shake('large');
    expect(stage.animate).toHaveBeenCalledTimes(3);
  });
  it('plays attack impact at 330ms and removes vignette after 500ms', () => {
    const impact = vi.fn(); feel.attack(element(monster), impact);
    expect(monster.animate.mock.calls[0]![1].duration).toBe(800);
    vi.advanceTimersByTime(329); expect(impact).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1); expect(impact).toHaveBeenCalledOnce();
    expect(fx.children).toHaveLength(1);
    expect(fx.children[0]!.animate.mock.calls[0]![0][1]!.opacity).toBe(0.55);
    vi.advanceTimersByTime(500); expect(fx.children[0]!.remove).toHaveBeenCalledOnce();
  });
  it('reset cancels an interrupted attack and pending callback', () => {
    const impact = vi.fn(); feel.attack(element(monster), impact); feel.reset(); vi.runAllTimers();
    expect(impact).not.toHaveBeenCalled(); expect(monster.animations[0]!.cancel).toHaveBeenCalledOnce();
  });
  it('hits flash immediately and recoils on the outer node with additive transforms', () => {
    const art = new MockAnimation(); monster.animations.push(art);
    feel.hit({ monster: element(monster), big: true });
    expect(art.pause).toHaveBeenCalledOnce();
    expect(monster.animate).toHaveBeenCalledTimes(2);
    expect(monster.animate.mock.calls[0]![0][1]!.transform).toBe('translate(32px, -32px)');
    expect(monster.animate.mock.calls[0]![1].composite).toBe('add');
    expect(monster.animate.mock.calls[1]![0][0]!.filter).toBe('brightness(2.2)');
    vi.advanceTimersByTime(119); expect(art.play).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1); expect(art.play).toHaveBeenCalledOnce();
  });
  it('damage numbers bounce at 280ms and use explicit sizes', () => {
    for (const [damage, size] of [[1, '44px'], [10_000, '60px'], [1_000_001, '80px']] as const) {
      const node = new MockNode(); feel.number(element(node), damage);
      expect(node.style.fontSize).toBe(size);
      expect(node.animate.mock.calls[0]![1].duration).toBe(280);
      expect(node.animate.mock.calls[0]![0].map(frame => frame.transform)).toEqual(['scale(0.6)', 'scale(1.3)', 'scale(1)']);
    }
  });
  it('flips only doubled multipliers; +1 pulses 1.1', () => {
    const badge = new MockNode(); feel.multiplier(element(badge), true); feel.multiplier(element(badge), false);
    expect(badge.animate.mock.calls[0]![0][1]!.transform).toBe('rotateX(180deg) scale(1.25)');
    expect(badge.animate.mock.calls[1]![0][1]!.transform).toBe('scale(1.1)');
  });
  it('rainbow lights in order then runs its final effect, not a generic queue', () => {
    const cards = Array.from({ length: 6 }, () => new MockNode()); const flash = vi.fn();
    feel.rainbow(cards.map(element), flash);
    expect(cards.map(card => card.animate.mock.calls[0]![1].delay)).toEqual([0, 60, 120, 180, 240, 300]);
    vi.advanceTimersByTime(419); expect(flash).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1); expect(flash).toHaveBeenCalledOnce();
  });
});

describe('hitstop and slow-motion ownership', () => {
  it('does not resume art that was already paused by its owner', () => {
    const animation = new MockAnimation(); animation.playState = 'paused'; monster.animations.push(animation);
    feel.pause(120, [element(monster)]); vi.runAllTimers();
    expect(animation.pause).not.toHaveBeenCalled(); expect(animation.play).not.toHaveBeenCalled();
  });
  it('overlapping hitstops renew a deadline instead of stacking durations', () => {
    const animation = new MockAnimation(); monster.animations.push(animation);
    feel.pause(120, [element(monster)]); vi.advanceTimersByTime(20); feel.pause(120, [element(monster)]);
    expect(animation.pause).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(120); expect(animation.play).toHaveBeenCalledOnce();
  });
  it('does not resurrect a canceled art event', () => {
    const animation = new MockAnimation(); monster.animations.push(animation);
    feel.pause(120, [element(monster)]); animation.cancel(); vi.runAllTimers();
    expect(animation.play).not.toHaveBeenCalled();
  });
  it('slow motion preserves original playback rate without repeated halving', () => {
    const animation = new MockAnimation(); animation.playbackRate = 2; monster.animations.push(animation);
    feel.slow([element(monster)]); expect(animation.playbackRate).toBe(1);
    vi.advanceTimersByTime(100); feel.slow([element(monster)]); expect(animation.playbackRate).toBe(1);
    vi.advanceTimersByTime(299); expect(animation.playbackRate).toBe(1);
    vi.advanceTimersByTime(1); expect(animation.playbackRate).toBe(2);
  });
  it('fast mode disables slow motion and restores an in-flight slow motion', () => {
    const animation = new MockAnimation(); monster.animations.push(animation);
    feel.slow([element(monster)]); expect(animation.playbackRate).toBe(0.5);
    feel.configure({ animationSpeed: 'fast' }); expect(animation.playbackRate).toBe(1);
    feel.slow([element(monster)]); expect(animation.playbackRate).toBe(1);
  });
  it('reset restores non-owned paused/slowed art and drops all timers', () => {
    const animation = new MockAnimation(); monster.animations.push(animation);
    feel.pause(999, [element(monster)]); feel.slow([element(monster)]); feel.reset();
    expect(animation.playbackRate).toBe(1); expect(animation.play).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
    expect(animation.cancel).not.toHaveBeenCalled();
  });
  it('the tuning constant defines elite healing spacing', () => { expect(FEEL.heal.gapMs).toBe(150); });
});
