'use client';

import React from 'react';
import type { ReachForecast as ReachForecastType, WhatIfScenario } from '@reach/shared-types';
import { colors, fonts, radius } from '@lib/styles';
import { formatNumber } from '@reach/rules-engine';
import { useT } from '@lib/i18n-client';

interface ReachForecastProps {
  forecast: ReachForecastType;
}

function scenarioAccent(s: WhatIfScenario): string {
  if (s.alreadyApplied) return colors.textTertiary;
  return s.delta > 0 ? colors.accent.green : colors.accent.red;
}

export function ReachForecast({ forecast }: ReachForecastProps) {
  const t = useT();
  // Map scenario id → i18n lookup. The forecast engine returns labels in
  // English as a fallback; we look up the localized label and description
  // by id (e.g. "add-image" → "reach.scenario.add-image.label").
  const localizeScenario = (id: string): { label: string; description?: string } => ({
    label: t(`reach.scenario.${id}.label`),
    description: t(`reach.scenario.${id}.desc`),
  });

  return (
    <div
      data-testid="reach-forecast"
      style={{
        backgroundColor: colors.bgSecondary,
        border: `1px solid ${colors.border}`,
        borderRadius: 16,
        padding: 20,
        fontFamily: fonts.family,
        color: colors.textPrimary,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 13, color: colors.textSecondary, fontWeight: 600 }}>
          {t('reach.title')}
        </span>
        <span style={{ fontSize: 11, color: colors.textTertiary }}>
          {forecast.isEstimate ? t('reach.estimate_label') : t('reach.confidence_label', { count: forecast.dataPoints })}
        </span>
      </div>

      <div
        style={{
          marginTop: 8,
          fontSize: 40,
          fontWeight: 900,
          color: colors.accent.blue,
          fontFamily: fonts.mono,
          lineHeight: 1,
        }}
        data-testid="forecast-predicted"
      >
        {formatNumber(forecast.predictedReach)}
      </div>
      <div style={{ marginTop: 6, fontSize: 13, color: colors.textSecondary }}>
        ± {formatNumber(forecast.reachLow)}–{formatNumber(forecast.reachHigh)}
        {forecast.confidence > 0 && (
          <span style={{ marginLeft: 8 }}>
            · {(forecast.confidence * 100).toFixed(0)}% {t('reach.confidence_short')}
          </span>
        )}
      </div>

      {/* Probabilities row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 8,
          marginTop: 16,
        }}
      >
        <Prob label={t('reach.reply_prob')} value={forecast.replyProbability} color={colors.accent.blue} />
        <Prob label={t('reach.bookmark_prob')} value={forecast.bookmarkProbability} color={colors.accent.purple} />
        <Prob label={t('reach.viral_chance')} value={forecast.viralChance} color={colors.accent.pink} />
      </div>

      {/* What-if scenarios */}
      {forecast.scenarios.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <div
            style={{
              fontSize: 12,
              color: colors.textSecondary,
              fontWeight: 700,
              marginBottom: 8,
              letterSpacing: 0.4,
              textTransform: 'uppercase',
            }}
          >
            {t('reach.what_if')}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {forecast.scenarios.map((s) => {
              const loc = localizeScenario(s.id);
              return (
                <div
                  key={s.id}
                  data-testid={`scenario-${s.id}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    backgroundColor: colors.bgTertiary,
                    border: `1px solid ${colors.border}`,
                    borderRadius: radius.md,
                    padding: '8px 12px',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span aria-hidden>{s.icon}</span>
                    <span style={{ fontSize: 13, color: colors.textPrimary }}>
                      {loc.description ? (
                        <span title={loc.description}>{loc.label}</span>
                      ) : (
                        loc.label
                      )}
                    </span>
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      fontFamily: fonts.mono,
                      color: scenarioAccent(s),
                      fontWeight: 700,
                    }}
                  >
                    {s.alreadyApplied
                      ? t('reach.scenario.already_applied_short')
                      : Number.isFinite(s.deltaPercent)
                        ? `${s.deltaPercent > 0 ? '+' : ''}${s.deltaPercent}%`
                        : '—'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function Prob({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div
      style={{
        backgroundColor: colors.bgTertiary,
        borderRadius: radius.md,
        padding: '8px 10px',
      }}
    >
      <div style={{ fontSize: 11, color: colors.textSecondary }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <span
          style={{
            fontFamily: fonts.mono,
            fontSize: 20,
            fontWeight: 700,
            color,
          }}
        >
          {value}
        </span>
        <span style={{ fontSize: 11, color: colors.textTertiary }}>%</span>
      </div>
    </div>
  );
}