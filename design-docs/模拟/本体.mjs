// 本体模拟器：三幕、挑门、工坊、中途拿宝物、新额外牌、新规矩。
// 底层结算照 src/rules/（和 sim.mjs 同一套写法），新内容写成表。
// 配置 V 全是普通数据（能 JSON），方便分给几个进程一起跑。
// 用法见 跑本体.mjs。

const DECK = [[1, 5], [2, 5], [4, 5], [3, 4], [6, 4], [5, 4], [7, 2], [0, 1]];
const CHROMA = [1, 3, 2, 6, 4, 5];
const pc = x => (x & 1) + ((x >> 1) & 1) + ((x >> 2) & 1);

// 额外牌：宝石位。效果写在 playOne 里。
export const TOOLS = {
  bag: { v: 2 }, lens: { v: 4 }, hammer: { v: 1 }, mirror: { v: 0 }, stone: { v: 0 },
  shadow: { v: 0 }, palette: { v: 0 }, hourglass: { v: 6 }, potion: { v: 1 },
  seal: { v: 0 }, diamond: { v: 7 }, whistle: { v: 3 },
};

export function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function shuffle(a, r) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function reaction(p, c) { if (p === null) return 'plain'; const d = pc(p ^ c); return d === 0 ? 'same' : d === 1 ? 'shun' : d === 3 ? 'white' : 'plain'; }
const layerOf = (hp, maxHp) => hp > maxHp * 2 / 3 ? 0 : hp > maxHp / 3 ? 1 : 2;

function gemVal(xp, i, RL) {
  const a = RL.grow ? 8 : 15, b = RL.grow ? 24 : 45;
  const n = xp[i];
  return n >= b ? (RL.shine300 ? 300 : 200) : n >= a ? 150 : 100;
}

/** 现在起作用的规矩；打穿了、贴了封条就没有。 */
function ruleOf(T, mon) {
  if (T.broken || T.muted) return null;
  return mon.layers ? mon.layers[layerOf(T.hp, mon.maxHp)] : mon.rule;
}
export function canPlay(T, mon, V) {
  if (ruleOf(T, mon) === 'six' && T.played >= (V.sixLimit ?? 6)) return false;
  return true;
}

