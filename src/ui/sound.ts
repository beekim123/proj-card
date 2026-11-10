/** Offline WebAudio synthesis. No audio files, network requests, or gameplay RNG. */
export type SoundVolume = 1 | 2 | 3;
export interface SoundSettings { sound: boolean; volume: SoundVolume }
export type RuleSound = 'bite' | 'hug' | 'unwind' | 'wound_down' | 'bell' | 'layer';

export const SOUND = {
  volume: { 1: 0.22, 2: 0.45, 3: 0.7 },
  cardMs: 120,
  // C D E G A, repeated over three octaves. The final A is a deliberate ceiling.
  cardSemitones: [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28, 31, 33],
  cardRootHz: 130.8128,
  whiteMs: 200,
  rainbowStepMs: 60,
  maxVoices: 96,
} as const;

export function cardFrequency(turnCardIndex: number): number {
  const index = Number.isFinite(turnCardIndex) ? Math.max(0, Math.min(SOUND.cardSemitones.length - 1, Math.floor(turnCardIndex))) : 0;
  return SOUND.cardRootHz * 2 ** (SOUND.cardSemitones[index]! / 12);
}

type Source = AudioScheduledSourceNode;
interface Voice { source: Source; nodes: AudioNode[] }
const safePromise = (value: Promise<unknown> | undefined): void => { void value?.catch(() => undefined); };

/** Pass the zero-based card index in the current turn; undo/next turn need no hidden counter. */
export class SoundSystem {
  private settings: SoundSettings;
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private reverb: ConvolverNode | null = null;
  private wet: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private voices = new Set<Voice>();
  private document: Document | null = null;
  private unbind: (() => void) | null = null;
  private unlocked = false;
  private disposed = false;
  private noiseSeed = 0x6d2b79f5;

  constructor(settings: Partial<SoundSettings> = {}) {
    this.settings = { sound: settings.sound ?? true, volume: settings.volume ?? 2 };
  }

  /** A context is created only inside a pointer/click gesture, never during construction. */
  bindUnlock(document: Document): () => void {
    this.unbind?.();
    this.document = document;
    const gesture = () => this.unlock();
    const visibility = () => {
      if (!this.context) return;
      if (document.hidden) { this.stopVoices(); this.clearReverb(); safePromise(this.context.suspend()); }
      else if (this.unlocked && this.settings.sound) safePromise(this.context.resume());
    };
    document.addEventListener('pointerdown', gesture, { capture: true, passive: true });
    document.addEventListener('click', gesture, { capture: true, passive: true });
    document.addEventListener('visibilitychange', visibility);
    const cleanup = () => {
      document.removeEventListener('pointerdown', gesture, true);
      document.removeEventListener('click', gesture, true);
      document.removeEventListener('visibilitychange', visibility);
      if (this.unbind === cleanup) { this.unbind = null; this.document = null; }
    };
    this.unbind = cleanup;
    return cleanup;
  }

