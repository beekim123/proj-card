import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cardFrequency, SOUND, SoundSystem } from './sound';

class MockParam {
  value = 0;
  setValueAtTime = vi.fn();
  exponentialRampToValueAtTime = vi.fn();
  setTargetAtTime = vi.fn();
  cancelScheduledValues = vi.fn();
}
class MockAudioNode {
  connect = vi.fn(); disconnect = vi.fn();
  gain = new MockParam(); frequency = new MockParam(); Q = new MockParam();
  threshold = new MockParam(); knee = new MockParam(); ratio = new MockParam(); attack = new MockParam(); release = new MockParam();
  start = vi.fn(); stop = vi.fn(); onended: (() => void) | null = null;
  type = ''; buffer: unknown = null;
}
class MockAudioContext {
  static instances: MockAudioContext[] = [];
  currentTime = 0; sampleRate = 100; state: AudioContextState = 'suspended';
  destination = new MockAudioNode(); sources: MockAudioNode[] = []; gains: MockAudioNode[] = []; filters: MockAudioNode[] = [];
  constructor() { MockAudioContext.instances.push(this); }
  createGain() { const node = new MockAudioNode(); this.gains.push(node); return node; }
  createDynamicsCompressor() { return new MockAudioNode(); }
  createOscillator() { const node = new MockAudioNode(); this.sources.push(node); return node; }
  createBufferSource() { return this.createOscillator(); }
  createBiquadFilter() { const node = new MockAudioNode(); this.filters.push(node); return node; }
  createConvolver() { return new MockAudioNode(); }
  createBuffer(channels: number, length: number) { const data = Array.from({ length: channels }, () => new Float32Array(length)); return { getChannelData: (channel: number) => data[channel]! }; }
  resume = vi.fn(() => { this.state = 'running'; return Promise.resolve(); });
  suspend = vi.fn(() => { this.state = 'suspended'; return Promise.resolve(); });
  close = vi.fn(() => { this.state = 'closed'; return Promise.resolve(); });
}
class MockDocument extends EventTarget { hidden = false; }
let sound: SoundSystem;
let document: MockDocument;
beforeEach(() => { MockAudioContext.instances = []; vi.stubGlobal('AudioContext', MockAudioContext); document = new MockDocument(); sound = new SoundSystem(); sound.bindUnlock(document as unknown as Document); });
afterEach(() => { sound.dispose(); vi.unstubAllGlobals(); });
const context = () => MockAudioContext.instances[0]!;
const gesture = () => document.dispatchEvent(new Event('pointerdown'));

describe('pentatonic card pitch', () => {
  it('rises through C D E G A and stops at the ceiling', () => {
    const pitches = Array.from({ length: SOUND.cardSemitones.length }, (_, i) => cardFrequency(i));
    expect(pitches.every((pitch, index) => !index || pitch > pitches[index - 1]!)).toBe(true);
    expect(cardFrequency(100)).toBe(pitches.at(-1));
    expect(cardFrequency(5) / cardFrequency(0)).toBeCloseTo(2);
  });
  it('starts a fresh turn or undo at its supplied index without hidden sequencing state', () => {
    expect(cardFrequency(-1)).toBe(cardFrequency(0)); expect(cardFrequency(NaN)).toBe(cardFrequency(0));
    gesture(); sound.playCard(4); sound.playCard(0);
    expect(context().sources.at(-1)!.frequency.setValueAtTime).toHaveBeenCalledWith(cardFrequency(0), 0);
  });
});

