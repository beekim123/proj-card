import { SoundSystem } from '/sound.js';
const post = (url, body) => fetch(url, { method: 'POST', body });
const sampleRate = 48000;
function wav(buffer) {
  const data = [buffer.getChannelData(0), buffer.getChannelData(1)];
  let last = buffer.length - 1;
  while (last > 0 && Math.abs(data[0][last]) < 0.00001 && Math.abs(data[1][last]) < 0.00001) last--;
  const frames = Math.min(buffer.length, last + Math.ceil(sampleRate * .025));
  const bytes = new ArrayBuffer(44 + frames * 4);
  const view = new DataView(bytes);
  const text = (offset, value) => [...value].forEach((ch, index) => view.setUint8(offset + index, ch.charCodeAt(0)));
  text(0, 'RIFF'); view.setUint32(4, bytes.byteLength - 8, true); text(8, 'WAVE'); text(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 2, true); view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 4, true); view.setUint16(32, 4, true); view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, frames * 4, true);
  for (let i = 0; i < frames; i++) for (let channel = 0; channel < 2; channel++) {
    const value = Math.max(-1, Math.min(1, data[channel][i]));
    view.setInt16(44 + (i * 2 + channel) * 2, Math.round(value * (value < 0 ? 32768 : 32767)), true);
  }
  return { bytes, frames };
}
try {
  const recordings = [];
  for (const [index, job] of window.JOBS.entries()) {
    const context = new OfflineAudioContext(2, Math.ceil(sampleRate * 1.8), sampleRate);
    // unlock() builds the original master/compressor graph unchanged.
    globalThis.AudioContext = function () { return context; };
    const sound = new SoundSystem({ sound: true, volume: job.volume });
    sound.unlock();
    sound[job.method](...job.args);
    const rendered = await context.startRendering();
    const encoded = wav(rendered);
    const file = `${job.name}_v${job.volume}.wav`;
    await post(`/wav?file=${encodeURIComponent(file)}`, encoded.bytes);
    recordings.push({ name: job.name, file, volume: job.volume, frames: encoded.frames, duration_ms: encoded.frames / sampleRate * 1000 });
    if ((index + 1) % 20 === 0) await post('/log', `录音 ${index + 1}/${window.JOBS.length}`);
  }
  await post('/done', JSON.stringify(recordings));
} catch (error) { await post('/fail', String(error?.stack ?? error)); }
