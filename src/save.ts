import { cloneRun, createRecords, updateRecords } from './rules/run';
import { decodeRunSave, encodeRunSave, type RunLoadResult } from './rules/save-state';
import type { RunRecords, RunState } from './rules/run-types';
import type { LayoutName } from './layout/types';

/** Browser persistence stays outside the portable rules engine. */
export const SAVE_KEYS = {
  run: 'gemcard.run', records: 'gemcard.records', settings: 'gemcard.settings',
} as const;
export type LayoutChoice = 'auto' | LayoutName;
export interface Settings {
  hint: boolean;
  hand: 6 | 7 | 8;
  grow: boolean;
  tools: boolean;
  layout: LayoutChoice;
  /** 伤害面板里的算式展开着吗（默认收起） */
  formula: boolean;
  sound: boolean;
  volume: 1 | 2 | 3;
  shake: boolean;
  animationSpeed: 'normal' | 'fast';
}
export const DEFAULT_SETTINGS: Readonly<Settings> = {
  hint: true, hand: 6, grow: true, tools: false, layout: 'auto', formula: false,
  sound: true, volume: 2, shake: true, animationSpeed: 'normal',
};
export type SaveStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export type RunReadResult = RunLoadResult & { error?: string };
// Object ownership prevents a delayed settlement from retiring a newer adventure.
type SavedRunIdentity = { raw: string; generation: symbol };
const savedRuns = new WeakMap<RunState, SavedRunIdentity>();
const storageRuns = new WeakMap<SaveStorage, SavedRunIdentity>();
function rememberSave(run: RunState, raw: string, storage: SaveStorage, loaded = false): void {
  const current = storageRuns.get(storage);
  const generation = savedRuns.get(run)?.generation
    ?? (loaded && current?.raw === raw ? current.generation : Symbol('adventure'));
  const identity = { raw, generation };
  savedRuns.set(run, identity); storageRuns.set(storage, identity);
}

const UNAVAILABLE = '浏览器未允许保存进度，本次游戏仍可继续';
const FAILED_CLEAR = '上次的进度读不出来，但浏览器未允许清除存档';
const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const storageOf = (storage?: SaveStorage): SaveStorage => storage ?? globalThis.localStorage;

function parse(raw: string | null): unknown {
  try { return raw === null ? null : JSON.parse(raw); } catch { return null; }
}
function settingsOf(value: unknown): Settings {
  const saved = object(value) ? value : {};
  return {
    hint: typeof saved.hint === 'boolean' ? saved.hint : DEFAULT_SETTINGS.hint,
    hand: saved.hand === 6 || saved.hand === 7 || saved.hand === 8 ? saved.hand : DEFAULT_SETTINGS.hand,
    grow: typeof saved.grow === 'boolean' ? saved.grow : DEFAULT_SETTINGS.grow,
    tools: typeof saved.tools === 'boolean' ? saved.tools : DEFAULT_SETTINGS.tools,
    layout: saved.layout === 'portrait' || saved.layout === 'landscape' ? saved.layout : 'auto',
    formula: typeof saved.formula === 'boolean' ? saved.formula : DEFAULT_SETTINGS.formula,
    sound: typeof saved.sound === 'boolean' ? saved.sound : DEFAULT_SETTINGS.sound,
    volume: saved.volume === 1 || saved.volume === 2 || saved.volume === 3 ? saved.volume : DEFAULT_SETTINGS.volume,
    shake: typeof saved.shake === 'boolean' ? saved.shake : DEFAULT_SETTINGS.shake,
    animationSpeed: saved.animationSpeed === 'fast' ? 'fast' : DEFAULT_SETTINGS.animationSpeed,
  };
}
function isRecords(value: unknown): value is RunRecords {
  if (!object(value)) return false;
  for (const key of ['played', 'wins', 'farthest'] as const) {
    if (!Number.isSafeInteger(value[key]) || (value[key] as number) < 0) return false;
  }
  for (const key of ['bestTurn', 'maxOverkill'] as const) {
    if (typeof value[key] !== 'number' || !Number.isFinite(value[key]) || value[key] < 0) return false;
  }
  return (value.wins as number) <= (value.played as number) && (value.farthest as number) <= 7;
}
function copyRecords(records: RunRecords): RunRecords {
  return { played: records.played, wins: records.wins, farthest: records.farthest, bestTurn: records.bestTurn, maxOverkill: records.maxOverkill };
}
interface RecordsEnvelope { records: RunRecords; clearedRun: string | null }
function readRecords(storage: SaveStorage): RecordsEnvelope {
  const value = parse(storage.getItem(SAVE_KEYS.records));
  return {
    records: isRecords(value) ? copyRecords(value) : createRecords(),
    // A settlement receipt shares the records key. If removing the active save
    // fails or the page closes between writes, the completed run cannot resume.
    clearedRun: object(value) && isRecords(value) && typeof value.clearedRun === 'string' ? value.clearedRun : null,
  };
}
function writeRecords(storage: SaveStorage, records: RunRecords, clearedRun: string | null): void {
  if (!isRecords(records)) throw new TypeError('纪录无效');
  storage.setItem(SAVE_KEYS.records, JSON.stringify({ ...copyRecords(records), ...(clearedRun === null ? {} : { clearedRun }) }));
}

