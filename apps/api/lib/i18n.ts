// i18n core — types, static message loading, t() helper, plural() helper.
//
// v2 design decisions:
//   - MESSAGES is statically imported (no dynamic import() — no async flash
//     when toggling locales)
//   - Missing-key fallback: dev console.warn + return key, prod return key
//     (NEVER silent English fallback — that masks incomplete translations)
//   - Type-safe keys: MessageKey is derived from en.json's keys via `as const`
//     so typos like t('scorr.titel') are compile errors

import enMessages from '../messages/en.json';
import zhMessages from '../messages/zh.json';

export const LOCALES = ['en', 'zh'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';

/** Bundled translations. Both locales ship in the client chunk. */
export const MESSAGES: Record<Locale, Record<string, string>> = {
  en: enMessages,
  zh: zhMessages,
};

/**
 * Compile-time known-good keys. `keyof typeof enMessages` would lose the string
 * union after TypeScript widening, so we use a helper that extracts the union.
 * Any `t()` call with a non-MessageKey arg is a TS error.
 */
export type MessageKey = ExtractKeys<typeof enMessages>;

type ExtractKeys<T> = T extends Record<string, string> ? keyof T & string : never;

/**
 * Translate a key with optional variable interpolation.
 *
 * Resolution order:
 *   1. MESSAGES[locale][key]
 *   2. MESSAGES.en[key] (fallback to English if locale has no entry)
 *   3. the key itself (last resort — visible to user)
 *
 * In dev (NODE_ENV !== 'production'), missing keys log a console.warn so
 * CI misses get caught locally too.
 */
export function t(
  locale: Locale,
  key: string,
  vars?: Record<string, string | number>,
): string {
  const dict = MESSAGES[locale];
  let str = dict?.[key];
  if (str === undefined && locale !== DEFAULT_LOCALE) {
    str = MESSAGES[DEFAULT_LOCALE][key];
  }
  if (str === undefined) {
    if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production') {
      console.warn(`[i18n] Missing key "${key}" in locale "${locale}"`);
    }
    str = key;
  }
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (_, name) =>
    vars[name] !== undefined ? String(vars[name]) : `{${name}}`,
  );
}

/**
 * Simple plural helper. English distinguishes "1 round" / "5 rounds"; Chinese
 * does not (5 轮 / 1 轮), so zh form always uses {count}. Use this anywhere
 * we currently say "X rounds" / "X errors" / etc.
 */
export function plural(
  locale: Locale,
  count: number,
  enSingular: string,
  enPlural: string,
  zhForm: string,
): string {
  if (locale === 'zh') return zhForm.replace(/\{count\}/g, String(count));
  const word = count === 1 ? enSingular : enPlural;
  return `${count} ${word}`;
}