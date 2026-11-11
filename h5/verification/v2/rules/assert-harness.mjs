// Supplemental execution of synchronous test sources with Node assertions.
// This is deliberately NOT Vitest and cannot certify npm test/typecheck/build.
import assert from 'node:assert/strict';
import { format, isDeepStrictEqual } from 'node:util';
let passed=0, failed=0; const suites=[], cleanup=[];
export const failures=[];
export function describe(name, fn){suites.push(name); try{fn();}finally{suites.pop();}}
function test(name,fn){try{fn();passed++;}catch(e){failed++; failures.push({name:[...suites,name].join(' / '),error:e.stack});}finally{for(const f of cleanup)f();}}
test.each=items=>(name,fn)=>items.forEach(item=>test(format(name,...(Array.isArray(item)?item:[item])),()=>fn(...(Array.isArray(item)?item:[item]))));
export {test as it};
export const afterEach=f=>cleanup.push(f);
const globals=new Map();
export const vi={stubGlobal(k,v){if(!globals.has(k))globals.set(k,Object.getOwnPropertyDescriptor(globalThis,k));Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:v});},unstubAllGlobals(){for(const[k,d]of globals){if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k];}globals.clear();}};
const subset=(a,b)=>b?.asymmetricMatch?b.asymmetricMatch(a):typeof b==='object'&&b!==null?Object.keys(b).every(k=>subset(a?.[k],b[k])):isDeepStrictEqual(a,b);
export function expect(actual){function build(neg=false){const check=(ok,message)=>assert.ok(neg?!ok:ok,message);return {
 get not(){return build(!neg);},toBe:x=>check(Object.is(actual,x),`Expected ${format(actual)} ${neg?'not ':''}to be ${format(x)}`),toEqual:x=>check(isDeepStrictEqual(actual,x),`Expected deep equality\n${format(actual)}\n${format(x)}`),
 toBeNull:()=>check(actual===null,'Expected null'),toBeUndefined:()=>check(actual===undefined,'Expected undefined'),toBeTruthy:()=>check(Boolean(actual),'Expected truthy'),toBeFalsy:()=>check(!actual,'Expected falsy'),
 toBeGreaterThan:x=>check(actual>x,`${actual} > ${x}`),toBeGreaterThanOrEqual:x=>check(actual>=x,`${actual} >= ${x}`),toBeLessThan:x=>check(actual<x,`${actual} < ${x}`),toBeLessThanOrEqual:x=>check(actual<=x,`${actual} <= ${x}`),
 toBeCloseTo:(x,n=2)=>check(Math.abs(actual-x)<0.5*10**-n,`${actual} near ${x}`),toHaveLength:x=>check(actual.length===x,`Expected length ${x}, got ${actual.length}`),toContain:x=>check(actual.includes(x),`Expected ${format(actual)} to contain ${x}`),toMatchObject:x=>check(subset(actual,x),`Expected subset ${format(x)} from ${format(actual)}`),toHaveProperty:k=>check(k.split('.').reduce((a,p)=>a?.[p],actual)!==undefined,`Expected property ${k}`),
 toThrow:x=>{let e;try{actual();}catch(err){e=err;}check(Boolean(e)&&(!x||(x instanceof RegExp?x.test(e.message):typeof x==='string'?e.message.includes(x):e instanceof x)),`Expected throw ${x??''}; got ${e??'no error'}`);},
};}return build();}
export function report(){console.log(JSON.stringify({runner:'Supplemental Node assert compatibility harness, NOT Vitest',passed,failed,failures},null,2)); if(failed)process.exitCode=1;}

expect.any=type=>({asymmetricMatch:a=>type===String?typeof a==='string':type===Number?typeof a==='number':a instanceof type});
