import {registerHooks} from 'node:module';
const shim=new URL('./assert-harness.mjs',import.meta.url).href;
registerHooks({resolve(specifier,context,next){if(specifier==='vitest')return {url:shim,shortCircuit:true};try{return next(specifier,context);}catch(e){if(specifier.startsWith('.'))return next(specifier+'.ts',context);throw e;}}});
