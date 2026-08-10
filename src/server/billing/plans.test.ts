import { describe, it, expect } from 'vitest';
import { FREE_STORAGE_BYTES, PLANS, getPlanStorageBytes } from './plans';

describe('billing plans', () => {
  it('free tier returns the free quota', () => {
    expect(getPlanStorageBytes('free')).toBe(FREE_STORAGE_BYTES);
  });

  it('paid plans return their configured quota', () => {
    expect(getPlanStorageBytes('plus')).toBe(PLANS.plus.storageBytes);
    expect(getPlanStorageBytes('pro')).toBe(PLANS.pro.storageBytes);
    expect(getPlanStorageBytes('max')).toBe(PLANS.max.storageBytes);
  });
});
