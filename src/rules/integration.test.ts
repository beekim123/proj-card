import { describe, expect, it } from 'vitest';
import {
  chooseLoot, createRun as createUnselectedRun, chooseRelic, decodeRunSave, encodeRunSave, endRunTurn,
  playRunCard, previewCard, skipLoot, undoRun,
} from './index';
import type { RunState } from './run-types';

/** Existing battle scenarios explicitly choose a non-numeric-changing relic. */
function createRun(seed: number): RunState {
  const run = createUnselectedRun(seed);
  run.relicOptions = ['same', 'once', 'white'];
  chooseRelic(run, 0);
  return run;
}

function inventory(run: RunState): void {
  const cards = [...run.game.deck, ...run.game.hand, ...run.game.row, ...run.game.discard];
  expect(cards).toHaveLength(run.cards.length);
  expect(new Set(cards.map((card) => card.id)).size).toBe(run.cards.length);
  expect([...cards.map((card) => card.id)].sort((a, b) => a - b))
    .toEqual([...run.cards.map((card) => card.id)].sort((a, b) => a - b));
}

/** Integration guard: real commands, active-save round trips, and whole-run conservation. */
describe('整局规则集成压力', () => {
  it.each(Array.from({ length: 100 }, (_, seed) => seed))('种子%d整局自动操作，每次存读和撤回重做完全一致', (seed) => {
      let run = createRun(seed);
      let commands = 0;
      while (run.phase === 'battle' || run.phase === 'loot') {
        expect(commands).toBeLessThan(1_000);
        const saved = encodeRunSave(run);
        const restored = decodeRunSave(saved).state;
        expect(restored).toEqual(run);
        run = restored!;
        inventory(run);
        if (run.phase === 'loot') {
          if (seed % 5 === 0) skipLoot(run);
          else {
            const hammer = run.loot.indexOf('hammer');
            chooseLoot(run, hammer >= 0 ? hammer : 0);
          }
        } else if (run.game.hand.length > 0) {
          // A repeatable test policy, not a claim about optimal or human play.
          let selected = 0;
          let largest = -1;
          run.game.hand.forEach((card, index) => {
            const projected = previewCard(run.game, card);
            const score = projected.damage + projected.m2;
            if (score > largest) { largest = score; selected = index; }
          });
          const before = JSON.stringify(run);
          playRunCard(run, selected);
          const after = JSON.stringify(run);
          if (commands % 3 === 0) {
            expect(undoRun(run)).toBe(true);
            expect(JSON.stringify(run)).toBe(before);
            playRunCard(run, selected);
            expect(JSON.stringify(run)).toBe(after);
          }
        } else endRunTurn(run);
        inventory(run);
        commands += 1;
      }
      expect(['victory', 'defeat']).toContain(run.phase);
      expect(run.result).not.toBeNull();
      expect(encodeRunSave(run)).toBeNull();
  }, 10_000);
});
