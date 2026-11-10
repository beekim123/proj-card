import { describe, expect, it, vi, afterEach } from 'vitest';
import { abandonRun, createRecords, createRun, chooseRelic, endRunTurn, playRunCard, chooseLoot, undoRun } from './rules/run';
import { encodeRunSave } from './rules/save-state';
import { clearRun, DEFAULT_SETTINGS, loadRecords, loadRun, loadSettings, recordResult, SAVE_KEYS, saveRecords, saveRun, saveSettings, type SaveStorage } from './save';

function battle(seed: number) {
  const run = createRun(seed);
  chooseRelic(run, 0);
  return run;
}

class MemoryStorage implements SaveStorage {
  data = new Map<string, string>();
  blocked = new Set<string>();
  getItem(key: string) { if (this.blocked.has('get')) throw new Error('denied'); return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { if (this.blocked.has('set')) throw new Error('quota'); this.data.set(key, value); }
  removeItem(key: string) { if (this.blocked.has('remove')) throw new Error('denied'); this.data.delete(key); }
}
afterEach(() => vi.unstubAllGlobals());

describe('settings storage', () => {
  it('uses only the requested keys', () => { expect(SAVE_KEYS).toEqual({ run: 'gemcard.run', records: 'gemcard.records', settings: 'gemcard.settings' }); });
  it('returns fresh defaults for absent or broken settings', () => {
    const s = new MemoryStorage();
    for (const value of [null, '{', 'null', '[]', '123', '"settings"']) {
      if (value === null) s.data.clear(); else s.data.set(SAVE_KEYS.settings, value);
      expect(loadSettings(s)).toEqual(DEFAULT_SETTINGS);
    }
    const prefs = loadSettings(s); prefs.hint = false; expect(loadSettings(s).hint).toBe(true);
  });
  it('keeps old settings and adds the tools default', () => {
    const s = new MemoryStorage();
    s.data.set(SAVE_KEYS.settings, JSON.stringify({ hint: false, hand: 8, grow: false, layout: 'landscape' }));
    expect(loadSettings(s)).toEqual({ ...DEFAULT_SETTINGS, hint: false, hand: 8, grow: false, tools: false, layout: 'landscape', formula: false });
  });
  for (const hand of [6, 7, 8] as const) {
    it(`round-trips practice hand ${hand}, extra cards, and manual layout`, () => {
      const s = new MemoryStorage();
      const prefs = { ...DEFAULT_SETTINGS, hint: false, hand, grow: false, tools: true, layout: 'portrait' as const, formula: true };
      expect(saveSettings(prefs, s)).toBe(true); expect(loadSettings(s)).toEqual(prefs);
    });
  }
  it('sanitizes malformed fields independently', () => {
    const s = new MemoryStorage();
    s.data.set(SAVE_KEYS.settings, JSON.stringify({ hint: 0, hand: 9, grow: false, tools: 'false', layout: 'sideways' }));
    expect(loadSettings(s)).toEqual({ ...DEFAULT_SETTINGS, grow: false });
  });
});

describe('active adventure storage', () => {
  it('reports a missing save without clearing anything', () => {
    expect(loadRun(new MemoryStorage())).toEqual({ state: null, clear: false, reason: 'empty' });
  });
  for (const raw of ['bad JSON', '{}', 'null', '[]', '{"version":3,"state":{}}']) {
    it(`clears invalid save ${raw}`, () => {
      const s = new MemoryStorage(); s.data.set(SAVE_KEYS.run, raw);
      expect(loadRun(s)).toEqual({ state: null, clear: true, reason: 'invalid' });
      expect(s.getItem(SAVE_KEYS.run)).toBeNull();
    });
  }
  it('saves plays and both undo stacks exactly, preserving RNG', () => {
    const s = new MemoryStorage(), run = battle(123456);
    playRunCard(run, 0); playRunCard(run, 0);
    expect(saveRun(run, s)).toBe(true); expect(s.getItem(SAVE_KEYS.run)).toBe(encodeRunSave(run));
    const restored = loadRun(s).state!;
    expect(restored).toEqual(run); expect(restored).not.toBe(run);
    undoRun(restored); undoRun(run);
    expect(saveRun(restored, s)).toBe(true); expect(loadRun(s).state).toEqual(run);
    endRunTurn(restored); endRunTurn(run);
    expect(saveRun(restored, s)).toBe(true); expect(loadRun(s).state).toEqual(run);
  });
  it('keeps fixed loot choices and the exact next battle after choosing', () => {
    const s = new MemoryStorage(), run = battle(789);
    run.monster.hp = run.monster.turnStartHp = 1;
    while (!run.monster.broken && run.game.hand.length) playRunCard(run, 0);
    endRunTurn(run); expect(run.phase).toBe('loot');
    expect(saveRun(run, s)).toBe(true);
    const restored = loadRun(s).state!; expect(restored).toEqual(run);
    chooseLoot(run, 0); chooseLoot(restored, 0);
    expect(saveRun(restored, s)).toBe(true); expect(loadRun(s).state).toEqual(run);
  });
  it('rejects invalid state without replacing a valid save', () => {
    const s = new MemoryStorage(), run = battle(3); saveRun(run, s);
    const raw = s.getItem(SAVE_KEYS.run); run.hearts = 10;
    expect(saveRun(run, s)).toBe(false); expect(s.getItem(SAVE_KEYS.run)).toBe(raw);
  });
  it('clears terminal states and never serializes a result as an active run', () => {
    const s = new MemoryStorage(), run = battle(3); saveRun(run, s); abandonRun(run);
    expect(saveRun(run, s)).toBe(true); expect(loadRun(s).reason).toBe('empty');
  });
  it('reports when an invalid save cannot be deleted rather than claiming success', () => {
    const s = new MemoryStorage(); s.data.set(SAVE_KEYS.run, 'bad'); s.blocked.add('remove');
    expect(loadRun(s)).toMatchObject({ state: null, reason: 'invalid', error: expect.any(String) });
  });
});

describe('records and once-only settlement', () => {
  it('loads plain saved records and returns fresh defaults for invalid values', () => {
    const s = new MemoryStorage();
    const records = { played: 4, wins: 2, farthest: 7, bestTurn: 12345, maxOverkill: 85.5 };
    expect(saveRecords(records, s)).toBe(true); expect(loadRecords(s)).toEqual(records);
    for (const value of [null, [], {}, { ...records, wins: 8 }, { ...records, farthest: 9 }, { ...records, played: 1.5 }, { ...records, maxOverkill: -1 }]) {
      s.data.set(SAVE_KEYS.records, JSON.stringify(value)); expect(loadRecords(s)).toEqual(createRecords());
    }
  });
  it('persists loss, sets flags, removes the run, and does not count repeated callbacks', () => {
    const s = new MemoryStorage(), records = createRecords(), run = battle(1);
    saveRun(run, s); abandonRun(run);
    expect(recordResult(run, records, s)).toBe(true);
    expect(records.played).toBe(1); expect(run.result!.recordsApplied).toBe(true);
    expect(run.result!.newRecords.farthest).toBe(true);
    expect(loadRecords(s)).toEqual(records); expect(loadRun(s).state).toBeNull();
    expect(recordResult(run, records, s)).toBe(true); expect(loadRecords(s).played).toBe(1);
    expect([...s.data.keys()].every(key => Object.values(SAVE_KEYS).includes(key as typeof SAVE_KEYS[keyof typeof SAVE_KEYS]))).toBe(true);
  });
  it('does not settle active games', () => { expect(recordResult(battle(1), createRecords(), new MemoryStorage())).toBe(false); });
  it('leaves state and records untouched when the write fails and permits retry', () => {
    const s = new MemoryStorage(), records = createRecords(), run = battle(2);
    saveRun(run, s); abandonRun(run); const before = structuredClone(run);
    s.blocked.add('set'); expect(recordResult(run, records, s)).toBe(false);
    expect(run).toEqual(before); expect(records).toEqual(createRecords()); expect(loadRun(s).reason).toBe('ok');
    s.blocked.delete('set'); expect(recordResult(run, records, s)).toBe(true);
    expect(loadRecords(s).played).toBe(1); expect(run.result!.recordsApplied).toBe(true);
  });
  it('prevents resurrection after records persist but removing the run fails', () => {
    const s = new MemoryStorage(), records = createRecords(), run = battle(4);
    saveRun(run, s); abandonRun(run); const duplicate = structuredClone(run);
    s.blocked.add('remove'); expect(recordResult(run, records, s)).toBe(true);
    expect(s.getItem(SAVE_KEYS.run)).not.toBeNull();
    expect(loadRun(s)).toEqual({ state: null, clear: false, reason: 'empty' });
    expect(recordResult(duplicate, createRecords(), s)).toBe(true); expect(loadRecords(s).played).toBe(1);
    s.blocked.delete('remove'); expect(loadRun(s).state).toBeNull(); expect(s.getItem(SAVE_KEYS.run)).toBeNull();
  });

  it('retrying an older settlement never clears a newer active save', () => {
    const s = new MemoryStorage(), records = createRecords(), earlier = battle(11);
    saveRun(earlier, s); abandonRun(earlier); s.blocked.add('set');
    expect(recordResult(earlier, records, s)).toBe(false);
    s.blocked.delete('set'); const newer = battle(12); expect(saveRun(newer, s)).toBe(true);
    expect(recordResult(earlier, records, s)).toBe(true); expect(records.played).toBe(1);
    expect(loadRun(s).state).toEqual(newer);
    abandonRun(newer); expect(recordResult(newer, records, s)).toBe(true);
    expect(records.played).toBe(2); expect(loadRun(s).state).toBeNull();
  });
  it('keeps a newer identical seeded save when an immediate old abandon settles late', () => {
    const s = new MemoryStorage(), records = createRecords(), earlier = battle(123);
    saveRun(earlier, s); abandonRun(earlier); s.blocked.add('set');
    expect(recordResult(earlier, records, s)).toBe(false);
    s.blocked.delete('set'); const newer = battle(123); saveRun(newer, s);
    expect(recordResult(earlier, records, s)).toBe(true);
    expect(loadRun(s).state).toEqual(newer);
    abandonRun(newer); expect(recordResult(newer, records, s)).toBe(true);
    expect(records.played).toBe(2); expect(loadRun(s).state).toBeNull();
  });
  it('a loaded run owns its save through later settlement', () => {
    const s = new MemoryStorage(); saveRun(battle(99), s);
    const restored = loadRun(s).state!; abandonRun(restored);
    expect(recordResult(restored, createRecords(), s)).toBe(true);
    expect(loadRun(s).reason).toBe('empty');
  });
  it('allows a newly started deterministic run matching a settled initial save', () => {
    const s = new MemoryStorage(), run = battle(4), records = createRecords();
    saveRun(run, s); abandonRun(run); recordResult(run, records, s);
    const fresh = battle(4); expect(saveRun(fresh, s)).toBe(true); expect(loadRun(s).state).toEqual(fresh);
    abandonRun(fresh); expect(recordResult(fresh, records, s)).toBe(true); expect(records.played).toBe(2);
  });
});

describe('storage unavailability', () => {
  it('works with browser global storage when no test adapter is supplied', () => {
    const s = new MemoryStorage(); vi.stubGlobal('localStorage', s);
    expect(saveSettings({ ...DEFAULT_SETTINGS, hand: 7 })).toBe(true); expect(loadSettings().hand).toBe(7);
    expect(saveRun(battle(123))).toBe(true); expect(loadRun().reason).toBe('ok'); expect(clearRun()).toBe(true);
  });
  it('handles denied reads and writes without crashing the game', () => {
    const s = new MemoryStorage(); s.blocked = new Set(['get', 'set', 'remove']);
    expect(loadSettings(s)).toEqual(DEFAULT_SETTINGS); expect(loadRecords(s)).toEqual(createRecords());
    expect(loadRun(s)).toMatchObject({ state: null, error: expect.any(String) });
    expect(saveSettings({ ...DEFAULT_SETTINGS }, s)).toBe(false);
    expect(saveRecords(createRecords(), s)).toBe(false); expect(saveRun(battle(1), s)).toBe(false); expect(clearRun(s)).toBe(false);
  });
  it('handles an unavailable global Storage API', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS); expect(loadRecords()).toEqual(createRecords());
    expect(loadRun().error).toBeTruthy(); expect(saveRun(battle(1))).toBe(false);
  });
});


