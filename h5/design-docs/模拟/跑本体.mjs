// 跑《本体内容方案》里的那几张表。
//   node 跑本体.mjs 第一批      只有第一幕（第 1 批代码包的内容）
//   node 跑本体.mjs 三幕        整局三幕（基础档），带每只怪的数
//   node 跑本体.mjs 加码        加码 1–5
//   node 跑本体.mjs 核对        用第二版的 6 仗配置跑一遍，和 sim.mjs 对数
//   node 跑本体.mjs 全部
// 后面可以跟局数，比如：node 跑本体.mjs 三幕 300
//
// 打法两种是你要的：跟提示打、整手规划。中间加了一种"试 20 种排法"，代表打过几局的普通玩家。
// 拿法两种：乱拿（宝物、额外牌、门、工坊都随手选，只是缺心时看到回心的门就进）和会拿（照 内容表.mjs 里 EXPERT 的喜好挑）。
import { runPar } from './并行.mjs';
import { FULL, BATCH1, V2, V2_PLAN, TIERS, PICK_RANDOM, PICK_SMART } from './内容表.mjs';

const what = process.argv[2] || '第一批';
const N = +(process.argv[3] || 400);
const ROWS = [
  ['跟提示·乱拿', 'hint', PICK_RANDOM], ['跟提示·会拿', 'hint', PICK_SMART],
  ['试20种·乱拿', 'try20', PICK_RANDOM], ['试20种·会拿', 'try20', PICK_SMART],
  ['整手规划·乱拿', 'plan', PICK_RANDOM], ['整手规划·会拿', 'plan', PICK_SMART],
];
const cfg = (V, bot, policy) => bot === 'hint' ? { ...V, bot: 'hint', policy }
  : bot === 'plan' ? { ...V, bot: 'plan', policy }
    : { ...V, bot: 'try', tries: +bot.slice(3), policy };
const n = bot => bot === 'plan' ? Math.min(N, 200) : N;
const NAME = { chest: '宝箱怪', bear: '布偶熊', soldier: '发条兵', clock: '老座钟', dragon: '宝石龙', box: '弹簧盒', portrait: '画像', lock: '大挂锁', plant: '摇钱树', armor: '盔甲' };

async function table(title, V, rows = ROWS, { mon = false } = {}) {
  console.log(`\n== ${title} ==`);
  for (const [name, bot, policy] of rows) {
    const r = await runPar(cfg(V, bot, policy), n(bot));
    console.log(name.padEnd(10), '过每一幕', r.acts.map(x => (x + '%').padStart(6)).join(' '), ' 每局被打', r.hits.toFixed(2), ' 每幕被打', r.actHits.join('/'),
      ' 一局回合', r.turns, ' 出过彩虹的局', r.rbRuns + '%', ' 最后带的额外牌', r.toolsN);
    console.log('           每间平均回合', r.roomTurns.join(' '));
    if (mon) for (const [k, v] of Object.entries(r.byMon)) console.log('           第' + k[0] + '幕', (NAME[k.slice(1)] || k.slice(1)).padEnd(4, '　'), v);
  }
}

if (what === '核对' || what === '全部') {
  console.log('\n== 核对：第二版 6 仗（sim.mjs 的数：跟提示约 12%、被打约 3.8；规划约 93%、被打约 1.3）==');
  const a = await runPar(V2, 600), b = await runPar(V2_PLAN, 120);
  console.log('跟提示  ', '通关', a.win + '%', ' 每局被打', a.hits.toFixed(2));
  console.log('整手规划', '通关', b.win + '%', ' 每局被打', b.hits.toFixed(2));
}
if (what === '第一批' || what === '全部') {
  await table('第 1 批：只有第一幕', BATCH1, ROWS, { mon: true });
  console.log('\n== 第 1 批：调试用的血量倍数（跟提示·乱拿 / 试20种·会拿 / 整手规划·会拿 的通关率和被打）==');
  for (const k of [2, 3, 4]) {
    let o = ('血 ×' + k).padEnd(8);
    for (const [, bot, policy] of [ROWS[0], ROWS[3], ROWS[5]]) { const r = await runPar(cfg({ ...BATCH1, hpAll: k }, bot, policy), n(bot)); o += `  ${r.win}% / ${r.hits.toFixed(2)}`; }
    console.log(o);
  }
}
if (what === '三幕' || what === '全部') await table('整局三幕（基础档）', FULL, ROWS, { mon: true });
if (what === '加码' || what === '全部') {
  console.log('\n== 加码：血量倍数（每格是 过第一幕/过第二幕/通关，后面是每局被打）==');
  for (const k of TIERS) {
    let o = ('血 ×' + k).padEnd(8);
    for (const [name, bot, policy] of [ROWS[5], ['试100种·会拿', 'try100', PICK_SMART], ROWS[3]]) {
      const r = await runPar(cfg({ ...FULL, hpAll: k }, bot, policy), bot === 'plan' ? Math.min(N, 200) : Math.min(N, 300));
      o += `  ${name} ${r.acts.join('/')} 被打${r.hits.toFixed(2)}`;
    }
    console.log(o);
  }
}