  /** Call only in a user gesture. Failure or unavailable WebAudio never interrupts gameplay. */
  unlock(): void {
    if (this.disposed || this.document?.hidden) return;
    this.unlocked = true;
    if (!this.settings.sound) return;
    if (!this.context) {
      const platform = globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext };
      const Context = platform.AudioContext ?? platform.webkitAudioContext;
      if (!Context) return;
      try {
        const context = new Context();
        this.context = context;
        this.master = context.createGain();
        this.master.gain.value = SOUND.volume[this.settings.volume];
        const compressor = context.createDynamicsCompressor();
        compressor.threshold.value = -12;
        compressor.knee.value = 18;
        compressor.ratio.value = 5;
        compressor.attack.value = 0.003;
        compressor.release.value = 0.15;
        this.master.connect(compressor);
        compressor.connect(context.destination);
      } catch {
        if (this.context) safePromise(this.context.close());
        this.context = null; this.master = null;
        return;
      }
    }
    if (this.context.state === 'suspended') safePromise(this.context.resume());
  }

  configure(settings: Partial<SoundSettings>): void {
    if (typeof settings.sound === 'boolean') this.settings.sound = settings.sound;
    if (settings.volume === 1 || settings.volume === 2 || settings.volume === 3) this.settings.volume = settings.volume;
    if (this.master && this.context) {
      const now = this.context.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(this.settings.sound ? SOUND.volume[this.settings.volume] : 0, now, 0.012);
    }
    if (!this.settings.sound) { this.stopVoices(); this.clearReverb(); }
  }

  private ready(): AudioContext | null {
    return this.disposed || !this.unlocked || !this.settings.sound || this.document?.hidden || this.context?.state === 'closed' ? null : this.context;
  }

  private own(source: Source, nodes: AudioNode[], end: number): void {
    const voice = { source, nodes };
    this.voices.add(voice);
    source.onended = () => {
      source.disconnect();
      nodes.forEach(node => node.disconnect());
      this.voices.delete(voice);
    };
    source.stop(end);
    // Bound simultaneous synthesis during an extreme barrage, without a playback queue.
    while (this.voices.size > SOUND.maxVoices) {
      const oldest = this.voices.values().next().value as Voice;
      this.stopVoice(oldest);
    }
  }

  private stopVoice(voice: Voice): void {
    try { voice.source.stop(); } catch { /* Already ended. */ }
    voice.source.disconnect();
    voice.nodes.forEach(node => node.disconnect());
    this.voices.delete(voice);
  }
  private stopVoices(): void { [...this.voices].forEach(voice => this.stopVoice(voice)); }
  private clearReverb(): void {
    // Discard a suspended convolution tail rather than replaying it on return.
    this.reverb?.disconnect(); this.wet?.disconnect();
    this.reverb = null; this.wet = null;
  }

  private envelope(context: AudioContext, start: number, seconds: number, volume: number): GainNode {
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume), start + Math.min(0.008, seconds * 0.1));
    gain.gain.exponentialRampToValueAtTime(0.0001, start + seconds);
    gain.connect(this.master!);
    return gain;
  }

  private tone(frequency: number, seconds: number, volume: number, type: OscillatorType = 'triangle', delay = 0, endFrequency?: number, reverb = false, tremolo = false): void {
    const context = this.ready(); if (!context) return;
    const start = context.currentTime + delay;
    const source = context.createOscillator();
    const gain = this.envelope(context, start, seconds, volume);
    source.type = type;
    source.frequency.setValueAtTime(frequency, start);
    if (endFrequency !== undefined) source.frequency.exponentialRampToValueAtTime(endFrequency, start + seconds);
    source.connect(gain);
    if (reverb) this.connectReverb(gain, context);
    if (tremolo) {
      const vibrato = context.createOscillator();
      const amount = context.createGain();
      vibrato.frequency.value = 24;
      amount.gain.value = frequency * 0.05;
      vibrato.connect(amount); amount.connect(source.frequency);
      vibrato.start(start);
      this.own(vibrato, [amount], start + seconds + 0.02);
    }
    source.start(start);
    this.own(source, [gain], start + seconds + 0.02);
  }

  /** Deterministic synthesis-only noise, independent of rules and without Math.random(). */
  private randomSample(): number {
    this.noiseSeed ^= this.noiseSeed << 13;
    this.noiseSeed ^= this.noiseSeed >>> 17;
    this.noiseSeed ^= this.noiseSeed << 5;
    return (this.noiseSeed >>> 0) / 0xffffffff * 2 - 1;
  }

  private noise(seconds: number, volume: number, frequency: number, filterType: BiquadFilterType, delay = 0, endFrequency?: number): void {
    const context = this.ready(); if (!context) return;
    if (!this.noiseBuffer) {
      this.noiseBuffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
      const samples = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < samples.length; i++) samples[i] = this.randomSample();
    }
    const start = context.currentTime + delay;
    const source = context.createBufferSource(); source.buffer = this.noiseBuffer;
    const filter = context.createBiquadFilter(); filter.type = filterType;
    filter.frequency.setValueAtTime(frequency, start);
    if (endFrequency !== undefined) filter.frequency.exponentialRampToValueAtTime(endFrequency, start + seconds);
    filter.Q.value = 0.8;
    const gain = this.envelope(context, start, seconds, volume);
    source.connect(filter); filter.connect(gain);
    source.start(start);
    this.own(source, [filter, gain], start + seconds + 0.02);
  }

  private connectReverb(gain: GainNode, context: AudioContext): void {
    if (!this.reverb) {
      this.reverb = context.createConvolver();
      const length = Math.ceil(context.sampleRate * 0.35);
      const impulse = context.createBuffer(2, length, context.sampleRate);
      for (let channel = 0; channel < 2; channel++) {
        const samples = impulse.getChannelData(channel);
        for (let i = 0; i < length; i++) samples[i] = this.randomSample() * (1 - i / length) ** 3;
      }
      this.reverb.buffer = impulse;
      this.wet = context.createGain(); this.wet.gain.value = 0.1;
      this.reverb.connect(this.wet); this.wet.connect(this.master!);
    }
    gain.connect(this.reverb);
  }

  playCard(turnCardIndex: number): void { this.tone(cardFrequency(turnCardIndex), SOUND.cardMs / 1000, 0.23); }
  double(turnCardIndex: number): void { this.tone(cardFrequency(turnCardIndex) * 2, 0.1, 0.16); }
  white(): void { [523.251, 659.255, 783.991].forEach(frequency => this.tone(frequency, SOUND.whiteMs / 1000, 0.105, 'triangle', 0, undefined, true)); }
  rainbow(): void { [523.251, 587.33, 659.255, 783.991, 880, 1046.502].forEach((frequency, i) => this.tone(frequency, i === 5 ? 0.36 : 0.12, 0.16, 'sine', i * SOUND.rainbowStepMs / 1000, undefined, i === 5)); }
  hit(big = false): void {
    this.tone(big ? 95 : 80, big ? 0.18 : 0.1, big ? 0.52 : 0.33, 'sine', 0, 40);
    this.noise(big ? 0.11 : 0.055, big ? 0.18 : 0.09, 1000, 'lowpass');
  }
  pierce(): void { this.tone(90, 0.3, 0.64, 'sine', 0, 28); this.noise(0.32, 0.28, 5000, 'lowpass', 0, 100); }
  heartLose(): void { for (let i = 0; i < 3; i++) this.noise(0.045, 0.21, 4500 + i * 700, 'highpass', i * 0.055); }
  heal(): void { this.tone(523.251, 0.2, 0.14, 'sine'); this.tone(659.255, 0.3, 0.14, 'sine', 0.1); }
  button(): void { this.tone(520, 0.024, 0.045, 'triangle', 0, 380); }
  rule(rule: RuleSound): void {
    if (rule === 'bite') this.tone(110, 0.055, 0.16, 'square', 0, 58);
    if (rule === 'hug') this.noise(0.13, 0.28, 230, 'lowpass');
    if (rule === 'unwind' || rule === 'wound_down') {
      const clicks = rule === 'wound_down' ? 6 : 2;
      for (let i = 0; i < clicks; i++) this.noise(0.018, 0.2, 1800, 'bandpass', i * 0.04);
      if (rule === 'wound_down') this.noise(0.3, 0.16, 950, 'lowpass', 0.2, 130);
    }
    if (rule === 'bell') {
      [1, 2, 2.76, 4.07].forEach((partial, i) => this.tone(440 * partial, 1.1 - i * 0.15, 0.15 / (i + 1), 'sine'));
    }
    if (rule === 'layer') this.tone(66, 0.48, 0.11, 'sawtooth', 0, 42, false, true);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; this.unbind?.(); this.stopVoices();
    this.clearReverb(); this.master?.disconnect();
    if (this.context && this.context.state !== 'closed') safePromise(this.context.close());
    this.context = null; this.master = null; this.reverb = null; this.wet = null; this.noiseBuffer = null;
  }
}
