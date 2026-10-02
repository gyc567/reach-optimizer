'use client';

import React, { useEffect, useState } from 'react';
import { colors, fonts, radius } from '@lib/styles';
import { useT } from '@lib/i18n-client';
import type { UseOptimizationPipelineReturn } from '@lib/useOptimizationPipeline';

interface PipelineProgressProps {
  pipeline: UseOptimizationPipelineReturn;
  onAbort: () => void;
}

/**
 * v9 — Pipeline progress bar. Renders only while status === 'running'.
 *
 * Layout (方案 A):
 *   [●] Analyze ──────► [◐] Optimize              0:42
 *   ████████░░░░░░░░░░░░░░░░░░░░  Round 2 / 5    ~15s remaining [Stop]
 *
 * Accessibility:
 *   - role="progressbar" with aria-valuenow/min/max
 *   - aria-busy="true" while we're still waiting for the first round
 *   - aria-live="polite" region for status text so screen readers announce
 *     round updates without interrupting the user
 *
 * Behavior:
 *   - Fill width = pipeline.progressPercent
 *   - Tick marks at analyze boundary (20%) and each round boundary
 *   - Tick turns green when its round completes
 *   - ETA appears once we have ≥ 2 round timestamps
 *   - Elapsed clock (0:42) ticks every second while running
 */
