import assert from 'node:assert/strict';
export const describe=(_name,fn)=>fn();
export const it=(name,fn)=>globalThis.__batchTests.push({name,fn});
const asymmetric=Symbol('asymmetric');
function matches(actual,expected){if(expected?.[asymmetric]==='arrayContaining')return Array.isArray(actual)&&expected.value.every(e=>actual.some(a=>matches(a,e)));try{assert.deepStrictEqual(actual,expected);return true;}catch{return false;}}
export function expect(value){const build=(negate=false)=>{const check=(result,message)=>assert.ok(negate?!result:result,`${negate?'not ':''}${message}`);return {
 get not(){return build(!negate);},
 toBe(expected){check(Object.is(value,expected),`${JSON.stringify(value)} to be ${JSON.stringify(expected)}`);},
 toEqual(expected){check(matches(value,expected),`${JSON.stringify(value)} to equal ${JSON.stringify(expected)}`);},
 toHaveLength(expected){check(value?.length===expected,`length ${value?.length} to be ${expected}`);},
 toContain(expected){check(value?.includes(expected),`${JSON.stringify(value)} to contain ${JSON.stringify(expected)}`);},
 toBeUndefined(){check(value===undefined,`${JSON.stringify(value)} to be undefined`);},
 toBeDefined(){check(value!==undefined,'value to be defined');},
 toBeLessThan(expected){check(value<expected,`${value} < ${expected}`);},
 toBeGreaterThan(expected){check(value>expected,`${value} > ${expected}`);},
 toThrow(){let threw=false;try{value();}catch{threw=true;}check(threw,'function to throw');},
};};return build();}
expect.arrayContaining=value=>({[asymmetric]:'arrayContaining',value});
