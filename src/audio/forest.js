import { profile, changeMusicSuite } from '../storage/profile.js';
import { createMusicEngine, MUSIC_SUITES, MUSIC_SCENES } from './music.js';
import { createSfxEngine, SFX_CATALOG } from './sfx.js';

export { MUSIC_SUITES, MUSIC_SCENES, SFX_CATALOG };

const MAX_VOICES = 48;
let ac;
let music;
let sfx;
let air;
let reverb;
let reverbSend;
let noise;
let amb = 0;
let pulse = 0;
let wasQuiet = false;
let airOpen = true;
let wake = 0;
let nextOwl = 4;
const voices = new Set();
const counts = {};
let meter;
let musicEngine;
let sfxEngine;

export function audioStatus() {
  return {
    state: ac?.state,
    voices: voices.size,
    counts: { ...counts },
    level: level(),
    suite: musicEngine?.getSuite() ?? profile.musicSuite ?? 'mist',
    scene: musicEngine?.getScene() ?? 'hall',
    preview: musicEngine?.getPreviewScene() ?? null,
  };
}

function level() {
  if (!meter) return 0;
  const a = new Uint8Array(256);
  meter.getByteTimeDomainData(a);
  return Math.max(...a.map((n) => Math.abs(n - 128)));
}

export function volumes() {
  if (!ac) return;
  music.gain.setTargetAtTime(profile.mute ? 0 : profile.music, ac.currentTime, 0.12);
  sfx.gain.setTargetAtTime(profile.mute ? 0 : profile.sfx, ac.currentTime, 0.08);
}

function buildMistImpulse(ctx, seconds = 1.6) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const env = Math.pow(1 - i / len, 2.6);
      lp = 0.72 * lp + 0.28 * (Math.random() * 2 - 1);
      data[i] = lp * env * 0.45;
    }
  }
  return buf;
}

function voice(bus, type, f, to, len, amp, attack = 0.012, pan = 0, delay = 0, lp = 1100) {
  if (!ac || voices.size >= MAX_VOICES) return;
  const t = ac.currentTime + delay;
  const src = type === 'noise' ? ac.createBufferSource() : ac.createOscillator();
  const gain = ac.createGain();
  const filter = ac.createBiquadFilter();
  const space = ac.createStereoPanner();
  if (type === 'noise') {
    src.buffer = noise;
    src.loop = true;
    filter.type = 'bandpass';
    filter.frequency.value = Math.max(40, f);
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, to), t + len);
    filter.Q.value = 0.88;
  } else {
    src.type = type;
    src.frequency.setValueAtTime(Math.max(20, f), t);
    src.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + len);
    filter.type = 'lowpass';
    filter.frequency.value = lp;
  }
  space.pan.value = Math.max(-1, Math.min(1, pan));
  gain.gain.setValueAtTime(0.00001, t);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.00002, amp), t + Math.max(0.003, attack));
  gain.gain.exponentialRampToValueAtTime(0.00001, t + Math.max(attack + 0.01, len));
  src.connect(filter).connect(gain).connect(space).connect(bus);
  voices.add(src);
  src.onended = () => {
    voices.delete(src);
    for (const n of [src, gain, filter, space]) n.disconnect();
  };
  src.start(t);
  src.stop(t + len + 0.04);
}

export function prepare() {
  if (!ac) {
    ac = new AudioContext();
    meter = ac.createAnalyser();
    meter.fftSize = 256;
    meter.connect(ac.destination);

    // 轻柔雾林混响总线（给音乐与环境空谷残响）
    reverb = ac.createConvolver();
    reverb.buffer = buildMistImpulse(ac, 1.55);
    reverbSend = ac.createGain();
    reverbSend.gain.value = 0.28;
    reverbSend.connect(reverb).connect(meter);

    music = ac.createGain();
    sfx = ac.createGain();
    music.connect(meter);
    music.connect(reverbSend);
    sfx.connect(meter);

    air = ac.createGain();
    air.connect(sfx);
    air.connect(reverbSend);

    noise = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    let prev = 0;
    for (let a = noise.getChannelData(0), i = 0; i < a.length; i++) {
      prev = 0.42 * prev + 0.58 * (Math.random() * 2 - 1);
      a[i] = prev;
    }
    musicEngine = createMusicEngine(voice, () => music);
    musicEngine.setSuite(profile.musicSuite || 'mist');
    sfxEngine = createSfxEngine(voice, () => sfx, () => air);
    volumes();
  }
}

