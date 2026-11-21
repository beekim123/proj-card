// Runtime catalog only. Artist modules stay untouched.
export const CREATURES = Object.freeze({
  tiko: { name: '提可', source: 'tiko', ownPalette: true },
  badom: { name: '巴多姆', source: 'badom', ownPalette: true },
  elite: { name: '大巴多姆', source: 'badom', elite: true, ownPalette: true },
  veko: { name: '维柯', source: 'veko' },
  reya: { name: '芮娅', source: 'reya' },
  oru: { name: '奥鲁', source: 'oru' },
});
export function adaptCreature(id, art) {
  const entry = CREATURES[id];
  if (!entry || art.id !== entry.source) throw Error('怪物模块 id 不匹配 · ' + id);
  if (entry.source !== 'badom') return art;
  const elite = !!entry.elite;
  const baseHeight = art.height || 240;
  const targetHeight = elite ? 310 : baseHeight;
  const scale = targetHeight / baseHeight;
  const b = art.bounds;
  const bounds = elite && b ? {
    left: Math.round(b.left * scale),
    right: Math.round(b.right * scale),
    top: Math.round(b.top * scale),
    bottom: Math.round(b.bottom * scale),
    originHeight: b.originHeight ?? 0,
  } : b;
  return {
    ...art,
    id,
    height: targetHeight,
    bounds,
    events: [...art.events],
    create: (p, opt) => art.create(p, { ...opt, elite }),
    update: (state, dt, p) => art.update(state, dt, p),
    trigger: (state, name, data) => art.trigger(state, name, data),
    draw: elite
      ? (p, state) => { p.push(); p.scale(scale); try { art.draw(p, state); } finally { p.pop(); } }
      : (p, state) => art.draw(p, state),
    drawScreen: art.drawScreen ? (p, state, w, h) => art.drawScreen(p, state, w, h) : undefined,
    done: state => art.done(state),
  };
}