describe('audio lifecycle and preferences', () => {
  it('does not construct audio before a user gesture, including calls to any effect', () => {
    sound.playCard(0); sound.white(); sound.rainbow(); sound.hit(); sound.pierce(); sound.heartLose(); sound.heal(); sound.button(); sound.rule('bell');
    expect(MockAudioContext.instances).toHaveLength(0);
    gesture(); expect(MockAudioContext.instances).toHaveLength(1);
    gesture(); expect(MockAudioContext.instances).toHaveLength(1);
  });
  it('click activation also unlocks keyboard-activated buttons', () => { document.dispatchEvent(new Event('click')); expect(context().resume).toHaveBeenCalledOnce(); });
  it('sound off never constructs a context', () => { sound.configure({ sound: false }); gesture(); sound.playCard(0); expect(MockAudioContext.instances).toHaveLength(0); });
  it('updates all three master volumes and stops voices immediately on mute', () => {
    gesture(); sound.playCard(0);
    for (const volume of [1, 2, 3] as const) { sound.configure({ volume }); expect(context().gains[0]!.gain.setTargetAtTime).toHaveBeenLastCalledWith(SOUND.volume[volume], 0, 0.012); }
    const source = context().sources[0]!; sound.configure({ sound: false });
    expect(source.disconnect).toHaveBeenCalled(); const count = context().sources.length; sound.hit(); expect(context().sources).toHaveLength(count);
  });
  it('pauses in background, discards queued voices, and only resumes an unlocked foreground context', () => {
    gesture(); sound.rainbow(); const count = context().sources.length;
    document.hidden = true; document.dispatchEvent(new Event('visibilitychange'));
    expect(context().suspend).toHaveBeenCalledOnce(); expect(context().sources.every(source => source.disconnect.mock.calls.length > 0)).toBe(true);
    sound.playCard(0); gesture(); expect(context().sources).toHaveLength(count);
    document.hidden = false; document.dispatchEvent(new Event('visibilitychange')); expect(context().resume).toHaveBeenCalledTimes(2);
  });
  it('visibility alone cannot start audio', () => { document.dispatchEvent(new Event('visibilitychange')); expect(MockAudioContext.instances).toHaveLength(0); });
  it('dispose closes context and removes all unlock listeners', () => { gesture(); const ctx = context(); sound.dispose(); expect(ctx.close).toHaveBeenCalledOnce(); gesture(); expect(MockAudioContext.instances).toHaveLength(1); });
  it('fails quietly if WebAudio is unavailable or construction fails', () => {
    vi.stubGlobal('AudioContext', undefined); expect(gesture).not.toThrow();
    vi.stubGlobal('AudioContext', class { constructor() { throw new Error('No audio device'); } }); expect(gesture).not.toThrow();
  });
});

describe('synthesized effect coverage', () => {
  it('supports every requested cue without files or non-finite envelope values', () => {
    gesture(); sound.playCard(0); sound.double(0); sound.white(); sound.rainbow(); sound.hit(); sound.hit(true); sound.pierce(); sound.heartLose(); sound.heal(); sound.button();
    for (const rule of ['bite', 'hug', 'unwind', 'wound_down', 'bell', 'layer'] as const) sound.rule(rule);
    expect(context().sources.length).toBeGreaterThan(35);
    for (const source of context().sources) {
      expect(source.start).toHaveBeenCalledOnce(); expect(source.stop).toHaveBeenCalled();
      for (const calls of [source.start.mock.calls, source.stop.mock.calls, source.frequency.setValueAtTime.mock.calls, source.frequency.exponentialRampToValueAtTime.mock.calls]) {
        expect(calls.flat().every(value => Number.isFinite(value))).toBe(true);
      }
    }
  });
  it('plays 8 cards immediately rather than queuing them and doubles exactly one octave', () => {
    gesture(); for (let i = 0; i < 8; i++) sound.playCard(i); sound.double(7);
    expect(context().sources).toHaveLength(9);
    expect(context().sources.every(source => source.start.mock.calls[0]![0] === 0)).toBe(true);
    expect(context().sources[8]!.frequency.setValueAtTime).toHaveBeenCalledWith(cardFrequency(7) * 2, 0);
  });
  it('bounds voices in extreme repeated playback without queuing', () => {
    gesture(); for (let i = 0; i < 40; i++) sound.rainbow();
    expect(context().sources.filter(source => source.disconnect.mock.calls.length === 0)).toHaveLength(SOUND.maxVoices);
  });
});
