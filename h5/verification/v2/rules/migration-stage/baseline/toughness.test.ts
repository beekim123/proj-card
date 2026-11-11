import { describe, expect, it } from 'vitest';
import {
  createRun, playRunCard, endRunTurn, undoRun, previewRunCard, hitsWeakness,
  encodeRunSave, decodeRunSave, formatFull, formatFormula, RUN,
} from './index';
import type { RunState } from './run-types';

/** Put the given masks into hand (taken from the run's own deck/hand, so ids stay valid). */
function deal(run: RunState, masks: number[]) {
  const pool = [...run.game.hand, ...run.game.deck];
  const hand = masks.map((mask) => {
    const i = pool.findIndex((c) => !c.type && c.v === mask);
    if (i < 0) throw new Error(`no card ${mask}`);
    return pool.splice(i, 1)[0]!;
  });
  run.game.hand = hand; run.game.deck = pool;
}
const bit = (run: RunState) => 1 << run.monster.weak;
const other = (run: RunState) => [1, 2, 4].find((b) => b !== bit(run))!;

describe('toughness', () => {
  it('every monster starts with full toughness and a weak gem', () => {
    const run = createRun(7);
    expect(run.monster.maxToughness).toBe(RUN.fights[0]!.toughness);
    expect(run.monster.toughness).toBe(run.monster.maxToughness);
    expect([0, 1, 2]).toContain(run.monster.weak);
    expect(run.monster.guardDown).toBe(false);
  });

  it('only cards carrying the weak gem wear it down, one point each', () => {
    const run = createRun(11); run.monster.hp = run.monster.maxHp = 1e12; run.monster.turnStartHp = 1e12;
    deal(run, [other(run), bit(run), bit(run) | other(run), 7]);
    expect(hitsWeakness(run, other(run))).toBe(false);
    playRunCard(run, 0); expect(run.monster.toughness).toBe(6);
    playRunCard(run, 0); expect(run.monster.toughness).toBe(5);
    playRunCard(run, 0); expect(run.monster.toughness).toBe(4);
    playRunCard(run, 0); expect(run.monster.toughness).toBe(3); // white carries every gem
  });

  it('breaking (delay per config) boosts later plays ×1.5, and refills next turn', () => {
    const run = createRun(3); run.monster.hp = run.monster.maxHp = 1e12; run.monster.turnStartHp = 1e12;
    run.monster.toughness = 1;
    deal(run, [bit(run), bit(run)]);
    const countdown = run.monster.countdown;
    const first = playRunCard(run, 0);
    expect(first.guard).toBeUndefined();
    expect(run.monster.guardDown).toBe(true); expect(run.monster.toughness).toBe(0);
    expect(run.monster.countdown).toBe(countdown + RUN.guardDelay);
    const turnBefore = run.game.turnDmg;
    const second = playRunCard(run, 0);
    expect(second.guard).toBe(Math.round(second.dmg * 0.5 + second.rainbow * 0.5 + second.hammer * 0.5));
    expect(second.damage).toBe(second.dmg + second.rainbow + second.hammer + second.guard!);
    expect(run.game.turnDmg - turnBefore).toBe(second.damage);
    expect(formatFormula(second)).toContain('破防');
    endRunTurn(run);
    expect(run.monster.guardDown).toBe(false);
    expect(run.monster.toughness).toBe(run.monster.maxToughness);
    expect(run.monster.countdown).toBe(countdown + RUN.guardDelay - 1);
  });

  it('undo restores toughness, the break and the bonus', () => {
    const run = createRun(5); run.monster.hp = run.monster.maxHp = 1e12; run.monster.turnStartHp = 1e12;
    run.monster.toughness = 1;
    deal(run, [bit(run), bit(run)]);
    playRunCard(run, 0); const total = run.game.turnDmg; playRunCard(run, 0);
    undoRun(run); expect(run.game.turnDmg).toBe(total); expect(run.monster.guardDown).toBe(true);
    undoRun(run); expect(run.monster.toughness).toBe(1); expect(run.monster.guardDown).toBe(false);
  });

  it('a monster already broken through (HP 0) no longer loses toughness', () => {
    const run = createRun(9); run.monster.hp = 1; run.monster.turnStartHp = 1;
    deal(run, [bit(run), bit(run)]);
    playRunCard(run, 0); const t = run.monster.toughness; playRunCard(run, 0);
    expect(run.monster.broken).toBe(true); expect(run.monster.toughness).toBe(t);
  });

  it('preview matches the real play, including the break bonus', () => {
    const run = createRun(13); run.monster.hp = run.monster.maxHp = 1e12; run.monster.turnStartHp = 1e12;
    run.monster.toughness = 1; deal(run, [bit(run), bit(run) | other(run)]);
    playRunCard(run, 0);
    const card = run.game.hand[0]!; const preview = previewRunCard(run, card)!;
    const real = playRunCard(run, 0);
    expect(preview.damage).toBe(real.damage); expect(preview.guard).toBe(real.guard);
  });

  it('saves round-trip and old saves without toughness get full toughness', () => {
    const run = createRun(21); run.monster.toughness = 1; deal(run, [bit(run)]); playRunCard(run, 0);
    const back = decodeRunSave(encodeRunSave(run));
    expect(back.state?.monster.guardDown).toBe(true);
    const old = JSON.parse(encodeRunSave(createRun(22))!);
    for (const k of ['weak', 'toughness', 'maxToughness', 'guardDown']) delete old.state.monster[k];
    const loaded = decodeRunSave(JSON.stringify(old));
    expect(loaded.reason).toBe('ok');
    expect(loaded.state?.monster.toughness).toBe(RUN.fights[0]!.toughness);
  });

  it('formats full numbers with separators', () => {
    expect(formatFull(0)).toBe('0'); expect(formatFull(1234)).toBe('1,234');
    expect(formatFull(1500000)).toBe('1,500,000'); expect(formatFull(987654321098)).toBe('987,654,321,098');
    expect(formatFull(-12345.6)).toBe('-12,346'); expect(formatFull(2e12)).toBe('2兆');
  });
});
