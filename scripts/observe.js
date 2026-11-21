// Opt-in, detached snapshots only. No state setters or shortcuts.
import {worldView} from '../src/game.js';
import { autoCardIndex } from '../src/dev/auto-line.js';
export function snapshot(g, zones, w, h) {
  return {
    phase: g.phase,
    t: g.phaseTime,
    time: g.elapsed,
    fight: g.fight,
    turn: g.b?.turn,
    hearts: g.hearts,
    seed: g.seed,
    deck: g.run.deck.length,
    locked: g.locked,
    can: g.canPickup,
    distance: g.distance,
    x: g.world.x,
    z: g.world.z,
    yaw: g.world.yaw,
    pitch: g.world.pitch,
    loot: g.loot && { ...g.loot },
    line: g.b?.line.length,
    handIds:g.b?.hand.map(c=>g.run.deck.indexOf(c)),lineIds:g.b?.line.map(c=>g.run.deck.indexOf(c)),
    selected:g.b?.target,hovered:g.hoveredMonster,ring:worldView(g).circle,
    drag:g.cardDrag?.returning?'returning':g.cardDrag?.moving?'moving':g.cardDrag?'held':null,
    hand: g.b?.hand.map((c) => c.name),
    best: g.phase === 'battle' ? autoCardIndex(g.b) : -1,
    mons: g.b?.monsters.map((m) => [m.kind, m.hp, m.countdown]),
    choices: g.choices.map((c) => c.id),
    reason: g.reason,
    shots: g.shots.length,
    wet: g.wet ?? false,
    zones: zones.map(({ action, arg, x, y, w: rw, h: rh }) => ({
      action,
      arg,
      x: (x + rw / 2) / w,
      y: (y + rh / 2) / h,
    })),
  };
}
