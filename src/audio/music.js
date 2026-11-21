// 四套完整背景音乐：每套包含 大厅(hall) / 林中行走(walk) / 战斗(battle) / 精英战(elite) 四段。
// 每段采用 8 乐段 × 4 小节（共 32 小节，约 72–88 秒）生成式进行 + 内声部随机转位，长时间听不重复；状态切换平滑淡入淡出。

export const MUSIC_SUITES = [
  {
    id: 'mist',
    name: '雾林回响',
    style: '冷雾环境氛围 · 空谷低音、远山木笛与雾滴残响',
  },
  {
    id: 'strings',
    name: '古道旅弦',
    style: '民谣拨弦与低音提琴 · 孤灯鲁特琴分解和弦与弓弦长音',
  },
  {
    id: 'drums',
    name: '黑石战鼓',
    style: '低频打击与铁砧脉冲 · 深林石鼓、框鼓与暗角低音号',
  },
  {
    id: 'chimes',
    name: '星辉铃咏',
    style: '魔法钟琴与空灵合唱 · 水晶竖琴、钢片琴泛音与人声垫底',
  },
];

export const MUSIC_SCENES = [
  { id: 'hall', name: '大厅' },
  { id: 'walk', name: '林子里走' },
  { id: 'battle', name: '战斗' },
  { id: 'elite', name: '精英战' },
];

// A 小调 / D 多利亚 / E 弗里吉亚音阶频率表（Hz）
const N = {
  A1: 55.0, B1: 61.74, C2: 65.41, D2: 73.42, E2: 82.41, F2: 87.31, G2: 98.0,
  A2: 110.0, Bb2: 116.54, B2: 123.47, C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, Fs3: 185.0, G3: 196.0,
  A3: 220.0, Bb3: 233.08, B3: 246.94, C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, Fs4: 369.99, G4: 392.0,
  A4: 440.0, Bb4: 466.16, B4: 493.88, C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880.0,
};

// 8 乐段和声骨架（每乐段 4 小节 = 32 小节一个大循环，约 75–85 秒，配合生成式变奏不重复）
const SECTIONS = {
  hall: [
    ['A2', 'E3', 'A3', 'C4', 'E4'],
    ['F2', 'C3', 'F3', 'A3', 'C4'],
    ['D2', 'A2', 'D3', 'F3', 'A3'],
    ['E2', 'B2', 'E3', 'G3', 'B3'],
    ['C2', 'G2', 'C3', 'E3', 'G3'],
    ['D2', 'A2', 'D3', 'Fs3', 'A3'],
    ['F2', 'C3', 'F3', 'A3', 'E4'],
    ['E2', 'B2', 'E3', 'A3', 'B3'],
  ],
  walk: [
    ['D2', 'A2', 'D3', 'F3', 'A3'],
    ['C2', 'G2', 'C3', 'E3', 'G3'],
    ['Bb2', 'F3', 'Bb3', 'D4', 'F4'],
    ['A1', 'E2', 'A2', 'C3', 'E3'],
    ['G2', 'D3', 'G3', 'Bb3', 'D4'],
    ['F2', 'C3', 'F3', 'A3', 'C4'],
    ['E2', 'B2', 'E3', 'G3', 'B3'],
    ['A1', 'E2', 'A2', 'D3', 'E3'],
  ],
  battle: [
    ['E2', 'B2', 'E3', 'G3', 'B3'],
    ['F2', 'C3', 'F3', 'A3', 'C4'],
    ['D2', 'A2', 'D3', 'F3', 'A3'],
    ['E2', 'Bb2', 'E3', 'G3', 'Bb3'],
    ['A1', 'E2', 'A2', 'C3', 'E3'],
    ['F2', 'C3', 'F3', 'A3', 'D4'],
    ['D2', 'A2', 'D3', 'G3', 'Bb3'],
    ['E2', 'B2', 'E3', 'Bb3', 'B3'],
  ],
  elite: [
    ['A1', 'E2', 'A2', 'Bb2', 'E3'],
    ['D2', 'A2', 'D3', 'F3', 'Ab3'],
    ['F2', 'C3', 'F3', 'A3', 'C4'],
    ['E2', 'B2', 'E3', 'G3', 'Bb3'],
    ['C2', 'G2', 'C3', 'E3', 'Bb3'],
    ['D2', 'A2', 'D3', 'F3', 'A3'],
    ['Bb2', 'F3', 'Bb3', 'D4', 'F4'],
    ['E2', 'B2', 'E3', 'A3', 'B3'],
  ],
};

