/** Offline fallback: executes first-batch Vitest-format tests with node:assert.
 * This is not a replacement for npm test; only implements matchers these files use. */
import { registerHooks } from 'node:module';
const shim = new URL('./batch-one-assert.mjs', import.meta.url).href;
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'vitest') return {url:shim,shortCircuit:true};
  if(specifier.startsWith('.')&&!/\.[a-z]+$/i.test(specifier)){try{return next(specifier+'.ts',context);}catch{}}
  return next(specifier,context);
}});
const tests=[]; globalThis.__batchTests=tests;
for(const name of ['cards','run','save']) await import(new URL(`../src/rules/batch-one-${name}.test.ts`,import.meta.url));
let failed=0;
for(const {name,fn} of tests){try{await fn();process.stdout.write(`PASS ${name}\n`);}catch(e){failed++;process.stdout.write(`FAIL ${name}\n${e.stack}\n`);}}
console.log(`Offline Node assertion runner: ${tests.length-failed}/${tests.length} passed, ${failed} failed, 0 skipped. (Not Vitest.)`);
process.exitCode=failed?1:0;
