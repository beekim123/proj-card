// Runs the real production rule commands, not a second implementation of damage.
// Usage: node --import ./verification/v2/typescript-loader.mjs verification/v2/simulation/run-rules-bots.mjs
import { writeFileSync } from 'node:fs';
import {
  createRun, chooseRelic, playRunCard, undoRun, endRunTurn, chooseLoot,
  cloneRun, currentRule,
} from '../../../src/rules/index.ts';

const RELIC_PRIORITY = ['white', 'once', 'same', 'grow', 'rainbow', 'heart'];
const LOOT_PRIORITY = ['hammer', 'lens', 'bag', 'mirror', 'stone'];
const REACTION_PRIORITY = { white: 3, shun: 2, same: 1, plain: 0 };
const PLAN_NODES = 60_000;
const compare = (a, b) => {
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
};
function chooserRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hintPick(run) {
  let chosen = -1;
  let best = null;
  const originalCountdown = run.monster.countdown;
  const originalBroken = run.monster.broken;
  const originalChain = run.game.chain.length;
  for (let i = 0; i < run.game.hand.length; i += 1) {
    const entry = playRunCard(run, i);
    const attack = !originalBroken && !run.monster.broken && originalCountdown - 1 > 0 && run.monster.countdown - 1 <= 0;
    const key = [REACTION_PRIORITY[entry.k], entry.k === 'shun' && run.game.chain.length > originalChain ? 1 : 0, run.game.m, entry.damage];
    if (!attack && (!best || compare(key, best) > 0)) { chosen = i; best = key; }
    if (!undoRun(run)) throw new Error('Hint search could not restore rule state');
  }
  return chosen;
}
function plan(run) {
  // Public commands and their exact undo keep search faithful to the live rules.
  const probe = cloneRun(run);
  probe.hist = []; probe.game.hist = [];
  let nodes = 0;
  let best = null;
  let bestSequence = [];
  function dfs(remaining, sequence) {
    if (++nodes > PLAN_NODES) return;
    const score = [probe.monster.broken ? 1 : 0, probe.monster.broken || probe.monster.countdown - 1 > 0 ? 1 : 0, probe.game.turnDmg];
    if (!best || compare(score, best) > 0) { best = score; bestSequence = [...sequence]; }
    const seen = new Set();
    for (let i = 0; i < remaining.length; i += 1) {
      const card = remaining[i];
      const signature = `${card.type ?? ''}:${card.v}`;
      if (seen.has(signature)) continue;
      seen.add(signature);
      const index = probe.game.hand.findIndex((c) => c.id === card.id);
      if (index < 0) throw new Error('Planner card disappeared');
      playRunCard(probe, index);
      // Match the supplied planner: bag draws are not searched in this subtree.
      // Real execution replans immediately after playing a bag or changing layer.
      dfs(remaining.slice(0, i).concat(remaining.slice(i + 1)), [...sequence, card.id]);
      if (!undoRun(probe)) throw new Error('Planner could not restore rule state');
      if (nodes > PLAN_NODES) break;
    }
  }
  dfs([...probe.game.hand], []);
  return bestSequence;
}
function runOne(seed, bot, relicRandom) {
  const run = createRun(seed);
  if (run.phase !== 'relic') throw new Error('Expected second-version opening relic phase');
  const relicIndex = bot === 'hint'
    ? Math.floor(relicRandom() * run.relicOptions.length)
    : run.relicOptions.reduce((best, item, i, all) => RELIC_PRIORITY.indexOf(item) < RELIC_PRIORITY.indexOf(all[best]) ? i : best, 0);
  chooseRelic(run, relicIndex);
  let hits = 0;
  let turns = 0;
  let best = 0;
  let rainbows = 0;
  let timedOut = false;
  const relic = run.relic;
  while (run.phase === 'battle' || run.phase === 'loot') {
    if (run.phase === 'loot') {
      const index = run.loot.reduce((best, item, i, all) => LOOT_PRIORITY.indexOf(item) < LOOT_PRIORITY.indexOf(all[best]) ? i : best, 0);
      chooseLoot(run, index);
      continue;
    }
    if (run.game.turn > 60 || turns > 360) { timedOut = true; break; }
    if (bot === 'hint') {
      let guard = 0;
      while (run.game.hand.length && guard++ < 60) {
        const index = hintPick(run);
        if (index < 0) break;
        const entry = playRunCard(run, index);
        if (entry.rainbow > 0) rainbows += 1;
      }
    } else {
      let guard = 0;
      while (run.game.hand.length && guard++ < 20) {
        const sequence = plan(run);
        if (!sequence.length) break;
        let replan = false;
        for (const id of sequence) {
          const beforeRule = currentRule(run);
          const index = run.game.hand.findIndex((card) => card.id === id);
          const type = run.game.hand[index].type;
          const entry = playRunCard(run, index);
          if (entry.rainbow > 0) rainbows += 1;
          if (type === 'bag' || (run.monster.key === 'dragon' && beforeRule !== currentRule(run))) { replan = true; break; }
        }
        if (!replan) break;
      }
    }
    turns += 1;
    best = Math.max(best, run.game.turnDmg);
    const hearts = run.hearts;
    endRunTurn(run);
    hits += Math.max(0, hearts - run.hearts);
  }
  return { seed, bot, relic, win: run.phase === 'victory', hits, turns, best, rainbows, timedOut, lostAt: run.phase === 'victory' ? null : run.fight };
}
function runMany(bot, count) {
  const relicRandom = chooserRandom(0x7632);
  const runs = [];
  for (let i = 0; i < count; i += 1) {
    runs.push(runOne(1 + i * 7919, bot, relicRandom));
    if ((i + 1) % 10 === 0) console.error(`${bot}: ${i + 1}/${count}`);
  }
  const wins = runs.filter((run) => run.win).length;
  return { bot, count, wins, winPercent: wins / count * 100, meanHits: runs.reduce((sum, run) => sum + run.hits, 0) / count, timeouts: runs.filter((run) => run.timedOut).length, runs };
}
const requested = process.argv[2] ?? 'both';
const results = [];
if (requested === 'both' || requested === 'hint') results.push(runMany('hint', Number(process.env.GEMCARD_HINT_RUNS ?? 300)));
if (requested === 'both' || requested === 'plan') results.push(runMany('plan', Number(process.env.GEMCARD_PLAN_RUNS ?? 60)));
const output = { implementation: 'Production rule commands with exact undo, Node 24 built-in TS transform', seedFormula: '1 + i * 7919', planNodes: PLAN_NODES, results };
writeFileSync(new URL(`rules-${requested}-results.json`, import.meta.url), JSON.stringify(output, null, 2) + '\n');
console.log(JSON.stringify(results.map(({ runs, ...summary }) => summary), null, 2));
