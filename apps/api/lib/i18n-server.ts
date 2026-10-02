// Server-side locale resolution.
//
// Order of precedence (first match wins):
//   1. locale cookie set explicitly by the user via LanguageToggle
//   2. Accept-Language header (first visit, no cookie yet)
//   3. DEFAULT_LOCALE (en)

import { cookies, headers } from 'next/headers';
import { DEFAULT_LOCALE, LOCALES, MESSAGES, type Locale } from './i18n';

function isLocale(v: string | undefined): v is Locale {
  return !!v && (LOCALES as readonly string[]).includes(v);
}

export async function getLocale(): Promise<Locale> {
  // 1. Cookie
  const c = await cookies();
  const cookieLocale = c.get('locale')?.value;
  if (isLocale(cookieLocale)) return cookieLocale;

  // 2. Accept-Language (browser preference on first visit)
  const h = await headers();
  const acceptLanguage = h.get('accept-language') ?? '';
  if (acceptLanguage.toLowerCase().includes('zh')) return 'zh';

  // 3. Default
  return DEFAULT_LOCALE;
}

/**
 * Load messages for the given locale. Synchronous — both locales are bundled
 * statically at build time so there's no network fetch and no async flash.
 */
export function getMessages(locale: Locale): Record<string, string> {
  return MESSAGES[locale];
}