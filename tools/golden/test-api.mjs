import assert from 'node:assert/strict';
import { isDeepStrictEqual, format } from 'node:util';
export const cases = [];
let suites = [], current = null;
export let recording = true;
export function setRecording(value) { recording = value; }
export const describe = (name, fn) => { suites.push(name); try { fn(); } finally { suites.pop(); } };
function register(name, fn) { cases.push({ file: globalThis.__oracleFile, name: [...suites, name].join(' > '), fn, calls: [] }); }
register.each = rows => (name, fn) => rows.forEach(row => { const args = Array.isArray(row) ? row : [row]; register(format(name, ...args), () => fn(...args)); });
export const it = register, test = register;
function subset(actual, expected) { return expected && typeof expected === 'object' ? Object.entries(expected).every(([key, value]) => key in actual && subset(actual[key], value)) : isDeepStrictEqual(actual, expected); }
function match(actual, negate = false) {
  const check = (ok, message) => assert.ok(negate ? !ok : ok, message);
  return {
    get not() { return match(actual, !negate); },
    toBe(expected) { check(Object.is(actual, expected), `expected ${format(actual)} ${negate?'not ':''}to be ${format(expected)}`); },
    toEqual(expected) { check(expected?.$arrayContaining ? expected.$arrayContaining.every(v=>actual.some(a=>isDeepStrictEqual(a,v))) : isDeepStrictEqual(actual, expected), 'deep equality mismatch'); },
    toStrictEqual(expected) { check(isDeepStrictEqual(actual, expected), 'strict deep equality mismatch'); },
    toMatchObject(expected) { check(subset(actual, expected), 'object subset mismatch'); },
    toHaveLength(n) { check(actual.length === n, `length ${actual.length} expected ${n}`); },
    toContain(value) { check(actual.includes(value), `expected to contain ${value}`); },
    toBeNull() { check(actual === null, 'expected null'); },
    toBeUndefined() { check(actual === undefined, 'expected undefined'); },
    toBeDefined() { check(actual !== undefined, 'expected defined'); },
    toBeGreaterThan(n) { check(actual > n, 'expected greater'); },
    toBeGreaterThanOrEqual(n) { check(actual >= n, 'expected greater or equal'); },
    toBeLessThan(n) { check(actual < n, 'expected less'); },
    toBeLessThanOrEqual(n) { check(actual <= n, 'expected less or equal'); },
    toBeCloseTo(n, precision = 2) { check(Math.abs(actual - n) < 0.5 * 10 ** -precision, 'expected close'); },
    toHaveProperty(key, value) { const parts = key.split('.'); let found=actual; let exists=true; for (const part of parts) { if (found==null || !(part in found)) { exists=false; break; } found=found[part]; } check(exists && (arguments.length<2 || isDeepStrictEqual(found,value)), 'expected property '+key); },
    toThrow(expected) { let error; try { actual(); } catch (e) { error=e; } check(!!error && (expected === undefined || typeof expected === 'function' && error instanceof expected || typeof expected === 'string' && error.message.includes(expected) || expected instanceof RegExp && expected.test(error.message)), 'expected throw '+expected); },
  };
}
export const expect = actual => match(actual);
expect.arrayContaining = values => ({$arrayContaining:values});
const rngs = new WeakMap();
let rngCounter = 0;
let table = [], intern = new Map();
export function serial(value) {
  if (value === undefined) return { $undefined: true };
  if (typeof value === 'number' && !Number.isFinite(value)) return { $number: String(value) };
  if (typeof value === 'number' && (!Number.isInteger(value) || Math.abs(value) >= 2 ** 53)) {
    const bytes=Buffer.allocUnsafe(8);bytes.writeDoubleLE(value);return {$float64:bytes.toString('hex')};
  }
  if (typeof value === 'function') {
    if (value.getState) return { $rng: value.getState() };
    return { $function: String(value) };
  }
  if (typeof value === 'string' && value.length > 512) {
    try { return {$jsonString:serial(JSON.parse(value))}; } catch { /* plain string */ }
  }
  if (value && typeof value === 'object') {
    const packed=Array.isArray(value)? value.map(serial):Object.fromEntries(Object.entries(value).map(([k,v])=>[k,serial(v)]));
    const key=JSON.stringify(packed);
    let id=intern.get(key);
    if(id===undefined){id=table.length;table.push(packed);intern.set(key,id);}
    return {$ref:id};
  }
  return value;
}
export function capture(module, name, fn, args) {
  if (!fn) throw Error('Missing export '+module+'.'+name);
  if (!current || !recording) return fn(...args);
  const call = { module, function: name, argsBefore: serial(args) };
  try {
    const result = fn(...args);
    call.argsAfter = serial(args); call.result=serial(result);
    current.calls.push(call);
    return result;
  } catch (error) {
    call.argsAfter=serial(args); call.error={name:error.name,message:error.message};
    current.calls.push(call); throw error;
  }
}
export async function runCases(onCase) {
  for (const c of cases) {
    table=[];intern=new Map();current=c;
    try { await c.fn(); c.passed=true; } catch (e) { c.passed=false; c.failure=e.stack; }
    current=null;c.table=table;
    await onCase(c);
  }
}
