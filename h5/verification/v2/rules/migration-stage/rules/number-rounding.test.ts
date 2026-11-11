import { describe, expect, it } from 'vitest';
import { formatNumber } from './index';

describe('四位有效数字 · 原整数位阶四舍五入，避免二进制中点误差', () => {
  it.each([
    [12344, '1.234万'], [12345, '1.235万'], [12346, '1.235万'],
    [-12345, '-1.235万'], [123450, '12.35万'], [1234500, '123.5万'],
    [123450000, '1.235亿'], [1234500000000, '1.235兆'],
    [1234567, '123.5万'], [1500000, '150万'],
  ])('%s → %s', (value, expected) => {
    expect(formatNumber(value as number)).toBe(expected);
  });
});
