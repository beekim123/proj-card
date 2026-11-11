/** Dependency-free persistence smoke check; Node 24+ native TypeScript stripping. */
import { registerHooks } from 'node:module';
import assert from 'node:assert/strict';
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) {
    try { return nextResolve(`${specifier}.ts`, context); } catch { /* Original resolution reports errors. */ }
  }
  return nextResolve(specifier, context);
} });
const rules = await import('../src/rules/run.ts');
const { createToolCard } = await import('../src/rules/index.ts');
const { encodeRunSave, decodeRunSave, isActiveRunState } = await import('../src/rules/save-state.ts');
const { loadRun, saveRun, saveRecords, loadRecords, SAVE_KEYS } = await import('../src/save.ts');
const { createRun, chooseRelic, chooseLoot, chooseDoor, shopCopy, shopDrop, playRunCard, endRunTurn, undoRun, debugGiveRelic } = rules;
let checks = 0;
function roundtrip(run) {
  const raw = encodeRunSave(run);
  assert.equal(JSON.parse(raw).version, 4);
  const restored = decodeRunSave(raw).state;
  assert.deepEqual(restored, run); checks++;
  return restored;
}
function win(run) {
  run.monster.hp = run.monster.turnStartHp = 1;
  while (!run.monster.broken && run.game.hand.length) playRunCard(run, 0);
  endRunTurn(run);
}
function step(run) {
  if (run.phase === 'relic') chooseRelic(run, 0);
  else if (run.phase === 'doors') chooseDoor(run, Math.max(0, run.doors.findIndex(door => door.reward === 'shop')));
  else if (run.phase === 'loot') run.loot.length ? chooseLoot(run, 0) : rules.skipLoot(run);
  else if (run.phase === 'shop') shopCopy(run, run.cards[0].id);
  else if (run.phase === 'battle') {
    if (run.monster.broken || !run.game.hand.length) endRunTurn(run);
    else playRunCard(run, 0);
  }
}
const run = createRun(808); roundtrip(run); chooseRelic(run, 0); roundtrip(run);
win(run); roundtrip(run); chooseLoot(run, 0); const doors = structuredClone(run);
chooseDoor(run, run.doors.findIndex(door => door.reward === 'shop')); win(run);
const shop = structuredClone(run); shopCopy(run, run.cards[0].id); win(run);
const elite = structuredClone(run); chooseRelic(run, 0); chooseDoor(run, 0);
debugGiveRelic(run, 'twice');
while (run.game.hand.length > 8) run.game.deck.unshift(run.game.hand.pop());
for (const type of ['seal', 'hourglass', 'shadow', 'whistle']) {
  const card = createToolCard(type, run.nextCardId++);
  run.cards.push({ ...card }); run.game.hand.push({ ...card });
}
playRunCard(run, run.game.hand.findIndex(card => card.type === 'seal'));
playRunCard(run, run.game.hand.findIndex(card => card.type === 'hourglass'));
assert.equal(run.monster.sealed, true);
const sealed = structuredClone(run);
for (const state of [doors, shop, elite, sealed]) {
  const expected = structuredClone(state), restored = roundtrip(state);
  for (let i = 0; i < 30; i++) { step(expected); step(restored); assert.deepEqual(restored, expected); checks++; }
}
run.monster.countdown = run.monster.maxCountdown + 5;
playRunCard(run, run.game.hand.findIndex(card => card.type === 'shadow'));
const restored = roundtrip(run); undoRun(run); undoRun(restored); assert.deepEqual(restored, run); checks++;
shopDrop(shop, shop.cards.slice(0, 3).map(card => card.id)); assert.equal(shop.cards.length, 28); roundtrip(shop);
shop.cards = shop.cards.slice(0, 19); assert.equal(isActiveRunState(shop), false); checks++;
for (const version of [0, 1, 2, 3]) {
  const data = new Map();
  const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
  const records = { played: 8, wins: 2, farthest: 7, bestTurn: 123, maxOverkill: 10 };
  saveRecords(records, storage); storage.setItem(SAVE_KEYS.run, JSON.stringify({ version, state: {} }));
  assert.equal(loadRun(storage).reason, 'outdated'); assert.equal(storage.getItem(SAVE_KEYS.run), null);
  assert.deepEqual(loadRecords(storage), records); assert.equal(saveRun(doors, storage), true);
  assert.deepEqual(loadRun(storage).state, doors); checks++;
}
console.log(`PASS: ${checks} v4 save checks (all active phases, 4 × 30 continuation commands, undo, reduced decks, old-save clearing and unchanged records).`);

let seedStates = 0;
for (let seed = 1; seed <= 200; seed++) {
  const state = createRun(seed);
  for (let command = 0; command < 80 && !state.result; command++) {
    roundtrip(state); seedStates++;
    if (state.phase === 'relic') chooseRelic(state, seed % state.relicOptions.length);
    else if (state.phase === 'doors') chooseDoor(state, seed % 2);
    else if (state.phase === 'shop') {
      if (seed % 2) shopDrop(state, state.cards.slice(0, Math.min(3, state.cards.length - 20)).map(card => card.id));
      else shopCopy(state, state.cards.find(card => !card.type).id);
    } else if (state.phase === 'loot') rules.skipLoot(state);
    else if (state.phase === 'battle') win(state);
  }
  assert.equal(state.phase, 'victory');
}
console.log(`PASS: ${seedStates} active-state roundtrips across 200 completed seeded adventures (forced wins, not balance testing).`);