/** 打出一张牌。T 是这回合的状态（会被改），返回这张的结果。 */
export function playOne(T, c, mon, RL, V) {
  const rule = ruleOf(T, mon);
  const ty = c.type;
  let v = c.v;
  if (ty === 'mirror') v = T.prev === null ? 0 : 7 - T.prev;
  else if (ty === 'shadow' || ty === 'palette') v = T.prev === null ? 0 : T.prev;
  let k = reaction(T.prev, v);
  if (ty === 'palette' && T.prev !== null) k = 'shun';
  else if (ty === 'shadow' && T.prev !== null && !V.shadowOld) k = T.prevK;   // 影子：上一张怎么算，它就怎么算
  else if (RL.once && k === 'plain' && T.prev !== null && !T.usedPlain) { k = 'shun'; T.usedPlain = true; }

  const single = pc(v) === 1;
  let b = 0;
  for (let i = 0; i < 3; i++) {
    if (!(v & (1 << i))) continue;
    let g = gemVal(T.xp, i, RL);
    if (RL['x2_' + i]) g *= 2;
    if (ty === 'diamond') g *= 2;
    if (rule === 'hug' && i === 0) g = 0;
    if (rule === 'picky' && single) g = 0;
    b += g;
  }
  const cm = k === 'white' ? (RL.white8 ? 8 : 5) : k === 'shun' ? (RL.shun3 ? 3 : 2) : k === 'same' ? (RL.same4 ? 4 : 2) : 1;
  const dmg = b * T.m * cm;
  let m2 = (k === 'shun' || k === 'white' || (RL.same && k === 'same')) ? T.m * 2 : T.m + 1;

  const keep = k === 'shun' || (RL.whitelink && k === 'white');
  const chain = keep ? T.chain.slice() : [];
  if (CHROMA.includes(v) && !chain.includes(v)) chain.push(v);
  if (ty === 'palette' && T.prev !== null) { const miss = CHROMA.find(x => !chain.includes(x)); if (miss !== undefined) chain.push(miss); }
  let rb = 0;
  if (!T.rainbow && chain.length >= (RL.rainbow5 ? 5 : 6)) { rb = (T.turnDmg + dmg) * ((RL.rb20 ? 20 : 10) - 1); T.rainbow = true; T.rbCount++; if (RL.rbheal) T.heal += 1; }
  const times = (RL.twice || (RL.twice1 && ty && T.toolsPlayed === 0)) ? 2 : 1;
  const hamX = V.hammerX ?? 2;
  let ham = 0;
  if (ty === 'hammer') { let tot = T.turnDmg + dmg + rb; for (let t = 0; t < times; t++) { ham += tot * (hamX - 1); tot *= hamX; } }
  let damage = dmg + rb + ham;
  if (rule === 'duck' && T.played % 2 === 1) damage = 0;   // 缩头：第 2、4、6…张打不着

  T.turnDmg += damage;
  const wasBroken = T.broken;
  T.hp = Math.max(0, T.hp - damage); if (T.hp === 0) T.broken = true;
  if (rule && !wasBroken && !T.broken) {
    if (rule === 'bite' && (v & 2)) T.cd = Math.max(0, T.cd - 1);
    if (rule === 'bell' && k === 'white') T.cd = Math.max(0, T.cd - 1);
    if (rule === 'wind' && !T.woundDown && T.wind > 0 && (v & 4)) { T.wind--; if (T.wind === 0) { T.cd = mon.maxCd; T.woundDown = true; T.cancels++; } }
  }
  for (let i = 0; i < 3; i++) T.xp[i] += ((v >> i) & 1) + (ty === 'stone' ? 5 * times : 0);
  if (ty === 'lens') m2 *= (times === 2 ? 4 : 2);
  if (ty === 'bag') T.draw += 2 * times;
  if (ty === 'hourglass' && !T.broken) T.cd += times;
  if (ty === 'potion') T.heal += times;
  if (ty === 'whistle') T.drawTool += times;
  if (ty === 'seal') T.muted = true;
  if (rule === 'cap') m2 = Math.min(m2, V.capM ?? 32);
  T.m = m2; T.prev = v; T.prevK = k; T.chain = chain; T.played++; if (ty) T.toolsPlayed++;
  if (RL.fifth && T.played === 5) T.draw += 1;
  return { k, v, damage };
}
const cloneT = T => ({ ...T, chain: T.chain.slice(), xp: T.xp.slice() });

// ---------- 机器人 ----------
const PRI = { white: 3, shun: 2, same: 1, plain: 0 };
const cmpK = (a, b) => { for (let i = 0; i < a.length; i++) { if (a[i] !== b[i]) return a[i] - b[i]; } return 0; };

