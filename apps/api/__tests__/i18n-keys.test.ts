// CI parity check.
//
// If en.json and zh.json don't have exactly the same keys, this test fails
// and the PR can't merge. Add new strings to BOTH files in the same commit
// to keep them in sync.

import { describe, expect, it } from 'vitest';
import enMessages from '../messages/en.json';
import zhMessages from '../messages/zh.json';

describe('i18n key parity', () => {
  it('zh.json has exactly the same keys as en.json', () => {
    const enKeys = Object.keys(enMessages).sort();
    const zhKeys = Object.keys(zhMessages).sort();
    expect(zhKeys).toEqual(enKeys);
  });

  it('every zh value is a non-empty string', () => {
    for (const [key, value] of Object.entries(zhMessages)) {
      expect(typeof value, `key=${key}`).toBe('string');
      expect(value.length, `key=${key}`).toBeGreaterThan(0);
    }
  });

  it('every en value is a non-empty string', () => {
    for (const [key, value] of Object.entries(enMessages)) {
      expect(typeof value, `key=${key}`).toBe('string');
      expect(value.length, `key=${key}`).toBeGreaterThan(0);
    }
  });
});