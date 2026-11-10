/** Dependency-free behavioral smoke check. Does not substitute for Vitest/browser/audio QA. */
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import assert from 'node:assert/strict';

async function load(name) {
  const source = await readFile(new URL(`../src/ui/${name}.ts`, import.meta.url), 'utf8');
  const code = stripTypeScriptTypes(source.replace("import './feel.css';", ''), { mode: 'transform' });
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}
const { FeelSystem, FEEL, damageTier, hitstopDuration } = await load('feel');
const { SoundSystem, SOUND, cardFrequency } = await load('sound');
let now = 0, serial = 0;
const timers = new Map();
const nativeTimeout = globalThis.setTimeout, nativeClear = globalThis.clearTimeout;
globalThis.setTimeout = (callback, delay) => { const id = ++serial; timers.set(id, { callback, at: now + delay }); return id; };
globalThis.clearTimeout = id => timers.delete(id);
const advance = ms => { const end = now + ms; while (true) { const due = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0]; if (!due) break; timers.delete(due[0]); now = due[1].at; due[1].callback(); } now = end; };
const spy = (fn = () => {}) => { const result = (...args) => { result.calls.push(args); return fn(...args); }; result.calls = []; return result; };
class Anim {
  playState = 'running'; playbackRate = 1; events = new Map();
  pause = spy(() => { this.playState = 'paused'; });
  play = spy(() => { this.playState = 'running'; });
  cancel = spy(() => { this.playState = 'idle'; (this.events.get('cancel') ?? []).forEach(callback => callback()); });
  addEventListener(name, callback) { this.events.set(name, [...(this.events.get(name) ?? []), callback]); }
}
class Node {
  animations = []; children = []; dataset = {}; style = { setProperty: spy() }; classList = { add: spy() };
  animate = spy(() => { const a = new Anim(); this.animations.push(a); return a; });
  getAnimations() { return this.animations; }
  append(child) { this.children.push(child); }
  remove = spy(); setAttribute = spy();
  ownerDocument = { createElement: () => new Node() };
}
class Param { value = 0; setValueAtTime = spy(); exponentialRampToValueAtTime = spy(); setTargetAtTime = spy(); cancelScheduledValues = spy(); }
class AudioNode {
  connect = spy(); disconnect = spy(); start = spy(); stop = spy();
  gain = new Param(); frequency = new Param(); Q = new Param(); threshold = new Param(); knee = new Param(); ratio = new Param(); attack = new Param(); release = new Param();
}
class Context {
  static all = []; currentTime = 0; sampleRate = 100; state = 'suspended'; sources = []; gains = []; destination = new AudioNode();
  constructor() { Context.all.push(this); }
  createGain() { const n = new AudioNode(); this.gains.push(n); return n; }
  createDynamicsCompressor() { return new AudioNode(); }
  createOscillator() { const n = new AudioNode(); this.sources.push(n); return n; }
  createBufferSource() { return this.createOscillator(); }
  createBiquadFilter() { return new AudioNode(); }
  createConvolver() { return new AudioNode(); }
  createBuffer(channels, length) { const data = Array.from({ length: channels }, () => new Float32Array(length)); return { getChannelData: channel => data[channel] }; }
  resume = spy(() => { this.state = 'running'; return Promise.resolve(); });
  suspend = spy(() => { this.state = 'suspended'; return Promise.resolve(); });
  close = spy(() => { this.state = 'closed'; return Promise.resolve(); });
}
class Doc extends EventTarget { hidden = false; }
const checks = [];
function check(name, run) { run(); checks.push(name); }
let feel, sound;
try {
  const stage = new Node(), fx = new Node(), monster = new Node(), card = new Node();
  feel = new FeelSystem({ stage, fxLayer: fx });
  check('damage font boundaries and fast hitstop timing', () => { assert.deepEqual([0,9999,10000,1000000,1000001].map(damageTier), ['small','small','medium','medium','large']); assert.deepEqual([hitstopDuration(),hitstopDuration(true),hitstopDuration(false,true),hitstopDuration(true,true)], [60,120,30,60]); });
  check('eight card drops start immediately with additive transforms', () => { for (let i=0;i<8;i++) feel.cardDrop(card); assert.equal(card.animate.calls.length,8); assert.equal(timers.size,0); assert.ok(card.animate.calls.every(([,o]) => o.duration===120&&o.composite==='add')); });
  check('three shake levels and shake-off', () => { for (const level of ['small','medium','large']) feel.shake(level); assert.deepEqual(stage.animate.calls.map(([,o]) => o.duration),[150,250,380]); feel.configure({shake:false}); feel.shake('large'); assert.equal(stage.animate.calls.length,3); feel.configure({shake:true}); });
  check('attack impacts exactly at 330ms and fades vignette by 830ms', () => { let hits=0; feel.attack(monster,()=>hits++); advance(329); assert.equal(hits,0); advance(1); assert.equal(hits,1); assert.equal(fx.children.length,1); advance(500); assert.equal(fx.children[0].remove.calls.length,1); });
  check('reset cancels interrupted attack callbacks and own animations', () => { let hits=0; feel.attack(monster,()=>hits++); feel.reset(); advance(1000); assert.equal(hits,0); assert.equal(timers.size,0); });
  check('hitstop preserves owner-paused animations and overlaps without queue', () => { monster.animations=[]; const paused=new Anim(), running=new Anim(); paused.playState='paused'; monster.animations.push(paused,running); feel.pause(120,[monster]); advance(20); feel.pause(120,[monster]); assert.equal(timers.size,1); advance(120); assert.equal(paused.play.calls.length,0); assert.equal(running.pause.calls.length,1); assert.equal(running.play.calls.length,1); });
  check('canceled artwork is not resurrected', () => { monster.animations=[]; const a=new Anim(); monster.animations.push(a); feel.pause(120,[monster]); a.cancel(); advance(120); assert.equal(a.play.calls.length,0); });
  check('repeat slow motion does not compound, restores original speed', () => { monster.animations=[]; const a=new Anim(); a.playbackRate=2; monster.animations.push(a); feel.slow([monster]); assert.equal(a.playbackRate,1); advance(100); feel.slow([monster]); assert.equal(a.playbackRate,1); advance(299); assert.equal(a.playbackRate,1); advance(1); assert.equal(a.playbackRate,2); feel.slow([monster]); feel.configure({animationSpeed:'fast'}); assert.equal(a.playbackRate,2); feel.slow([monster]); assert.equal(a.playbackRate,2); });
  check('number scale/font, multiplier flip, and ordered rainbow feedback', () => { const n=new Node(); feel.number(n,1000001); assert.equal(n.style.fontSize,'80px'); assert.deepEqual(n.animate.calls[0][0].map(k=>k.transform),['scale(0.6)','scale(1.3)','scale(1)']); feel.multiplier(n,true); assert.equal(n.animate.calls[1][0][1].transform,'rotateX(180deg) scale(1.25)'); const cards=Array.from({length:6},()=>new Node()); let flashes=0; feel.rainbow(cards,()=>flashes++); assert.deepEqual(cards.map(c=>c.animate.calls[0][1].delay),[0,60,120,180,240,300]); advance(419); assert.equal(flashes,0); advance(1); assert.equal(flashes,1); assert.equal(FEEL.heal.gapMs,150); });
  globalThis.AudioContext=Context;
  const doc=new Doc(); sound=new SoundSystem(); sound.bindUnlock(doc);
  check('audio is lazy and unlocks once from gesture', () => { sound.playCard(0); sound.rainbow(); assert.equal(Context.all.length,0); doc.dispatchEvent(new Event('pointerdown')); doc.dispatchEvent(new Event('click')); assert.equal(Context.all.length,1); });
  const ctx=Context.all[0];
  check('card pentatonic pitch rises then caps, resets with turn index', () => { const pitches=SOUND.cardSemitones.map((_,i)=>cardFrequency(i)); assert.ok(pitches.every((p,i)=>!i||p>pitches[i-1])); assert.equal(cardFrequency(999),pitches.at(-1)); assert.equal(cardFrequency(5)/cardFrequency(0),2); assert.equal(cardFrequency(NaN),cardFrequency(0)); });
  check('eight card sounds are immediate and doubling is an octave', () => { for(let i=0;i<8;i++)sound.playCard(i); sound.double(7); assert.equal(ctx.sources.length,9); assert.ok(ctx.sources.every(s=>s.start.calls[0][0]===0)); assert.equal(ctx.sources[8].frequency.setValueAtTime.calls[0][0],cardFrequency(7)*2); });
  check('all synthesized cues have valid scheduled frequencies and times', () => { sound.white();sound.rainbow();sound.hit();sound.hit(true);sound.pierce();sound.heartLose();sound.heal();sound.button();for(const rule of ['bite','hug','unwind','wound_down','bell','layer'])sound.rule(rule);assert.ok(ctx.sources.length>35);for(const source of ctx.sources){assert.equal(source.start.calls.length,1); for(const calls of [source.start.calls,source.stop.calls,source.frequency.setValueAtTime.calls,source.frequency.exponentialRampToValueAtTime.calls])assert.ok(calls.flat().every(Number.isFinite));} });
  check('three volume levels, mute and background suspend discard voices', () => { for(const volume of [1,2,3]){sound.configure({volume});assert.equal(ctx.gains[0].gain.setTargetAtTime.calls.at(-1)[0],SOUND.volume[volume]);}sound.configure({sound:false});const n=ctx.sources.length;sound.hit();assert.equal(ctx.sources.length,n);assert.ok(ctx.sources.every(s=>s.disconnect.calls.length));sound.configure({sound:true});sound.rainbow();doc.hidden=true;doc.dispatchEvent(new Event('visibilitychange'));const count=ctx.sources.length;sound.playCard(0);assert.equal(ctx.sources.length,count);assert.equal(ctx.suspend.calls.length,1);doc.hidden=false;doc.dispatchEvent(new Event('visibilitychange'));assert.equal(ctx.resume.calls.length,2); });
  check('extreme repeated audio is bounded with no waiting queue', () => { for(let i=0;i<40;i++)sound.rainbow();assert.equal(ctx.sources.filter(s=>!s.disconnect.calls.length).length,SOUND.maxVoices); });
  check('dispose releases audio and gesture listeners', () => { sound.dispose();assert.equal(ctx.close.calls.length,1);doc.dispatchEvent(new Event('pointerdown'));assert.equal(Context.all.length,1); });
  console.log(JSON.stringify({passed:checks.length,checks,limits:['Node API mocks only; Vitest, browser rendering, audible sound quality, video and performance not covered.']},null,2));
} finally { feel?.dispose();sound?.dispose();globalThis.setTimeout=nativeTimeout;globalThis.clearTimeout=nativeClear;delete globalThis.AudioContext; }