/** 跟提示：一张一张挑"提示最好的那张"，会躲"会挨打"。和界面提示同一个排法。 */
function hintPick(T, hand, mon, RL, V, ctx) {
  if (!canPlay(T, mon, V)) return -1;
  let best = -1, key = null;
  for (let i = 0; i < hand.length; i++) {
    const c = hand[i];
    if (c.type === 'potion' && ctx.hearts >= ctx.maxHearts) continue;   // 心满不喝药
    const t = cloneT(T); const e = playOne(t, c, mon, RL, V);
    if (!T.broken && !t.broken && T.cd - 1 > 0 && t.cd - 1 <= 0) continue;   // 会挨打
    const kk = [PRI[e.k], (e.k === 'shun' && t.chain.length > T.chain.length) ? 1 : 0, t.m, e.damage];
    if (!key || cmpK(kk, key) > 0) { key = kk; best = i; }
  }
  return best;
}
/** 看两步：每次往后看两张，挑头一张。代表打过几局、还不会整手排的玩家。 */
function look2Pick(T, hand, mon, RL, V, ctx) {
  if (!canPlay(T, mon, V)) return -1;
  let best = -1, bs = null;
  const usable = c => !(c.type === 'potion' && ctx.hearts >= ctx.maxHearts);
  for (let i = 0; i < hand.length; i++) {
    if (!usable(hand[i])) continue;
    const t1 = cloneT(T); playOne(t1, hand[i], mon, RL, V);
    if (!T.broken && !t1.broken && T.cd - 1 > 0 && t1.cd - 1 <= 0) continue;
    let s1 = [t1.broken ? 1 : 0, (t1.broken || t1.cd - 1 > 0) ? 1 : 0, t1.turnDmg + t1.m * 50];
    if (canPlay(t1, mon, V)) for (let j = 0; j < hand.length; j++) {
      if (j === i || !usable(hand[j])) continue;
      const t2 = cloneT(t1); playOne(t2, hand[j], mon, RL, V);
      if (!t1.broken && !t2.broken && t1.cd - 1 > 0 && t2.cd - 1 <= 0) continue;
      const s2 = [t2.broken ? 1 : 0, 1, t2.turnDmg + t2.m * 50]; if (cmpK(s2, s1) > 0) s1 = s2;
    }
    if (!bs || cmpK(s1, bs) > 0) { bs = s1; best = i; }
  }
  return best;
}
/** 整手规划：把这手牌的顺序搜一遍。先看能不能打穿，再看挨不挨打，再看回不回心，最后比伤害。 */
function plan(T, hand, mon, RL, V, ctx) {
  let best = null, nodes = 0;
  const hurt = ctx.hearts < ctx.maxHearts;
  const endScore = t => [t.broken ? 1 : 0, (t.broken || t.cd - 1 > 0) ? 1 : 0, hurt ? Math.min(t.heal, ctx.maxHearts - ctx.hearts) : 0, t.turnDmg];
  function dfs(t, rem, seq) {
    if (++nodes > V.planNodes) return;
    const s = endScore(t); if (!best || cmpK(s, best.s) > 0) best = { s, seq: seq.slice() };
    if (!canPlay(t, mon, V)) return;
    const seen = new Set();
    for (let i = 0; i < rem.length; i++) {
      const c = rem[i]; const sig = (c.type || '') + c.v; if (seen.has(sig)) continue; seen.add(sig);
      if (c.type === 'potion' && !hurt) continue;
      const t2 = cloneT(t); playOne(t2, c, mon, RL, V);
      const r2 = rem.slice(0, i).concat(rem.slice(i + 1)); seq.push(c.id); dfs(t2, r2, seq); seq.pop();
      if (nodes > V.planNodes) return;
    }
  }
  dfs(cloneT(T), hand, []);
  return best?.seq ?? [];
}

/** 试 N 种排法：随手排 N 种顺序（外加"跟提示"那一种），挑最好的一种、打到最划算的那一张为止。
 *  N 小 = 普通玩家，N 大 = 接近整手规划。 */
function tryPlan(T, hand, mon, RL, V, ctx, r2) {
  const hurt = ctx.hearts < ctx.maxHearts;
  const score = t => [t.broken ? 1 : 0, (t.broken || t.cd - 1 > 0) ? 1 : 0, hurt ? Math.min(t.heal, ctx.maxHearts - ctx.hearts) : 0, t.turnDmg];
  let best = { s: score(T), seq: [] };
  const evalOrder = order => {
    const t = cloneT(T); const seq = [];
    for (const c of order) {
      if (!canPlay(t, mon, V)) break;
      if (c.type === 'potion' && !hurt) continue;
      playOne(t, c, mon, RL, V); seq.push(c.id);
      const s = score(t); if (cmpK(s, best.s) > 0) best = { s, seq: seq.slice() };
    }
  };
  { // 跟提示的那一种
    const t = cloneT(T); const rem = hand.slice(); const order = [];
    for (let g = 0; g < 40 && rem.length; g++) { const i = hintPick(t, rem, mon, RL, V, ctx); if (i < 0) break; const c = rem.splice(i, 1)[0]; playOne(t, c, mon, RL, V); order.push(c); }
    evalOrder(order);
  }
  for (let n = 0; n < (V.tries ?? 20); n++) evalOrder(shuffle(hand.slice(), r2));
  return best.seq;
}

