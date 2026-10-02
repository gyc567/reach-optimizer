'use client';

import React, { useState } from 'react';
import type { AnalysisResult, SignalName } from '@reach/shared-types';
import { SIGNAL_NAMES } from '@reach/shared-types';
import { colors, fonts, radius, signalBucketColors } from '@lib/styles';
import { useT } from '@lib/i18n-client';

interface SignalBreakdownProps {
  analysis: AnalysisResult;
}

const BUCKET_ORDER: Array<{ key: keyof typeof signalBucketColors; labelKey: string }> = [
  { key: 'engagement', labelKey: 'signal.bucket.engagement' },
  { key: 'curiosity', labelKey: 'signal.bucket.curiosity' },
  { key: 'dwell', labelKey: 'signal.bucket.dwell' },
  { key: 'risk', labelKey: 'signal.bucket.risk' },
];

export function SignalBreakdown({ analysis }: SignalBreakdownProps) {
  const t = useT();
  const [openBuckets, setOpenBuckets] = useState<Set<string>>(new Set(['engagement']));

  const toggle = (key: string) => {
    setOpenBuckets((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const signalsByBucket = new Map<string, SignalName[]>();
  for (const b of BUCKET_ORDER) signalsByBucket.set(b.key, []);
  for (const signal of SIGNAL_NAMES) {
    const score = analysis.signalScores[signal];
    if (!score) continue;
    signalsByBucket.get(score.bucket)?.push(signal);
  }

  return (
    <div
      style={{
        backgroundColor: colors.bgSecondary,
        border: `1px solid ${colors.border}`,
        borderRadius: 16,
        padding: 16,
        fontFamily: fonts.family,
        color: colors.textPrimary,
      }}
      data-testid="signal-breakdown"
    >
      <div
        style={{
          fontSize: 14,
          fontWeight: 700,
          color: colors.textPrimary,
          marginBottom: 12,
        }}
      >
        {t('signal.section_title')}
      </div>
      {BUCKET_ORDER.map(({ key, labelKey }) => {
        const signals = signalsByBucket.get(key) ?? [];
        const isOpen = openBuckets.has(key);
        const bucketColor = signalBucketColors[key];
        return (
          <div key={key} style={{ marginBottom: 8 }}>
            <button
              type="button"
              onClick={() => toggle(key)}
              aria-expanded={isOpen}
              data-testid={`bucket-toggle-${key}`}
              style={{
                width: '100%',
                background: 'transparent',
                border: 'none',
                padding: '8px 4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                color: colors.textPrimary,
                fontWeight: 600,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    backgroundColor: bucketColor,
                    display: 'inline-block',
                  }}
                />
                {t(labelKey)} <span style={{ color: colors.textSecondary, fontWeight: 400 }}>({signals.length})</span>
              </span>
              <span style={{ color: colors.textSecondary }}>{isOpen ? '▾' : '▸'}</span>
            </button>
            {isOpen && (
              <div style={{ paddingLeft: 16, paddingBottom: 4 }}>
                {signals.map((signal) => {
                  const score = analysis.signalScores[signal];
                  const ratio = score.max > 0 ? Math.abs(score.score) / Math.abs(score.max) : 0;
                  const filled = Math.round(ratio * 100);
                  const isNegative = score.type === 'negative';
                  return (
                    <div
                      key={signal}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '130px 1fr 60px',
                        alignItems: 'center',
                        gap: 8,
                        padding: '4px 0',
                        fontSize: 12,
                        color: colors.textSecondary,
                      }}
                      data-testid={`signal-row-${signal}`}
                    >
                      <span style={{ color: colors.textPrimary, fontWeight: 500 }}>
                        {t(`signal.name.${signal}`) || humanize(signal)}
                      </span>
                      <div
                        style={{
                          height: 6,
                          backgroundColor: colors.bgTertiary,
                          borderRadius: radius.full,
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            width: `${filled}%`,
                            height: '100%',
                            backgroundColor: score.applicable
                              ? (isNegative ? colors.accent.red : bucketColor)
                              : colors.border,
                            transition: 'width 200ms ease',
                          }}
                        />
                      </div>
                      <span
                        style={{
                          fontFamily: fonts.mono,
                          textAlign: 'right',
                          color: !score.applicable
                            ? colors.textTertiary
                            : isNegative && score.score < 0
                              ? colors.accent.red
                              : score.score > 0
                                ? colors.textPrimary
                                : colors.textSecondary,
                        }}
                      >
                        {!score.applicable
                          ? `— ${t('signal.not_applicable')}`
                          : `${score.score}/${score.max > 0 ? score.max : '-'}`}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function humanize(s: string): string {
  return s
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}