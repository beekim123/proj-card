import assert from 'node:assert/strict';
export const describe=(_name,fn)=>fn();
export const it=(name,fn)=>globalThis.__batchTests.push({name,fn});
it.each=items=>(name,fn)=>items.forEach(item=>it(name.replace('%d',String(item)),()=>Array.isArray(item)?fn(...item):fn(item)));
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
 toBeNull(){check(value===null,'value null');},
 toBeTruthy(){check(Boolean(value),'value truthy');},
 toBeLessThanOrEqual(e){check(value<=e,`${value} <= ${e}`);},
 toBeGreaterThanOrEqual(e){check(value>=e,`${value} >= ${e}`);},
 toBeCloseTo(e,d=2){check(Math.abs(value-e)<0.5*10**-d,`${value} near ${e}`);},
 toMatchObject(e){check(Object.entries(e).every(([k,v])=>matches(value[k],v)),`${JSON.stringify(value)} matches ${JSON.stringify(e)}`);},
 toHaveProperty(k,e){check(k in value&&(arguments.length<2||matches(value[k],e)),`property ${k}`);},
 toThrow(){let threw=false;try{value();}catch{threw=true;}check(threw,'function to throw');},
};};return build();}
expect.arrayContaining=value=>({[asymmetric]:'arrayContaining',value});