// ---------- 局外的小决定（拿哪个、走哪扇门、工坊干什么）----------
function pickByPri(opts, pri, r) {
  if (!pri) return opts[Math.floor(r() * opts.length)];
  let best = opts[0], b = 1e9;
  for (const o of opts) { let p = pri.indexOf(o); if (p < 0) p = 999; if (p < b) { b = p; best = o; } }
  return best;
}
const MONO = [1, 2, 4];
function doWorkshop(cards, S, V, r) {
  const P = V.policy;
  const op = P.shop === 'random' ? ['drop', 'copy', 'recolor'][Math.floor(r() * 3)] : P.shop;
  const base = cards.filter(c => !c.type);
  const tools = cards.filter(c => c.type);
  if (op === 'drop') {
    for (let n = 0; n < (V.dropCount ?? 2); n++) {
      let idx = -1;
      if (P.shopTarget === 'random') { const cand = cards.map((c, i) => i).filter(i => !cards[i].type); idx = cand[Math.floor(r() * cand.length)] ?? -1; }
      else { // 先扔空托，再把单颗牌里最多的那种扔掉
        idx = cards.findIndex(c => !c.type && c.v === 0);
        if (idx < 0) { const cnt = MONO.map(m => cards.filter(c => !c.type && c.v === m).length); const mx = Math.max(...cnt); if (mx > 0) { const m = MONO[cnt.indexOf(mx)]; idx = cards.findIndex(c => !c.type && c.v === m); } }
        if (idx < 0) idx = cards.findIndex(c => !c.type);
      }
      if (idx >= 0) cards.splice(idx, 1);
    }
  } else if (op === 'copy') {
    let src;
    if (P.shopTarget === 'random' || !tools.length) src = cards[Math.floor(r() * cards.length)];
    else { const pri = P.lootPri || []; src = tools.slice().sort((a, b) => ((pri.indexOf(a.type) + 1) || 999) - ((pri.indexOf(b.type) + 1) || 999))[0]; }
    if (P.shopTarget !== 'random' && !tools.length) src = cards.find(c => c.v === 7) || src;
    cards.push({ id: ++S.id, v: src.v, ...(src.type ? { type: src.type } : {}) });
  } else if (op === 'recolor') {
    for (let n = 0; n < (V.recolorCount ?? 1); n++) {
      if (P.shopTarget === 'random') { const c = base[Math.floor(r() * base.length)]; if (c) c.v = Math.floor(r() * 8); }
      else { // 把空托、单颗牌改成白宝石
        const c = cards.find(c => !c.type && c.v === 0) || (() => { const cnt = MONO.map(m => cards.filter(c => !c.type && c.v === m).length); const mx = Math.max(...cnt); return mx > 0 ? cards.find(c => !c.type && c.v === MONO[cnt.indexOf(mx)]) : null; })();
        if (c) c.v = P.recolorTo ?? 7;
      }
    }
  }
  S.shops.push(op);
}

