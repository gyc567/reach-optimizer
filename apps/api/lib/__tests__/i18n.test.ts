import { describe, expect, it } from 'vitest';
import { MESSAGES, t, plural, type Locale } from '../i18n';

describe('i18n t()', () => {
  it('returns the localized string for a known key', () => {
    expect(t('en', 'common.use_this')).toBe('Use this version');
    expect(t('zh', 'common.use_this')).toBe('使用此版本');
  });

  it('falls back to English when a locale misses a key', () => {
    const originalZh = MESSAGES.zh['common.use_this'];
    // @ts-ignore — test fault injection
    delete (MESSAGES.zh as Record<string, string | undefined>)['common.use_this'];
    try {
      expect(t('zh', 'common.use_this')).toBe('Use this version');
    } finally {
      MESSAGES.zh['common.use_this'] = originalZh;
    }
  });

  it('returns the key itself when both locales miss it (last resort)', () => {
    const originalEn = MESSAGES.en['this.key.does.not.exist'] as unknown;
    const originalZh = MESSAGES.zh['this.key.does.not.exist'] as unknown;
    try {
      // No fallback in either locale — key should appear verbatim
      expect(t('en', 'this.key.does.not.exist')).toBe('this.key.does.not.exist');
    } finally {
      MESSAGES.en['this.key.does.not.exist'] = originalEn as never;
      MESSAGES.zh['this.key.does.not.exist'] = originalZh as never;
    }
  });

  it('substitutes {var} placeholders', () => {
    expect(t('en', 'common.couldnt_beat', { score: 42 })).toBe(
      'Auto-Optimize kept your original — couldn\'t beat score 42',
    );
    expect(t('zh', 'common.couldnt_beat', { score: 42 })).toContain('42');
  });

  it('leaves unknown {vars} intact rather than crashing', () => {
    const result = t('en', 'common.error', { stage: 'analyze' });
    expect(result).toBe('✕ analyze failed');
  });
});

describe('i18n plural()', () => {
  it('uses singular form for 1 in English', () => {
    expect(plural('en' as Locale, 1, 'round', 'rounds', '{count} 轮')).toBe('1 round');
  });

  it('uses plural form for 0 and >1 in English', () => {
    expect(plural('en' as Locale, 0, 'round', 'rounds', '{count} 轮')).toBe('0 rounds');
    expect(plural('en' as Locale, 5, 'round', 'rounds', '{count} 轮')).toBe('5 rounds');
  });

  it('uses the same Chinese form regardless of count', () => {
    expect(plural('zh' as Locale, 1, 'round', 'rounds', '{count} 轮')).toBe('1 轮');
    expect(plural('zh' as Locale, 5, 'round', 'rounds', '{count} 轮')).toBe('5 轮');
  });
});

describe('i18n fallback chain', () => {
  it('missing zh key returns en (not the literal key)', () => {
    // Common pattern: zh.json has a typo or is incomplete. The user should
    // see English text, not "common.use_this" verbatim.
    const zhSnapshot = MESSAGES.zh['common.use_this'];
    // @ts-ignore — fault injection
    (MESSAGES.zh as Record<string, string | undefined>)['common.use_this'] = undefined;
    try {
      expect(t('zh', 'common.use_this')).toBe('Use this version');
    } finally {
      MESSAGES.zh['common.use_this'] = zhSnapshot;
    }
  });
});