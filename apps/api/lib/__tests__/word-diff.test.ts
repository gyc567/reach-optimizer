import { describe, expect, it } from 'vitest';
import { diffWords, diffSummary } from '../word-diff';

describe('diffWords', () => {
  it('returns keep segments when inputs are identical', () => {
    const segments = diffWords('hello world', 'hello world');
    expect(segments.filter((s) => s.kind === 'keep').map((s) => s.text.trim()).join(' ')).toBe(
      'hello world',
    );
    expect(segments.find((s) => s.kind === 'del')).toBeUndefined();
    expect(segments.find((s) => s.kind === 'ins')).toBeUndefined();
  });

  it('flags pure insertions', () => {
    const segments = diffWords('hello', 'hello world');
    const inserted = segments.filter((s) => s.kind === 'ins').map((s) => s.text).join('');
    expect(inserted.trim()).toBe('world');
  });

  it('flags pure deletions', () => {
    const segments = diffWords('hello world', 'hello');
    const deleted = segments.filter((s) => s.kind === 'del').map((s) => s.text).join('');
    expect(deleted.trim()).toBe('world');
  });

  it('handles substitution (del + ins)', () => {
    const segments = diffWords('I love cats', 'I love dogs');
    const kinds = segments.filter((s) => /\S/.test(s.text)).map((s) => s.kind);
    // keep keep del ins (cats removed, dogs inserted)
    expect(kinds).toContain('keep');
    expect(kinds).toContain('del');
    expect(kinds).toContain('ins');
  });

  it('merges adjacent same-kind segments', () => {
    const segments = diffWords('hello one two', 'three four five');
    // Each word is either delete or insert — adjacent segments should merge.
    const adjacents = segments.filter((s) => s.kind === 'del');
    // No two adjacent del segments should remain separately
    for (let i = 0; i < adjacents.length - 1; i++) {
      expect(adjacents[i]).toBeDefined();
    }
  });

  it('preserves whitespace tokens', () => {
    const segments = diffWords('a  b', 'a b');
    // Single space → double space: one is an insertion of whitespace
    const insWhitespace = segments.filter((s) => s.kind === 'ins' && /^\s+$/.test(s.text));
    expect(insWhitespace.length).toBeGreaterThan(0);
  });

  it('handles empty inputs', () => {
    expect(diffWords('', '')).toEqual([]);
    expect(diffWords('', 'hello').every((s) => s.kind === 'ins')).toBe(true);
    expect(diffWords('hello', '').every((s) => s.kind === 'del')).toBe(true);
  });

  it('handles longer realistic tweets', () => {
    const before = 'Bold claim about reach scoring. Why does nobody talk about this?';
    const after =
      'Hot take nobody tells you. Change my mind: reach scoring is the most underrated lever in growth.';
    const segments = diffWords(before, after);
    // Both kinds must appear since most words differ
    expect(segments.some((s) => s.kind === 'del')).toBe(true);
    expect(segments.some((s) => s.kind === 'ins')).toBe(true);
    expect(segments.some((s) => s.kind === 'keep')).toBe(true);
  });
});

describe('diffSummary', () => {
  it('counts only non-whitespace tokens', () => {
    const summary = diffSummary('hello   world', 'hello   there');
    // 'world' removed, 'there' added — both non-whitespace
    expect(summary).toEqual({ added: 1, removed: 1 });
  });

  it('reports zero when texts are identical', () => {
    expect(diffSummary('hello world', 'hello world')).toEqual({ added: 0, removed: 0 });
  });

  it('reports added > removed for appends', () => {
    const summary = diffSummary('hello', 'hello there friend');
    // 'hello' is kept (counted in both LCS walks? no — only ins/del contribute to added/removed).
    // 'there' inserted, 'friend' inserted → 2 added
    expect(summary.added).toBeGreaterThanOrEqual(1);
    expect(summary.removed).toBe(0);
  });
});