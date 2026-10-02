'use client';

import React from 'react';
import { useLocale, useSetLocale } from '@lib/i18n-client';

export function LanguageToggle() {
  const locale = useLocale();
  const setLocale = useSetLocale();

  const btn = (target: 'en' | 'zh', label: string, ariaLabel: string) => {
    const active = locale === target;
    return (
      <button
        type="button"
        onClick={() => setLocale(target)}
        disabled={active}
        aria-pressed={active}
        aria-label={ariaLabel}
        data-testid={`lang-toggle-${target}`}
        style={{
          background: active ? '#1d9bf0' : 'transparent',
          color: active ? '#fff' : '#71767b',
          border: '1px solid #2f3336',
          borderRadius: 9999,
          padding: '4px 12px',
          fontSize: 12,
          fontWeight: 700,
          cursor: active ? 'default' : 'pointer',
          fontFamily: 'inherit',
        }}
      >
        {label}
      </button>
    );
  };

  return (
    <div
      role="group"
      aria-label="Language"
      style={{ display: 'flex', gap: 6, alignItems: 'center' }}
      data-testid="lang-toggle"
    >
      {btn('en', 'EN', 'English')}
      {btn('zh', '中', '中文')}
    </div>
  );
}