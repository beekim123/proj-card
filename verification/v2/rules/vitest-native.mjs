import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
export { describe, it };
export function expect(actual) {
  return {
    toBe: expected => assert.equal(actual, expected),
    toEqual: expected => assert.deepEqual(actual, expected),
    toContain: expected => assert.ok(actual.includes(expected), `Expected ${JSON.stringify(actual)} to contain ${JSON.stringify(expected)}`),
    toThrow: () => assert.throws(actual),
  };
}