export function loadSettings(storage?: SaveStorage): Settings {
  try { return settingsOf(parse(storageOf(storage).getItem(SAVE_KEYS.settings))); }
  catch { return { ...DEFAULT_SETTINGS }; }
}
export function saveSettings(settings: Settings, storage?: SaveStorage): boolean {
  try { storageOf(storage).setItem(SAVE_KEYS.settings, JSON.stringify(settingsOf(settings))); return true; }
  catch { return false; }
}
export function loadRecords(storage?: SaveStorage): RunRecords {
  try { return readRecords(storageOf(storage)).records; }
  catch { return createRecords(); }
}
export function saveRecords(records: RunRecords, storage?: SaveStorage): boolean {
  try {
    const target = storageOf(storage);
    writeRecords(target, records, readRecords(target).clearedRun);
    return true;
  } catch { return false; }
}
export function clearRun(storage?: SaveStorage): boolean {
  try { storageOf(storage).removeItem(SAVE_KEYS.run); return true; }
  catch { return false; }
}
export function loadRun(storage?: SaveStorage): RunReadResult {
  try {
    const target = storageOf(storage);
    const raw = target.getItem(SAVE_KEYS.run);
    if (raw !== null && raw === readRecords(target).clearedRun) {
      // Successful settlement is authoritative even if a stale run could not be removed.
      clearRun(target);
      return { state: null, clear: false, reason: 'empty' };
    }
    const result = decodeRunSave(raw);
    if (result.state && raw !== null) rememberSave(result.state, raw, target, true);
    if (result.clear && !clearRun(target)) return { ...result, error: FAILED_CLEAR };
    return result;
  } catch { return { state: null, clear: false, reason: 'empty', error: UNAVAILABLE }; }
}
export function saveRun(run: RunState, storage?: SaveStorage): boolean {
  try {
    const target = storageOf(storage);
    const raw = encodeRunSave(run);
    if (raw === null) return clearRun(target);
    // An identical deterministic new run is still a new save. Retire a receipt
    // only when its old run is absent, never before overwriting an uncleared save.
    const envelope = readRecords(target);
    if (envelope.clearedRun === raw) {
      if (!clearRun(target)) return false;
      writeRecords(target, envelope.records, null);
    }
    target.setItem(SAVE_KEYS.run, raw);
    rememberSave(run, raw, target);
    return true;
  } catch { return false; }
}

/**
 * Apply records once, persist them, then retire the active run. A failed records
 * write leaves caller objects untouched so retrying does not lose or double-count
 * settlement. The receipt makes the two localStorage keys safe across refresh.
 */
export function recordResult(run: RunState, records: RunRecords, storage?: SaveStorage): boolean {
  if (!run.result) return false;
  if (run.result.recordsApplied) return true;
  try {
    const target = storageOf(storage);
    const raw = target.getItem(SAVE_KEYS.run);
    const envelope = readRecords(target);
    if (raw !== null && raw === envelope.clearedRun) {
      Object.assign(records, envelope.records);
      run.result.recordsApplied = true;
      clearRun(target);
      return true;
    }
    const nextRun = cloneRun(run);
    const nextRecords = copyRecords(records);
    updateRecords(nextRecords, nextRun);
    const identity = savedRuns.get(run);
    const current = storageRuns.get(target);
    const ownsSave = raw !== null && identity?.raw === raw
      && (!current || identity.generation === current.generation);
    writeRecords(target, nextRecords, ownsSave ? raw : envelope.clearedRun);
    Object.assign(records, nextRecords);
    Object.assign(run.result, nextRun.result!);
    if (ownsSave) clearRun(target);
    return true;
  } catch { return false; }
}
