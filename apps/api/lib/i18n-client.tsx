'use client';

import React, { createContext, useCallback, useContext, useState } from 'react';
import { DEFAULT_LOCALE, t, type Locale, type MessageKey } from './i18n';

interface Ctx {
  locale: Locale;
  t: (key: MessageKey | string, vars?: Record<string, string | number>) => string;
  setLocale: (l: Locale) => void;
}
const Ctx = createContext<Ctx | null>(null);

export function LanguageProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale;
  children: React.ReactNode;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  const setLocale = useCallback((l: Locale) => {
    document.cookie = `locale=${l};path=/;max-age=31536000;samesite=lax`;
    // Hard reload — server-rendered pages need to re-render with the new
    // locale. Without this, only client components update; server-rendered
    // HTML (hero, features, cta, etc.) stays in the old language.
    window.location.reload();
  }, []);

  const tBound = useCallback(
    (key: MessageKey | string, vars?: Record<string, string | number>) =>
      t(locale, key, vars),
    [locale],
  );

  return <Ctx.Provider value={{ locale, t: tBound, setLocale }}>{children}</Ctx.Provider>;
}

export function useT() {
  const c = useContext(Ctx);
  // Allow useT() outside a LanguageProvider — useful for isolated unit tests
  // and SSR edges. Falls back to default-locale messages.
  const fallback = (key: MessageKey | string, vars?: Record<string, string | number>) =>
    t(DEFAULT_LOCALE, key, vars);
  return c ? c.t : fallback;
}

export function useSetLocale() {
  const c = useContext(Ctx);
  if (!c) return () => {};
  return c.setLocale;
}

export function useLocale(): Locale {
  const c = useContext(Ctx);
  return c?.locale ?? DEFAULT_LOCALE;
}