// ---------- 一局 ----------
export function runOne(seed, V) {
  const r = rng(seed), r2 = rng((seed ^ 0x9e3779b9) >>> 0);
  const S = { id: 0, shops: [] };
  const cards = []; for (const [v, n] of DECK) for (let i = 0; i < n; i++) cards.push({ id: ++S.id, v });
  for (const t of V.forceTools || []) cards.push({ id: ++S.id, v: TOOLS[t].v, type: t });
  const relics = new Set(V.forceRelics || []);
  const RL = {};
  const applyRelics = () => { for (const k of Object.keys(RL)) delete RL[k]; for (const x of relics) RL[x] = true; };
  const P = V.policy;
  const offerRelic = () => {
    const pool = V.relicPool.filter(x => !relics.has(x)); if (!pool.length) return;
    const opts = shuffle(pool.slice(), r).slice(0, V.relicOptions ?? 3);
    relics.add(pickByPri(opts, P.relic === 'random' ? null : P.relicPri, r)); applyRelics();
  };
  if (V.startRelic) offerRelic();
  applyRelics();
  let maxHearts = V.hearts + (RL.heart ? 1 : 0);
  let hearts = maxHearts, hand = V.handStart, xp = [0, 0, 0];
  const st = { turns: 0, hits: 0, best: 0, rainbows: 0, cancels: 0, fightTurns: [], lost: null, acts: 0, actHits: [], actTurns: [], picks: [], doors: [], kills1: 0, fights: 0, byMon: [], overkill10: 0, heals: 0, roomTurns: [], roomBest: [] };
  let roomNo = 0;

  outer:
  for (let a = 0; a < V.acts.length; a++) {
    const A = V.acts[a];
    let guardLeft = RL.guard ? 1 : 0;
    let actHits = 0, actTurns = 0, prevN = null, pendingReward = null, hpMul = 1;
    for (let f = 0; f < A.rooms.length; f++) {
      const F = A.rooms[f];
      roomNo++;
      // --- 这一间打谁、打赢拿什么 ---
      let key, reward;
      if (F.t === 'elite' || F.t === 'boss') { key = F.mon; reward = F.t === 'elite' ? 'eliteRelic' : 'bossRelic'; }
      else if (F.t === 'normal' || !V.doors) { const ch = A.normals.filter(k => k !== prevN); key = ch[Math.floor(r() * ch.length)]; reward = 'card'; }
      else {
        // 两扇门：怪不同，奖励不同
        const ms = shuffle(A.normals.filter(k => k !== prevN), r).slice(0, 2);
        if (ms.length < 2) ms.push(ms[0]);
        const types = V.doorRewards.filter(x => x !== 'heal' || hearts < maxHearts);
        const rs = shuffle(types.slice(), r).slice(0, 2);
        if (rs.length < 2) rs.push(rs[0]);
        const doors = [{ mon: ms[0], reward: rs[0] }, { mon: ms[1], reward: rs[1] }];
        let pick;
        if (P.door === 'random') pick = doors[Math.floor(r() * 2)];
        else { // 按奖励的喜好挑；缺心到 healAt 就先回心
          const pri = (hearts <= (P.healAt ?? 0) && hearts < maxHearts) ? ['heal', ...P.doorPri] : P.doorPri;
          const avoid = P.avoid || [];
          const score = d => { let p = pri.indexOf(d.reward); if (p < 0) p = 99; return p * 10 + (avoid.includes(d.mon) ? 1 : 0); };
          pick = score(doors[0]) <= score(doors[1]) ? doors[0] : doors[1];
        }
        key = pick.mon; reward = pick.reward; st.doors.push(reward);
      }
      if (F.t !== 'elite' && F.t !== 'boss') prevN = key;
      const MD = V.monsters[key] || {};
      const hp0 = Math.round(F.hp * (V.hpScale?.[a] ?? 1) * (V.hpAll ?? 1));
      let cd0 = ((F.t === 'boss' && V.bossCd) ? V.bossCd : (MD.cd ?? F.cd)) + (RL.slow ? 1 : 0);
      const mon = { key, rule: MD.rule ?? null, layers: F.layers ?? null, maxHp: hp0, maxCd: cd0 };
      const M = { hp: hp0, cd: cd0, wind: MD.wind ?? 0 };
      let deck = shuffle(cards.map(c => ({ ...c })), r), disc = [], H = [];
      const draw = n => { for (let i = 0; i < n; i++) { if (!deck.length) { if (!disc.length) break; deck = shuffle(disc, r); disc = []; } H.push(deck.pop()); } };
      const drawTool = n => { for (let i = 0; i < n; i++) { let ix = -1; for (let j = deck.length - 1; j >= 0; j--) if (deck[j].type) { ix = j; break; } if (ix < 0) break; H.push(deck.splice(ix, 1)[0]); } };
      draw(hand + (RL.first2 ? 2 : RL.first1 ? 1 : 0));
      let turn = 0, overkill = 0, woundDownPrev = false, bestHere = 0, fightHits = 0;
      while (true) {
        turn++; st.turns++; actTurns++;
        if (woundDownPrev) { M.wind = MD.wind ?? 0; woundDownPrev = false; }
        const turnStartHp = M.hp;
        const T = { m: RL.start2 ? 2 : 1, usedPlain: false, turnDmg: 0, prev: null, chain: [], rainbow: false, cd: M.cd, hp: M.hp, broken: false, xp, rbCount: 0, cancels: 0, played: 0, toolsPlayed: 0, prevK: 'plain', wind: M.wind, woundDown: false, muted: false, heal: 0, draw: 0, drawTool: 0 };
        const row = [];
        const ctx = { hearts, maxHearts };
        const exec = (i) => {
          const c = H.splice(i, 1)[0]; playOne(T, c, mon, RL, V);
          if (c.type === 'potion') { const ix = cards.findIndex(x => x.id === c.id); if (ix >= 0) cards.splice(ix, 1); } else row.push(c);
          let drew = false;
          if (T.heal) { const g = Math.min(T.heal, maxHearts - hearts); hearts += g; st.heals += g; ctx.hearts = hearts; T.heal = 0; }
          if (T.drawTool) { drawTool(T.drawTool); T.drawTool = 0; drew = true; }
          if (T.draw) { draw(T.draw); T.draw = 0; drew = true; }
          return drew;
        };
        if (V.bot === 'plan' || V.bot === 'try') {
          let guard = 0;
          while (H.length && guard++ < 30) {
            const seq = V.bot === 'plan' ? plan(T, H, mon, RL, V, ctx) : tryPlan(T, H, mon, RL, V, ctx, r2); if (!seq.length) break;
            let replan = false;
            for (const cid of seq) { const i = H.findIndex(c => c.id === cid); if (exec(i)) { replan = true; break; } }
            if (!replan) break;
          }
        } else {
          let guard = 0;
          while (H.length && guard++ < 60) {
            const i = V.bot === 'random' ? (canPlay(T, mon, V) ? Math.floor(r() * H.length) : -1) : V.bot === 'look2' ? look2Pick(T, H, mon, RL, V, ctx) : hintPick(T, H, mon, RL, V, ctx);
            if (i < 0) break; exec(i);
          }
        }
        xp = T.xp; M.hp = T.hp; M.cd = T.cd; M.wind = T.wind; woundDownPrev = T.woundDown;
        st.rainbows += T.rbCount; st.cancels += T.cancels;
        st.best = Math.max(st.best, T.turnDmg); bestHere = Math.max(bestHere, T.turnDmg);
        disc.push(...row.map(c => ({ ...c })));
        if (T.broken) { overkill = T.turnDmg / turnStartHp; break; }
        if (mon.rule === 'regrow' || (mon.layers && mon.layers[layerOf(M.hp, mon.maxHp)] === 'regrow')) M.hp += Math.floor((turnStartHp - M.hp) * (V.regrow ?? 0.5));
        M.cd -= 1;
        if (M.cd <= 0) {
          M.cd = mon.maxCd; st.hits++; actHits++; fightHits++;
          if (guardLeft > 0) guardLeft--; else hearts--;
        }
        if (hearts <= 0) { st.lost = { act: a + 1, room: f + 1, mon: key }; break; }
        draw(Math.max(0, hand - H.length));
        if (turn > 40) { st.lost = { act: a + 1, room: f + 1, mon: key, timeout: true }; break; }
      }
      st.byMon.push([a, key, turn, fightHits, st.lost ? 1 : 0]);
      st.fightTurns.push(turn); st.fights++; if (turn === 1) st.kills1++; if (overkill >= 10) st.overkill10++;
      st.roomTurns[roomNo - 1] = turn; st.roomBest[roomNo - 1] = bestHere;
      if (st.lost) { st.actHits.push(actHits); st.actTurns.push(actTurns); break outer; }
      // --- 打赢以后 ---
      if (F.handUp) hand = Math.min(V.handMax, hand + F.handUp);
      if (reward === 'eliteRelic') { if (V.eliteHeal !== false) hearts = V.eliteHealN ? Math.min(maxHearts, hearts + V.eliteHealN) : maxHearts; if (V.eliteRelic) offerRelic(); if (V.eliteCard) reward = 'card'; }
      if (reward === 'bossRelic') { hearts = maxHearts; if (V.bossRelic && a < V.acts.length - 1) offerRelic(); }
      if (RL.heart && maxHearts === V.hearts) { maxHearts = V.hearts + 1; hearts++; }
      if (reward === 'card') {
        const n = overkill >= 10 ? 4 : 3;
        const opts = shuffle(V.toolPool.slice(), r).slice(0, n);
        if (P.loot !== 'none') { const pick = pickByPri(opts, P.loot === 'random' ? null : P.lootPri, r); cards.push({ id: ++S.id, v: TOOLS[pick].v, type: pick }); st.picks.push(pick); }
      } else if (reward === 'shop') doWorkshop(cards, S, V, r);
      else if (reward === 'heal') { const g = Math.min(V.healAmount ?? 1, maxHearts - hearts); hearts += g; st.heals += g; }
    }
    st.acts = a + 1; st.actHits.push(actHits); st.actTurns.push(actTurns);
    if (V.stopAfterAct && a + 1 >= V.stopAfterAct) break;
  }
  return { win: !st.lost && st.acts === (V.stopAfterAct ?? V.acts.length), ...st, relics: [...relics], deck: cards.length, tools: cards.filter(c => c.type).length, hearts };
}

