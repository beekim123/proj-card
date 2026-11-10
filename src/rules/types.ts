import type { RelicId } from './run-types';
export type RandomSource = () => number;
/** Callable like the original RNG, with explicit state for save/restore. */
export interface StatefulRandomSource extends RandomSource {
  getState(): number;
  setState(state: number): void;
}
export interface RandomState { rngState: number }
export type GemIndex = 0 | 1 | 2;
export type GemForm = 0 | 1 | 2;
export type GemValues = [number, number, number];
export type Reaction = 'plain' | 'same' | 'shun' | 'white';
export type ToolType = 'bag' | 'lens' | 'hammer' | 'mirror' | 'stone' | 'hourglass' | 'seal' | 'shadow' | 'whistle';
export type HandLimit = 6 | 7 | 8;

export interface Card {
  /** Stable identity. Base cards have IDs 1–30; acquired tools get new IDs. */
  id: number;
  /** Red = 1, green = 2, blue = 4. Mirrors use their resolved mask on the row. */
  v: number;
  type?: ToolType;
}

export interface GameOptions {
  hint: boolean;
  hand: HandLimit;
  grow: boolean;
  /** Practice: include one of each extra card. Changing this restarts the game. */
  tools?: boolean;
}

export interface RowEntry extends Card {
  k: Reaction;
  cm: number;
  b: number;
  /** Multiplier before this card. */
  m: number;
  /** Multiplier after this card, including the lens effect. */
  m2: number;
  /** Card damage, excluding separately recorded rainbow/hammer bonuses. */
  dmg: number;
  rainbow: number;
  hammer: number;
  /** Triggered effects, in settlement order. */
  effects: { id: string; text: string }[];
  /** All damage added by this play: dmg + rainbow + hammer. */
  damage: number;
  /** Values at the time of damage calculation, before growth. */
  gemValues: GemValues;
  /** Gem indices that increased effective form after this card, including stone. */
  grown: number[];
  /** This card belonged to the chain when the rainbow was triggered. */
  rb: boolean;
}

export interface GameSnapshot extends RandomState {
  relic?: RelicId;
  relics?: RelicId[];
  onceUsed: boolean;
  deck: Card[];
  discard: Card[];
  hand: Card[];
  row: RowEntry[];
  m: number;
  turnDmg: number;
  total: number;
  turn: number;
  best: number;
  last: number;
  /** Unique chromatic masks in the current consecutive shun chain. */
  chain: number[];
  /** Every row index in that chain, including white and empty cards. */
  chainIdx: number[];
  rainbow: boolean;
  xp: GemValues;
  opts: GameOptions;
}

/** Plain JSON-compatible state. Snapshots intentionally do not contain history. */
export interface GameState extends GameSnapshot {
  hist: GameSnapshot[];
}
