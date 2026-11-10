/** Presentation-only interpolation; caller captures the value currently painted on screen. */
export function scoreAt(from: number, to: number, elapsed: number, duration = 300): number {
  const start = Number.isFinite(from) ? Math.max(0, from) : 0;
  const end = Number.isFinite(to) ? Math.max(0, to) : 0;
  const progress = Math.max(0, Math.min(1, elapsed / Math.max(1, duration)));
  return Math.max(0, Math.round(start + (end - start) * (1 - (1 - progress) ** 3)));
}