export function summarize(rs, V) {
  const N = rs.length;
  const med = a => { if (!a.length) return 0; const b = a.slice().sort((x, y) => x - y); return b[b.length >> 1]; };
  const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
  const nActs = V.stopAfterAct ?? V.acts.length;
  const out = { n: N, win: +(rs.filter(x => x.win).length / N * 100).toFixed(1) };
  out.acts = []; for (let a = 1; a <= nActs; a++) out.acts.push(+(rs.filter(x => x.acts >= a).length / N * 100).toFixed(1));
  out.hits = +avg(rs.map(x => x.hits)).toFixed(2);
  out.hitsWin = +avg(rs.filter(x => x.win).map(x => x.hits)).toFixed(2);
  out.actHits = []; for (let a = 0; a < nActs; a++) out.actHits.push(+avg(rs.filter(x => x.actHits.length > a).map(x => x.actHits[a])).toFixed(2));
  out.turns = med(rs.map(x => x.turns)); out.turnsWin = med(rs.filter(x => x.win).map(x => x.turns));
  out.perFight = +avg(rs.map(x => x.turns / Math.max(1, x.fights))).toFixed(2);
  out.kill1 = +(avg(rs.map(x => x.kills1 / Math.max(1, x.fights))) * 100).toFixed(0);
  out.best = med(rs.map(x => x.best));
  out.rbRuns = +(rs.filter(x => x.rainbows > 0).length / N * 100).toFixed(0);
  out.ok10 = +(avg(rs.map(x => x.overkill10 / Math.max(1, x.fights))) * 100).toFixed(0);
  const lost = {}; rs.forEach(x => { if (x.lost) { const k = `${x.lost.act}-${x.lost.room}`; lost[k] = (lost[k] || 0) + 1; } }); out.lostAt = lost;
  const byMon = {}; rs.forEach(x => { if (x.lost) byMon[x.lost.mon] = (byMon[x.lost.mon] || 0) + 1; }); out.lostTo = byMon;
  const rooms = Math.max(...rs.map(x => x.roomTurns.length));
  out.roomTurns = []; out.roomBest = [];
  for (let i = 0; i < rooms; i++) { const xs = rs.filter(x => x.roomTurns[i] != null); out.roomTurns.push(+avg(xs.map(x => x.roomTurns[i])).toFixed(1)); out.roomBest.push(med(xs.map(x => x.roomBest[i]))); }
  const bm = {}; rs.forEach(x => x.byMon.forEach(([a, key, turn, h, dead]) => { const k = `${a + 1}${key}`; const o = (bm[k] ||= { n: 0, t: 0, h: 0, d: 0 }); o.n++; o.t += turn; o.h += h; o.d += dead; }));
  out.byMon = Object.fromEntries(Object.entries(bm).sort().map(([k, o]) => [k, `${(o.t / o.n).toFixed(1)}回合 挨${(o.h / o.n).toFixed(2)} 死${(o.d / o.n * 100).toFixed(0)}% (${o.n})`]));
  out.deck = +avg(rs.map(x => x.deck)).toFixed(1); out.toolsN = +avg(rs.map(x => x.tools)).toFixed(1);
  return out;
}
export function runSeeds(V, seeds) { return seeds.map(s => runOne(s, V)); }
export function runMany(V, N, seed0 = 1) { const seeds = []; for (let s = 0; s < N; s++) seeds.push(seed0 + s * 7919); return summarize(runSeeds(V, seeds), V); }
