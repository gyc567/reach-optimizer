'use client';

import { useEffect } from 'react';
import { colors, fonts, radius } from '@lib/styles';
import { useT } from '@lib/i18n-client';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useT();
  useEffect(() => {
    console.error('[TopDiggX] App error:', error);
  }, [error]);

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: colors.bg,
        color: colors.textPrimary,
        fontFamily: fonts.family,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        style={{
          maxWidth: 480,
          backgroundColor: colors.bgSecondary,
          border: `1px solid ${colors.border}`,
          borderRadius: radius.lg,
          padding: 32,
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 8px 0' }}>
          {t('app.error.title')}
        </h2>
        <p
          style={{
            fontSize: 14,
            color: colors.textSecondary,
            margin: '0 0 24px 0',
            lineHeight: 1.5,
          }}
        >
          {error.message || t('app.error.body')}
        </p>
        <button
          type="button"
          onClick={() => reset()}
          style={{
            backgroundColor: colors.accent.blue,
            color: '#fff',
            border: 'none',
            borderRadius: radius.full,
            padding: '10px 24px',
            fontSize: 14,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          {t('app.error.retry')}
        </button>
      </div>
    </div>
  );
}