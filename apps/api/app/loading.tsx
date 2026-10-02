'use client';

import { colors, fonts, radius } from '@lib/styles';
import { useT } from '@lib/i18n-client';

export default function AppLoading() {
  const t = useT();
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
        <div
          style={{
            width: 24,
            height: 24,
            margin: '0 auto 16px',
            border: `3px solid ${colors.border}`,
            borderTopColor: colors.accent.blue,
            borderRadius: '50%',
            animation: 'topdiggx-spin 0.9s linear infinite',
          }}
        />
        <div style={{ fontSize: 14, color: colors.textSecondary }}>{t('app.loading.text')}</div>
        <style>{`@keyframes topdiggx-spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
}