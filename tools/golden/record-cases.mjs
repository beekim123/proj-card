import { install } from './register.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { cases, runCases } from './test-api.mjs';
install({ recorder: true });
const source = path.resolve('h5/src/rules');
for (const file of fs.readdirSync(source).filter(f=>f.endsWith('.test.ts')).sort()) {
  globalThis.__oracleFile=file;
  await import(new URL('../../h5/src/rules/'+file, import.meta.url));
}
fs.mkdirSync('tests/oracle',{recursive:true});
const summary=[];
await runCases(c=>{
  const index=summary.length;
  const record={file:c.file,name:c.name,passed:c.passed,table:c.table,calls:c.calls,...(c.failure?{failure:c.failure}:{})};
  const file=`tests/oracle/${String(index).padStart(3,'0')}.json`;
  fs.writeFileSync(file,JSON.stringify(record));
  summary.push({file:c.file,name:c.name,path:file,passed:c.passed,calls:c.calls.length,failure:c.failure});
  if (!c.passed) console.error('H5 FAIL',c.file,c.name,c.failure);
  c.calls=[];c.table=[];
  if ((index+1)%25===0) console.log('H5 oracle cases',index+1,'/',cases.length);
});
fs.writeFileSync('tests/oracle-cases.json',JSON.stringify({version:1,cases:summary},null,2));
console.log(`H5 named cases: ${summary.filter(c=>c.passed).length}/${summary.length}; calls: ${summary.reduce((s,c)=>s+c.calls,0)}`);
if(summary.some(c=>!c.passed)) process.exitCode=1;
