'use client';

import React from 'react';
import type { ScoreTier } from '@reach/shared-types';
import { colors, fonts, getScoreColor } from '@lib/styles';
import { useT } from '@lib/i18n-client';

interface ScoreGaugeProps {
  score: number;
  tier: ScoreTier;
  hasText: boolean;
}

export function ScoreGauge({ score, tier, hasText }: ScoreGaugeProps) {
  const t = useT();
  const color = hasText ? getScoreColor(score) : colors.border;
  const clamped = Math.max(0, Math.min(100, score));

  return (
    <div
      data-testid="score-gauge"
      style={{
        backgroundColor: colors.bgSecondary,
        border: `1px solid ${colors.border}`,
        borderRadius: 16,
        padding: 24,
        textAlign: 'center',
        fontFamily: fonts.family,
        color: colors.textPrimary,
      }}
    >
      <div
        style={{
          width: 160,
          height: 160,
          borderRadius: '50%',
          margin: '0 auto 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: `radial-gradient(${color}22 0%, transparent 70%)`,
          border: `4px solid ${color}`,
          transition: 'border-color 200ms ease',
        }}
      >
        <span
          data-testid="score-gauge-value"
          style={{
            fontSize: 56,
            fontWeight: 900,
            color: hasText ? color : colors.textTertiary,
            fontFamily: fonts.mono,
            lineHeight: 1,
          }}
        >
          {hasText ? clamped : '—'}
        </span>
      </div>
      <div
        data-testid="score-gauge-tier"
        style={{
          fontSize: 16,
          fontWeight: 700,
          color: hasText ? color : colors.textTertiary,
          marginBottom: 8,
        }}
      >
        {hasText ? t(`gauge.tier.${tier}`) : t('scorer.score_placeholder')}
      </div>
      <div style={{ fontSize: 12, color: colors.textSecondary, lineHeight: 1.5 }}>
        {hasText ? t(`gauge.tier_desc.${tier}`) : t('gauge.idle_desc')}
      </div>
    </div>
  );
}