// 供带声音录屏使用的音频流出口
export function captureAudioStream() {
  prepare();
  const dest = ac.createMediaStreamDestination();
  meter.connect(dest);
  return dest.stream;
}

export function unlock() {
  prepare();
  if (ac.state === 'suspended') ac.resume().catch(() => {});
}

export function setMusicSuite(id) {
  changeMusicSuite(id);
  prepare();
  musicEngine?.setSuite(profile.musicSuite);
  // 切换曲目时做 0.18s 平滑过渡
  if (ac && music && !profile.mute) {
    const t = ac.currentTime;
    music.gain.cancelScheduledValues(t);
    music.gain.setTargetAtTime(profile.music * 0.35, t, 0.06);
    music.gain.setTargetAtTime(profile.music, t + 0.14, 0.18);
  }
}

export function setMusicPreview(sceneId) {
  prepare();
  musicEngine?.setPreviewScene(sceneId || null);
}

export function getMusicState() {
  return {
    suite: musicEngine?.getSuite() ?? profile.musicSuite ?? 'mist',
    scene: musicEngine?.getScene() ?? 'hall',
    preview: musicEngine?.getPreviewScene() ?? null,
  };
}

export function sound(id, o = {}) {
  if (!ac || ac.state !== 'running') return;
  counts[id] = (counts[id] || 0) + 1;
  sfxEngine?.trigger(ac, id, o);
}

export function environment(quiet, d = 16, pan = 0, owlPan = null, scene = null) {
  if (!ac || ac.state !== 'running') return;
  const t = ac.currentTime;
  if (scene) musicEngine?.setScene(scene);

  if (quiet !== wasQuiet) {
    wake = t + (quiet ? 0 : 2.6);
    air.gain.setTargetAtTime(0, t, 0.11);
    airOpen = false;
    wasQuiet = quiet;
  }
  if (!quiet && !airOpen && t > wake) {
    air.gain.setTargetAtTime(1, t, 0.72);
    airOpen = true;
  }

  // 猫头鹰远啼
  if (!quiet && airOpen && owlPan !== null && t > nextOwl) {
    counts.owl = (counts.owl || 0) + 1;
    sfxEngine?.trigger(ac, 'owl', { pan: owlPan });
    nextOwl = t + 14 + Math.random() * 5;
  }

  // 四套生成式背景音乐节拍推进
  musicEngine?.tick(ac);

  // 遇怪前静谧低频心跳
  if (quiet && t > pulse) {
    voice(music, 'sine', 64, 46, 0.56, 0.11, 0.05);
    pulse = t + 1.15 + Math.random() * 0.25;
  }

  // 林间冷风、水洼蛙鸣与夜空空气声
  if (!quiet && t > wake && t >= amb) {
    const near = Math.max(0.04, 1 - d / 28);
    const r = Math.random();
    if (r < 0.45 && d < 22) {
      counts.frog = (counts.frog || 0) + 1;
      sfxEngine?.trigger(ac, 'frog', { pan });
    } else if (r < 0.72 && d < 20) {
      voice(air, 'sine', 1020, 610, 0.18, 0.09 * near, 0.008, pan, 0, 1800);
    } else {
      // 林间冷风穿林声
      voice(air, 'noise', 1600, 620, 1.1, 0.085, 0.28, -pan);
    }
    amb = t + 1.5 + Math.random() * 2.2;
  }
}
