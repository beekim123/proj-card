import {CREATURES,adaptCreature} from './creature-catalog.js';
import colors from '../../art/monster/剪影强光-颜色表.json' with {type: 'json'};

// Legacy shared table for older monsters (veko, reya, oru): preserve each tone in all four slots.
const sharedPalette = Object.fromEntries(Object.entries(colors)
  .filter(([, tone]) => /^#[0-9a-f]{6}$/i.test(tone))
  .map(([name, tone]) => [name, [tone, tone, tone, tone]]));

const DEFAULT_RARITY = '普通';

function extractPaletteTable(raw) {
  if (!raw || typeof raw !== 'object') return null;
  // Support variant-keyed tables (e.g. {"普通": {key: [4 tones]}, "示例2": ...})
  const first = Object.values(raw)[0];
  if (first && typeof first === 'object' && !Array.isArray(first)) return raw;
  return { [DEFAULT_RARITY]: raw };
}

async function loadCreaturePalette(file) {
  const {default: raw} = await import(`../../art/monster/${file}/颜色表.json`, {with: {type: 'json'}});
  return extractPaletteTable(raw);
}

async function attachP5(canvas) {
  if (document.readyState !== 'complete') {
    await new Promise(resolve => window.addEventListener('load', resolve, {once: true}));
  }
  return new window.p5(p => {
    p.noLoop();
    p.pixelDensity(1);
    // p5 1.7 calls createCanvas before setup. Redirect that call to the existing canvas.
    p.createCanvas = () => {
      delete p.createCanvas;
      const transform = canvas.getContext('2d').getTransform();
      const {width, height} = canvas.style;
      const renderer = p.createCanvas(canvas.width, canvas.height, canvas);
      canvas.style.width = width;
      canvas.style.height = height;
      renderer.drawingContext.setTransform(transform);
      return renderer;
    };
  });
}

export async function createMonsterRuntime(canvas, ids = Object.keys(CREATURES)) {
  // Electron discovers physical source directories; elite is a virtual alias for badom.
  const resolved = new Set(ids);
  if (resolved.has('badom')) resolved.add('elite');
  const paletteTables = new Map();
  const modules = new Map(await Promise.all([...resolved].map(async id => {
    if (!Object.hasOwn(CREATURES,id)) throw Error('未知怪物 · ' + id);
    const entry = CREATURES[id];
    const file = entry.source;
    const [{default: art}, table] = await Promise.all([
      import(`../../art/monster/${file}/${file}.js`),
      entry.ownPalette ? loadCreaturePalette(file) : Promise.resolve(null),
    ]);
    if (table) paletteTables.set(id, table);
    return [id, adaptCreature(id, art)];
  })));
  function resolvePalette(id, rarity = DEFAULT_RARITY) {
    const table = paletteTables.get(id);
    if (!table) return sharedPalette;
    return table[rarity] ?? table[DEFAULT_RARITY] ?? Object.values(table)[0] ?? sharedPalette;
  }
  const p = await attachP5(canvas);
  const ctx = p.drawingContext;
  let sample = false, frameMs = 0, drawn = 0;

  function beginDraw() {
    // Renderer2D saves the native context and p5 style state together.
    p.push();
    // World rendering changes the native context directly, including cached p5 colors.
    p._renderer._applyDefaults();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineWidth = 1;
    ctx.lineJoin = 'miter';
  }

  return {
    module: id => modules.get(id),
    paletteOf: (id, rarity = DEFAULT_RARITY) => resolvePalette(id, rarity),
    raritiesOf: id => Object.keys(paletteTables.get(id) ?? {}),
    get p5() { return p; },
    get palette() { return sharedPalette; },
    get frameMs() { return frameMs; },
    get drawn() { return drawn; },
    beginFrame(collect, width, height) {
      sample = collect;
      frameMs = drawn = 0;
      if (width === undefined) return;
      p.width = p._renderer.width = width;
      p.height = p._renderer.height = height;
      p._pixelDensity = canvas.width / width;
    },
    create(id, {seed, elite = false, rarity = DEFAULT_RARITY, palette: override} = {}) {
      const module = modules.get(id);
      if (!module) return;
      const state = module.create(p, {palette: override ?? resolvePalette(id, rarity), seed, elite});
      return {
        module,
        trigger: (event, data) => module.trigger(state, event, data),
        done: () => module.done(state),
        update(dt) {
          const before = sample ? performance.now() : 0;
          module.update(state, dt, p);
          if (sample) frameMs += performance.now() - before;
        },
        draw(x, y, pixelsPerCm) {
          const before = sample ? performance.now() : 0;
          beginDraw();
          try {
            p.translate(x, y);
            p.scale(pixelsPerCm);
            module.draw(p, state);
          } finally {
            p.pop();
          }
          drawn++;
          if (sample) frameMs += performance.now() - before;
        },
        drawScreen(width, height) {
          if (!module.drawScreen) return;
          const before = sample ? performance.now() : 0;
          beginDraw();
          try {
            module.drawScreen(p, state, width, height);
          } finally {
            p.pop();
          }
          if (sample) frameMs += performance.now() - before;
        }
      };
    }
  };
}
