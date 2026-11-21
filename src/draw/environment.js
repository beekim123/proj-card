import { ENV_SPRITES } from '../../art/env/manifest.js';

export const sprites = {};
const categories = [...new Set(Object.keys(ENV_SPRITES).map(id => id.slice(0, id.lastIndexOf('_'))))];
const profile = Object.fromEntries(categories.map(type => [type, {
  frameTimes: [], visibleFrames: 0, minW: Infinity, maxW: 0, minH: Infinity, maxH: 0
}]));
let sample = null;

export async function loadEnvironment(ctx) {
  let imageCount = 0;
  let rgbaBytes = 0;
  for (const [id, frame] of Object.entries(ENV_SPRITES)) {
    const layers = [];
    for (const layer of frame.layers) {
      const image = new Image();
      image.src = new URL('../../art/env/png/' + layer.file, import.meta.url).href;
      await image.decode();
      ctx.drawImage(image, (imageCount % 16) * 4, Math.floor(imageCount / 16) * 4, 4, 4);
      imageCount++;
      rgbaBytes += image.naturalWidth * image.naturalHeight * 4;
      if (layer.rect[2] && layer.rect[3]) layers.push({...layer, image});
    }
    sprites[id] = {...frame, layers};
  }
  return {imageCount, rgbaBytes};
}

export function beginEnvSample() {
  sample = Object.fromEntries(categories.map(type => [type, {ms:0, count:0}]));
}
export function sampleStart() { return sample ? performance.now() : 0; }
export function sampleEnd(type, start, w, h) {
  if (!sample) return;
  sample[type].ms += performance.now() - start;
  sample[type].count++;
  const p = profile[type];
  p.minW = Math.min(p.minW, w); p.maxW = Math.max(p.maxW, w);
  p.minH = Math.min(p.minH, h); p.maxH = Math.max(p.maxH, h);
}
export function endEnvSample() {
  for (const type of categories) {
    profile[type].frameTimes.push(sample[type].ms);
    if (sample[type].count) profile[type].visibleFrames++;
  }
  sample = null;
}
export function envProfile() {
  const result = {};
  for (const [type, p] of Object.entries(profile)) {
    const times = [...p.frameTimes].sort((a,b) => a-b);
    const sum = times.reduce((a,b) => a+b, 0);
    result[type] = {
      samples: times.length, visibleFrames: p.visibleFrames,
      meanMs: times.length ? sum / times.length : null,
      p50Ms: times.length ? times[Math.floor(times.length / 2)] : null,
      minW: p.visibleFrames ? p.minW : null, maxW: p.visibleFrames ? p.maxW : null,
      minH: p.visibleFrames ? p.minH : null, maxH: p.visibleFrames ? p.maxH : null
    };
  }
  return result;
}

// Source rects are normalized to the original artboard, including its transparent margins.
export function blit(ctx, layer, left, top, w, h) {
  const [x, y, width, height] = layer.rect;
  ctx.drawImage(layer.image, left + x*w, top + y*h, width*w, height*h);
}