export function PipelineProgress({ pipeline, onAbort }: PipelineProgressProps) {
  const { state, progressPercent, etaSeconds, currentStage } = pipeline;
  const t = useT();
  const [now, setNow] = useState(() => Date.now());

  // Tick every 1s so the elapsed clock refreshes. Cheap; one setInterval.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  if (state.status !== 'running') return null;

  const maxRounds = state.optimizeMaxRounds;
  const doneRounds = state.rounds.length;
  const hasAnyRound = doneRounds > 0;
  const stageStart = currentStage === 'analyze'
    ? state.stageStartedAt.analyze
    : currentStage === 'optimize'
      ? state.stageStartedAt.optimize
      : null;
  const elapsedSec = stageStart ? Math.max(0, Math.floor((now - stageStart) / 1000)) : 0;

  // Build tick marks. Index 0 = analyze boundary. 1..maxRounds = round boundaries.
  const ticks = Array.from({ length: maxRounds + 1 }, (_, i) => {
    if (i === 0) {
      return {
        key: 'analyze',
        left: 20,
        state: 'done' as const, // analyze boundary tick is "done" once we move past analyze
      };
    }
    return {
      key: `round-${i - 1}`,
      left: 20 + (i / maxRounds) * 80,
      state: (i - 1) < doneRounds ? ('done' as const) : ('pending' as const),
    };
  });

  // Status label (aria-live)
  let statusLabel: string;
  if (currentStage === 'analyze') {
    statusLabel = t('progress.analyzing');
  } else if (currentStage === 'optimize') {
    if (!hasAnyRound) {
      statusLabel = t('progress.optimizing_first');
    } else if (etaSeconds !== null) {
      statusLabel = t('progress.round', { current: doneRounds, total: maxRounds });
    } else {
      statusLabel = t('progress.round', { current: doneRounds, total: maxRounds });
    }
  } else {
    statusLabel = t('progress.optimizing');
  }

  const etaLabel =
    etaSeconds !== null && currentStage === 'optimize' && hasAnyRound
      ? etaSeconds <= 1
        ? t('progress.finishing')
        : t('progress.eta', { seconds: etaSeconds })
      : null;

  const fillColor =
    progressPercent >= 100
      ? colors.accent.green
      : currentStage === 'analyze'
        ? colors.accent.purple ?? colors.accent.blue
        : colors.accent.blue;

  return (
    <div
      data-testid="pipeline-progress"
      role="group"
      aria-label={t('progress.label')}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: 12,
        backgroundColor: colors.bgTertiary,
        border: `1px solid ${colors.border}`,
        borderRadius: radius.md,
      }}
    >
      {/* Top row: stage dots + elapsed */}
      <div
        data-testid="progress-stages"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 12,
          color: colors.textSecondary,
        }}
      >
        <StageDot
          status={state.analysis !== null
            ? 'done'
            : currentStage === 'analyze'
              ? 'running'
              : 'pending'}
          label={t('ai.stage.analyze')}
        />
        <Connector />
        <StageDot
          status={state.rounds.length >= maxRounds && maxRounds > 0
            ? 'done'
            : state.errorStage === 'optimize'
              ? 'error'
              : currentStage === 'optimize'
                ? 'running'
                : 'pending'}
          label={t('ai.stage.optimize')}
        />
        <div style={{ flex: 1 }} />
        <span
          data-testid="progress-elapsed"
          aria-hidden
          style={{
            fontFamily: fonts.mono,
            fontSize: 11,
            color: colors.textTertiary,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {formatElapsed(elapsedSec)}
        </span>
      </div>

      {/* Progress track */}
      <div
        data-testid="progress-track"
        data-progress-percent={progressPercent}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={hasAnyRound ? progressPercent : undefined}
        aria-busy={!hasAnyRound}
        aria-label={t('progress.bar_label')}
        style={{
          position: 'relative',
          width: '100%',
          height: 8,
          backgroundColor: colors.border,
          borderRadius: radius.full,
          overflow: 'hidden',
        }}
      >
        <div
          data-testid="progress-fill"
          style={{
            width: `${progressPercent}%`,
            height: '100%',
            backgroundColor: fillColor,
            borderRadius: radius.full,
            transition: 'width 400ms cubic-bezier(0.4, 0, 0.2, 1), background-color 200ms ease',
          }}
        />
        {/* Tick marks */}
        {ticks.map((tick) => (
          <span
            key={tick.key}
            data-testid={`progress-tick-${tick.key}`}
            data-tick-state={tick.state}
            aria-hidden
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: `${tick.left}%`,
              width: 2,
              marginLeft: -1,
              backgroundColor: tick.state === 'done' ? colors.accent.green : colors.bgSecondary,
              opacity: tick.state === 'done' ? 1 : 0.5,
              borderRadius: 1,
              transition: 'background-color 200ms ease, opacity 200ms ease',
              pointerEvents: 'none',
            }}
          />
        ))}
      </div>

      {/* Bottom row: status + ETA + Abort */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 12,
          flexWrap: 'wrap',
        }}
      >
        <span
          data-testid="progress-live"
          aria-live="polite"
          aria-atomic="true"
          style={{
            color: colors.textPrimary,
            fontWeight: 600,
          }}
        >
          {statusLabel}
        </span>
        {etaLabel ? (
          <span
            data-testid="progress-eta"
            style={{
              color: colors.textSecondary,
              fontFamily: fonts.mono,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {etaLabel}
          </span>
        ) : null}
        <div style={{ flex: 1 }} />
        <button
          type="button"
          onClick={onAbort}
          data-testid="progress-abort"
          aria-label={t('common.abort')}
          style={{
            backgroundColor: 'transparent',
            color: colors.accent.red,
            border: `1px solid ${colors.accent.red}`,
            borderRadius: radius.full,
            padding: '4px 12px',
            fontSize: 11,
            fontWeight: 700,
            cursor: 'pointer',
            fontFamily: fonts.family,
            transition: 'background-color 150ms ease',
          }}
        >
          {t('common.abort')}
        </button>
      </div>
    </div>
  );
}

function StageDot({
  status,
  label,
}: {
  status: 'pending' | 'running' | 'done' | 'error';
  label: string;
}) {
  const color =
    status === 'done'
      ? colors.accent.green
      : status === 'error'
        ? colors.accent.red
        : status === 'running'
          ? colors.accent.blue
          : colors.textTertiary;
  const icon =
    status === 'done' ? '✓' : status === 'error' ? '✕' : status === 'running' ? '◐' : '·';
  return (
    <span
      data-testid={`progress-stage-${label.toLowerCase()}`}
      data-stage-status={status}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        color,
        fontWeight: 600,
      }}
    >
      <span aria-hidden style={{ fontFamily: fonts.mono, fontSize: 13 }}>
        {icon}
      </span>
      {label}
    </span>
  );
}

function Connector() {
  return (
    <span
      aria-hidden
      style={{
        flex: 1,
        height: 1,
        backgroundColor: colors.border,
        maxWidth: 16,
      }}
    />
  );
}

function formatElapsed(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