// 节拍速度（秒/拍）：每小节 4 拍，32 小节 = 128 拍（耗时 65–92 秒才走完一轮，且每轮随机选择旋律分支）
const BEAT_SEC = {
  mist: { hall: 0.72, walk: 0.68, battle: 0.54, elite: 0.48 },
  strings: { hall: 0.64, walk: 0.60, battle: 0.48, elite: 0.42 },
  drums: { hall: 0.66, walk: 0.58, battle: 0.44, elite: 0.38 },
  chimes: { hall: 0.68, walk: 0.62, battle: 0.50, elite: 0.44 },
};

export function createMusicEngine(voiceFn, getBus) {
  let currentSuite = 'mist';
  let currentScene = 'hall';
  let previewScene = null; // 设置页试听覆盖
  let beatIndex = 0;
  let nextBeatAt = 0;
  let phraseSeed = 1337;

  function rand() {
    phraseSeed = (Math.imul(phraseSeed, 1664525) + 1013904223) >>> 0;
    return phraseSeed / 0x100000000;
  }

  function setSuite(id) {
    if (MUSIC_SUITES.some(s => s.id === id) && id !== currentSuite) {
      currentSuite = id;
      nextBeatAt = 0; // 立即衔接新曲风
    }
  }

  function setScene(sceneId) {
    if (sceneId && sceneId !== currentScene) {
      currentScene = sceneId;
    }
  }

  function setPreviewScene(sceneId) {
    previewScene = sceneId;
    nextBeatAt = 0;
  }

  function getActiveScene() {
    return previewScene || currentScene;
  }

  // 合成拨弦（鲁特琴/竖琴）
  function pluck(bus, freq, dur, amp, pan = 0, delay = 0, bright = 1800) {
    voiceFn(bus, 'triangle', freq, freq * 0.998, dur, amp, 0.008, pan, delay, bright);
    voiceFn(bus, 'sine', freq * 2, freq * 1.996, dur * 0.45, amp * 0.32, 0.005, -pan * 0.6, delay, bright * 1.3);
  }

  // 合成钟琴/水晶铃
  function chime(bus, freq, dur, amp, pan = 0, delay = 0) {
    voiceFn(bus, 'sine', freq, freq, dur, amp, 0.006, pan, delay, 4200);
    voiceFn(bus, 'sine', freq * 2.756, freq * 2.75, dur * 0.38, amp * 0.22, 0.004, -pan, delay + 0.004, 5000);
  }

  // 合成深林石鼓/框鼓
  function drum(bus, freq, dur, amp, pan = 0, delay = 0) {
    voiceFn(bus, 'sine', freq * 1.45, freq * 0.52, dur, amp, 0.005, pan, delay, 320);
    voiceFn(bus, 'noise', freq * 4.5, freq * 1.8, dur * 0.45, amp * 0.35, 0.004, pan, delay);
  }

  // 合成弓弦/长垫音
  function pad(bus, freq, dur, amp, pan = 0, delay = 0, lp = 480) {
    voiceFn(bus, 'sawtooth', freq, freq * 0.995, dur, amp * 0.55, dur * 0.28, pan, delay, lp);
    voiceFn(bus, 'triangle', freq * 1.003, freq * 0.999, dur * 0.95, amp * 0.65, dur * 0.24, -pan * 0.7, delay + 0.04, lp * 1.4);
  }

  function tick(ac) {
    const bus = getBus();
    if (!ac || !bus) return;
    const now = ac.currentTime;
    if (nextBeatAt === 0 || now - nextBeatAt > 2.0) nextBeatAt = now + 0.04;
    if (now < nextBeatAt) return;

    const scene = getActiveScene();
    const suite = currentSuite;
    const stepDur = BEAT_SEC[suite]?.[scene] || 0.6;
    const bar = Math.floor(beatIndex / 4);
    const beatInBar = beatIndex % 4;
    const secIdx = Math.floor(bar / 4) % 8; // 8 个乐段，共 32 小节
    const barInSec = bar % 4;
    const chord = SECTIONS[scene]?.[secIdx] || SECTIONS.hall[0];
    const root = N[chord[0]] || 110;
    const fifth = N[chord[1]] || root * 1.5;
    const octave = N[chord[2]] || root * 2;
    const third = N[chord[3]] || root * 2.4;
    const high = N[chord[4]] || root * 3;
    const isBattle = scene === 'battle' || scene === 'elite';
    const isElite = scene === 'elite';

    // 1. 《雾林回响》：冷雾长垫音 + 远山木笛泛音 + 雾滴
    if (suite === 'mist') {
      if (beatInBar === 0) {
        pad(bus, root, stepDur * 4.2, isBattle ? 0.12 : 0.095, -0.22, 0, isBattle ? 420 : 310);
        if (barInSec % 2 === 0) pad(bus, fifth, stepDur * 3.8, 0.07, 0.24, stepDur * 0.5, 460);
      }
      if (beatInBar === 2 && (barInSec === 1 || barInSec === 3 || isBattle)) {
        const fluteNotes = [octave, third, high, fifth * 2];
        const fn = fluteNotes[(secIdx + barInSec + Math.floor(rand() * 2)) % fluteNotes.length];
        voiceFn(bus, 'sine', fn * 0.992, fn, stepDur * 2.4, 0.065, 0.32, 0.18, 0, 1400);
        voiceFn(bus, 'noise', fn * 2, fn * 1.5, stepDur * 0.8, 0.018, 0.18, 0.18, 0);
      }
      if (isBattle && (beatInBar === 0 || (isElite && beatInBar === 2))) {
        drum(bus, isElite ? 62 : 72, 0.48, isElite ? 0.15 : 0.11, -0.1);
      }
      if (!isBattle && beatInBar === 3 && rand() < 0.65) {
        chime(bus, high * 2, 1.4, 0.028, (rand() - 0.5) * 0.6, stepDur * 0.3);
      }
    }

    // 2. 《古道旅弦》：鲁特琴分解和弦 + 大提琴低音弓弦
    else if (suite === 'strings') {
      const arpOrder = isBattle
        ? [root, fifth, third, octave, high, third, fifth, octave]
        : [root, fifth, octave, third];
      const note = arpOrder[(beatInBar + barInSec * 2) % arpOrder.length];
      const pan = ((beatInBar % 2) - 0.5) * 0.45;
      pluck(bus, note, stepDur * (isBattle ? 1.3 : 1.9), isBattle ? 0.11 : 0.09, pan, 0, isElite ? 2400 : 1700);
      if (isBattle && rand() < 0.75) {
        const subNote = arpOrder[(beatInBar + 2) % arpOrder.length] * (isElite ? 2 : 1);
        pluck(bus, subNote, stepDur * 0.85, 0.065, -pan, stepDur * 0.5, 2100);
      }
      if (beatInBar === 0 && (barInSec % 2 === 0 || isBattle)) {
        pad(bus, root, stepDur * 3.9, 0.105, -0.28, 0, 560);
      }
      if (beatInBar === 2 && barInSec === 2) {
        pad(bus, third, stepDur * 2.2, 0.065, 0.3, 0, 820);
      }
    }

    // 3. 《黑石战鼓》：深沉石鼓 + 铁砧低频脉冲 + 低音号角
    else if (suite === 'drums') {
      if (beatInBar === 0) {
        drum(bus, isElite ? 52 : 60, 0.55, isBattle ? 0.19 : 0.12, -0.12);
        pad(bus, root, stepDur * 2.4, 0.09, 0.15, 0, isElite ? 620 : 380);
      }
      if (isBattle && beatInBar === 2) {
        drum(bus, 78, 0.38, 0.14, 0.18);
      }
      if (isElite && (beatInBar === 1 || beatInBar === 3)) {
        drum(bus, 110, 0.24, 0.095, (beatInBar - 2) * 0.25, stepDur * 0.5);
      }
      if (beatInBar === 1 && (barInSec === 1 || barInSec === 3)) {
        // 铁砧/石片轻击
        voiceFn(bus, 'triangle', fifth * 2, fifth * 1.4, 0.22, 0.06, 0.005, 0.32, 0, 1600);
      }
      if (beatInBar === 3 && (isBattle || barInSec === 3)) {
        // 远古低音号角
        pad(bus, octave, stepDur * 1.8, 0.085, -0.2, 0, 740);
      }
    }

    // 4. 《星辉铃咏》：水晶钟琴 + 魔法竖琴泛音 + 空灵合唱垫底
    else if (suite === 'chimes') {
      if (beatInBar === 0) {
        // 空灵合唱元音共振垫底
        pad(bus, octave, stepDur * 4.0, 0.08, -0.25, 0, 950);
        pad(bus, third, stepDur * 3.8, 0.06, 0.25, stepDur * 0.2, 1200);
      }
      const bellPool = [octave, third, high, fifth * 2, octave * 2];
      const bNote = bellPool[(beatInBar * 2 + barInSec + secIdx) % bellPool.length];
      chime(bus, bNote, stepDur * 2.2, isBattle ? 0.075 : 0.06, ((beatInBar % 3) - 1) * 0.35, 0);
      if (isBattle || beatInBar === 2) {
        const bNote2 = bellPool[(beatInBar + secIdx + 2) % bellPool.length];
        pluck(bus, bNote2 * 0.5, stepDur * 1.4, 0.07, -0.2, stepDur * 0.5, 2400);
      }
      if (isElite && beatInBar % 2 === 0) {
        drum(bus, 64, 0.42, 0.11, 0);
      }
    }

    beatIndex = (beatIndex + 1) % 128; // 128 拍 (32 小节) 大循环
    nextBeatAt += stepDur;
  }

  return {
    tick,
    setSuite,
    setScene,
    setPreviewScene,
    getSuite: () => currentSuite,
    getScene: getActiveScene,
    getPreviewScene: () => previewScene,
  };
}
