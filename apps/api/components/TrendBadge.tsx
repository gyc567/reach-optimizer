'use client';

import React from 'react';
import { colors, fonts, radius } from '@lib/styles';
import { useT } from '@lib/i18n-client';

interface TrendBadgeProps {
  trends: Array<{ name: string; keyword?: string; tweetVolume?: number | null }>;
  matchedKeywords: string[];
  loading?: boolean;
}

export function TrendBadge({ trends, matchedKeywords, loading }: TrendBadgeProps) {
  const t = useT();
  if (loading) {
    return (
      <div
        style={{
          padding: 12,
          backgroundColor: colors.bgSecondary,
          border: `1px solid ${colors.border}`,
          borderRadius: radius.md,
          fontSize: 13,
          color: colors.textSecondary,
          fontFamily: fonts.family,
        }}
        data-testid="trend-badge"
      >
        {t('trend.badge.loading')}
      </div>
    );
  }

  if (trends.length === 0) {
    return (
      <div
        style={{
          padding: 12,
          backgroundColor: colors.bgSecondary,
          border: `1px solid ${colors.border}`,
          borderRadius: radius.md,
          fontSize: 13,
          color: colors.textTertiary,
          fontFamily: fonts.family,
        }}
        data-testid="trend-badge"
      >
        {t('trend.badge.unavailable')}
      </div>
    );
  }

  return (
    <div
      data-testid="trend-badge"
      style={{
        backgroundColor: colors.bgSecondary,
        border: `1px solid ${colors.border}`,
        borderRadius: radius.md,
        padding: 12,
        fontFamily: fonts.family,
      }}
    >
      <div style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 8, fontWeight: 600 }}>
        {t('trend.badge.title', { count: trends.length })}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {trends.map((trend, i) => {
          const matched = matchedKeywords.some(
            (k) =>
              trend.name.toLowerCase().includes(k.toLowerCase()) ||
              trend.keyword?.toLowerCase().includes(k.toLowerCase()),
          );
          return (
            <span
              key={`${trend.name}-${i}`}
              style={{
                backgroundColor: matched ? colors.accent.blue + '22' : colors.bgTertiary,
                color: matched ? colors.accent.blue : colors.textPrimary,
                border: `1px solid ${matched ? colors.accent.blue + '66' : colors.border}`,
                borderRadius: radius.full,
                padding: '4px 10px',
                fontSize: 12,
                fontWeight: matched ? 700 : 500,
              }}
            >
              #{trend.name}
            </span>
          );
        })}
      </div>
    </div>
  );
}