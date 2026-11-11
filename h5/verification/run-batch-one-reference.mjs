import { runPar } from '../../../参考/模拟/并行.mjs';
import { BATCH1,PICK_RANDOM,PICK_SMART } from '../../../参考/模拟/内容表.mjs';
import { writeFileSync } from 'node:fs';
const result={};
for(const [label,bot,policy,n] of [['hintRandom','hint',PICK_RANDOM,300],['planSmart','plan',PICK_SMART,100]]) {
 const t=Date.now();result[label]=await runPar({...BATCH1,bot,policy},n);result[label].elapsedMs=Date.now()-t;console.log(label,JSON.stringify(result[label]));
 writeFileSync(new URL('./batch-one-reference-results.json',import.meta.url),JSON.stringify(result,null,2));
}
