// 把一组"配置 + 局数"分给几个进程一起跑。配置必须是普通数据。
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { cpus } from 'node:os';
import { runSeeds, summarize } from './本体.mjs';

if (!isMainThread) {
  const { V, seeds } = workerData;
  parentPort.postMessage(runSeeds(V, seeds));
}

/** 跑 N 局，返回汇总。seed 和 sim.mjs 一样：1 + i × 7919。 */
export function runPar(V, N, { seed0 = 1, workers = Math.min(4, cpus().length), raw = false } = {}) {
  const seeds = []; for (let s = 0; s < N; s++) seeds.push(seed0 + s * 7919);
  const chunks = Array.from({ length: workers }, () => []);
  seeds.forEach((s, i) => chunks[i % workers].push(s));
  return Promise.all(chunks.filter(c => c.length).map(c => new Promise((res, rej) => {
    const w = new Worker(new URL(import.meta.url), { workerData: { V, seeds: c } });
    w.once('message', res); w.once('error', rej);
  }))).then(parts => { const rs = parts.flat(); return raw ? rs : summarize(rs, V); });
}
