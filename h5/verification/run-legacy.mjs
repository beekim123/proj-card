import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,n){if(s==='vitest')return{url:new URL('./legacy-assert.mjs', import.meta.url).href,shortCircuit:true};if(s.startsWith('.')&&!/\.[a-z]+$/i.test(s)){try{return n(s+'.ts',c);}catch{}}return n(s,c);}});
globalThis.__batchTests=[];
for (const name of ['rules','extra-cards','run','run-invariants','integration','v2-rules','number-rounding']) await import(new URL(`../src/rules/${name}.test.ts`, import.meta.url));
let failed=0;for(const {name,fn}of globalThis.__batchTests){try{await fn();}catch(e){failed++;console.log('FAIL',name,e.stack);}}
console.log(`${globalThis.__batchTests.length-failed}/${globalThis.__batchTests.length} offline assertions passed; ${failed} failed. NOT Vitest.`);process.exitCode=failed?1:0;