describe('v3 save upgrades and feel preferences', () => {
  it.each([0, 1, 2])('clears old version %i but preserves existing records', (version) => {
    const s = new MemoryStorage();
    const records = { played: 5, wins: 2, farthest: 7, bestTurn: 2000, maxOverkill: 12 };
    saveRecords(records, s);
    const recordBytes = s.getItem(SAVE_KEYS.records);
    s.setItem(SAVE_KEYS.run, JSON.stringify({ version, state: {} }));
    expect(loadRun(s)).toEqual({ state: null, clear: true, reason: 'outdated' });
    expect(s.getItem(SAVE_KEYS.run)).toBeNull();
    expect(s.getItem(SAVE_KEYS.records)).toBe(recordBytes);
    expect(loadRecords(s)).toEqual(records);
  });
  it('reports a failed old-save clear without claiming it was removed', () => {
    const s = new MemoryStorage();
    s.setItem(SAVE_KEYS.run, JSON.stringify({ version: 2, state: {} }));
    s.blocked.add('remove');
    expect(loadRun(s)).toMatchObject({ reason: 'outdated', error: expect.any(String) });
    expect(s.getItem(SAVE_KEYS.run)).not.toBeNull();
  });
  it('persists the initial relic selection without rerolling options', () => {
    const s = new MemoryStorage(), run = createRun(81);
    expect(run.phase).toBe('relic');
    expect(saveRun(run, s)).toBe(true);
    expect(JSON.parse(s.getItem(SAVE_KEYS.run)!).version).toBe(3);
    expect(loadRun(s).state).toEqual(run);
  });
  it.each([1, 2, 3] as const)('round-trips feel preferences at volume %i', (volume) => {
    const s = new MemoryStorage();
    const settings = { ...DEFAULT_SETTINGS, sound: false, volume, shake: false, animationSpeed: 'fast' as const };
    expect(saveSettings(settings, s)).toBe(true);
    expect(loadSettings(s)).toEqual(settings);
  });
  it('falls back independently for malformed feel preferences', () => {
    const s = new MemoryStorage();
    s.setItem(SAVE_KEYS.settings, JSON.stringify({ sound: 0, volume: 4, shake: 'no', animationSpeed: 'slow' }));
    expect(loadSettings(s)).toEqual(DEFAULT_SETTINGS);
  });
});
