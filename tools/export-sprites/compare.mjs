import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const root = process.cwd();
const source = JSON.parse(fs.readFileSync(path.join(root, 'h5/public/sprites/sprites.json'), 'utf8'));
const current = JSON.parse(fs.readFileSync(path.join(root, 'art/sprites/sprites.json'), 'utf8'));
const differences = [];
let actions = 0, frames = 0, matrices = 0, pngIdentical = 0, pngDifferent = 0;
for (const [name, entry] of Object.entries(source.assets)) {
  const after = current.assets[name];
  if (!after) { differences.push(`${name}: missing`); continue; }
  for (const field of ['hash', 'w', 'h', 'scale', 'stillScale']) if (entry[field] !== after[field]) differences.push(`${name}.${field}`);
  for (const [event, action] of Object.entries(entry.actions)) {
    actions++;
    const actual = after.actions[event];
    if (!actual || action.frames.length !== actual.frames.length) { differences.push(`${name}.${event}.frames.length`); continue; }
    for (const field of ['loop', 'hold']) if (action[field] !== actual[field]) differences.push(`${name}.${event}.${field}`);
    action.frames.forEach((frame, index) => {
      frames++;
      for (const field of ['s', 'x', 'y', 'w', 'h', 'ox', 'oy']) if (frame[field] !== actual.frames[index][field]) differences.push(`${name}.${event}[${index}].${field}`);
      if (frame.d !== actual.frames[index].d) differences.push(`${name}.${event}[${index}].d`);
      if (JSON.stringify(frame.m ?? {}) !== JSON.stringify(actual.frames[index].m ?? {})) differences.push(`${name}.${event}[${index}].m`);
      matrices += Object.keys(frame.m ?? {}).length;
    });
  }
  for (const f of [entry.still, ...entry.sheets.map(s => s.f)]) {
    const before = fs.readFileSync(path.join(root, 'h5/public/sprites', f));
    const afterBytes = fs.readFileSync(path.join(root, 'art/sprites', f));
    if (crypto.createHash('sha256').update(before).digest('hex') === crypto.createHash('sha256').update(afterBytes).digest('hex')) pngIdentical++; else pngDifferent++;
  }
}
const report = { baseline_sets: Object.keys(source.assets).length, current_sets: Object.keys(current.assets).length, compared_actions: actions, compared_frames: frames, compared_slot_matrices: matrices, png_bytes_identical: pngIdentical, png_bytes_different: pngDifferent, differences, passed: differences.length === 0, note: 'Original 82 delivered SVG / 138 tint sets compared before adding seven H5 generatePlaceholder fallback assets. PNG pixel differences are permitted; byte hashes reported separately.' };
fs.mkdirSync(path.join(root, 'artifacts/art'), { recursive: true });
fs.writeFileSync(path.join(root, 'artifacts/art/sprite-comparison.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
if (differences.length) process.exitCode = 1;
