export type GemColor = 'red' | 'green' | 'blue';
export type GemForm = 'rough' | 'cut' | 'shine';
export type Point = [number, number];

export interface ArtDefinition {
  id: string;
  phase?: number;
  v2?: '第1批' | '第2批';
  batch?: '本体第1批' | '本体第2批';
  group: string;
  viewBox: string;
  load: 'img' | 'inline';
  desc: string;
  status?: '已有' | '返修' | '重画' | '新画';
  idle?: boolean;
  stay?: string[];
  slots?: Record<string, [number, number, number]>;
  hitPoint?: Point;
  monster?: 'normal' | 'boss';
  inner?: [number, number, number, number];
  events?: Record<string, number>;
  tint?: boolean;
  nineSlice?: [number, number, number, number];
  anchor?: Point;
  parts?: string[];
}

export interface Palette {
  ink: string;
  text: string;
  textDim: string;
  accent: string;
  accentDark: string;
  pageBg: string;
  panelBg: string;
  barTrack: string;
  barFill: string;
  hpFill: string;
  hpChip: string;
  gem: Record<GemColor, { name: string; bit: number; shape: string; mid: string }>;
  mix: Record<string, string | null>;
}

export interface TextPosition {
  x: number;
  y: number;
  size: number;
  minSize?: number;
  maxWidth?: number;
  weight?: number;
  align: 'left' | 'right';
  color: 'text' | 'textDim' | 'accent';
}

export interface CardLayout {
  size: Point;
  artWindow: { x: number; y: number; w: number; h: number; r: number };
  glow: { cx: number; cy: number; r: number; opacity: number };
  gems: {
    '1': [number, number, number][];
    '2': [number, number, number][];
    '3': Record<GemColor, [number, number, number]>;
  };
  gemBar: { x: number; y: number; w: number; h: number; sockets: Record<GemColor, Point>; iconSize: number };
  corner: Record<GemColor, Point> & { iconSize: number };
  text: { name: TextPosition; value: TextPosition; line: TextPosition & { minSize: number; maxWidth: number } };
}

export interface ArtManifest {
  name: string;
  codename: string;
  version: number;
  date: string;
  palette: Palette;
  cardLayout: CardLayout;
  assets: ArtDefinition[];
}

export interface LoadedAsset {
  definition: ArtDefinition;
  source: 'art' | 'placeholder';
  svg: string;
  url: string;
  /** Separate URL with CSS animation disabled for assets declaring idle. */
  staticUrl?: string;
  error?: string;
}

export function dimensions(definition: Pick<ArtDefinition, 'viewBox'>): Point {
  const values = definition.viewBox.trim().split(/[\s,]+/).map(Number);
  if (values.length !== 4 || values.some(value => !Number.isFinite(value)) || values[2] <= 0 || values[3] <= 0) {
    throw new Error(`无效的 viewBox：${definition.viewBox}`);
  }
  return [values[2], values[3]];
}
