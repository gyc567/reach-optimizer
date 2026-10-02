'use client';

import React from 'react';
import { ScoreEngine } from '@reach/rules-engine';
import { colors, fonts, radius } from '@lib/styles';
import { useT } from '@lib/i18n-client';
import type { UseOptimizationPipelineReturn } from '@lib/useOptimizationPipeline';

interface AIOptimizerProps {
  pipeline: UseOptimizationPipelineReturn;
  /** Snapshot of the text the pipeline is running against. */
  textSnapshot: string;
  /** Click Abort to stop in-flight. */
  onAbort: () => void;
}

const engine = new ScoreEngine();

export function AIOptimizer({ pipeline, textSnapshot, onAbort }: AIOptimizerProps) {
  const { state, abort, retryStage } = pipeline;
  const t = useT();

  // The pipeline strips analysis down to { score, tier } — we recompute the
  // full result locally so the summary can render signal counts, slop, etc.
  const analysis = textSnapshot.trim().length >= 3
    ? engine.evaluate({ text: textSnapshot, platform: 'x', isThread: false, hasMedia: false })
    : null;

  const showPanel =
    analysis !== null ||
    state.errorStage === 'analyze' ||
    state.errorStage === 'optimize';

  if (!showPanel) return null;

  return (
    <div
      data-testid="ai-optimizer"
      style={{
        backgroundColor: colors.bgSecondary,
        border: `1px solid ${colors.border}`,
        borderRadius: 16,
        padding: 16,
        fontFamily: fonts.family,
        color: colors.textPrimary,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <StagesRow state={state} />

      {/* v10 — progress bar moved to floating CatProgressFab (mounted at
          page.tsx level so it stays in viewport during scroll). The
          PipelineProgress component is kept in the codebase but no longer
          rendered here. */}

      {analysis ? <AnalysisSummary analysis={analysis} /> : null}

      {state.errorStage ? (
        <ErrorBlock
          stage={state.errorStage}
          message={state.errorMessage ?? t('ai.error_unknown')}
          onRetry={() => {
            void retryStage(state.errorStage!);
          }}
          onAbort={abort}
        />
      ) : null}
    </div>
  );
}

function StagesRow({ state }: { state: UseOptimizationPipelineReturn['state'] }) {
  const t = useT();
  const isRunning = state.status === 'running';
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        fontSize: 12,
        color: colors.textSecondary,
      }}
    >
      <StageIndicator
        status={state.analysis ? 'done' : state.errorStage === 'analyze' ? 'error' : isRunning && state.activeStages.analyze ? 'running' : 'pending'}
        label={t('ai.stage.analyze')}
      />
      <Connector />
      <StageIndicator
        status={state.rounds.length > 0 ? 'done' : state.errorStage === 'optimize' ? 'error' : isRunning && state.activeStages.optimize ? 'running' : 'pending'}
        label={t('ai.stage.optimize')}
      />
    </div>
  );
}

function StageIndicator({
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
      data-testid={`stage-${label.toLowerCase()}-${status}`}
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
        maxWidth: 24,
      }}
    />
  );
}

function AnalysisSummary({ analysis }: { analysis: ReturnType<typeof ScoreEngine.prototype.evaluate> }) {
  const t = useT();
  return (
    <div
      style={{
        backgroundColor: colors.bgTertiary,
        border: `1px solid ${colors.border}`,
        borderRadius: radius.md,
        padding: 12,
        fontSize: 13,
      }}
      data-testid="analysis-summary"
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <span style={{ color: colors.textSecondary, fontSize: 11, letterSpacing: 0.5 }}>
          {t('ai.score_label')}
        </span>
        <span
          style={{
            fontFamily: fonts.mono,
            fontSize: 22,
            fontWeight: 900,
            color: colors.accent.blue,
          }}
          data-testid="analysis-score"
        >
          {analysis.score}
        </span>
        <span style={{ color: colors.textSecondary, fontSize: 11 }}>
          {t(`ai.tier.${analysis.tier}`)}
        </span>
        {analysis.aiSlopScore !== null && analysis.aiSlopScore !== undefined ? (
          <span style={{ color: colors.textSecondary }}>
            · {t('ai.ai_slop')} <strong style={{ color: colors.textPrimary }}>{analysis.aiSlopScore}/100</strong>
          </span>
        ) : null}
        {analysis.trendingAlignment?.isAligned ? (
          <span style={{ color: colors.accent.orange }}>· {t('ai.trending_match')}</span>
        ) : null}
      </div>
    </div>
  );
}

function ErrorBlock({
  stage,
  message,
  onRetry,
  onAbort,
}: {
  stage: 'analyze' | 'optimize';
  message: string;
  onRetry: () => void;
  onAbort: () => void;
}) {
  const t = useT();
  return (
    <div
      data-testid="pipeline-error"
      style={{
        backgroundColor: colors.accent.red + '18',
        border: `1px solid ${colors.accent.red}66`,
        color: colors.accent.red,
        borderRadius: radius.md,
        padding: 10,
        fontSize: 13,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexWrap: 'wrap',
      }}
    >
      <span>
        ✕ <strong>{t(`ai.stage.${stage}`)}</strong>: {message}
      </span>
      <div style={{ flex: 1 }} />
      <button
        type="button"
        onClick={onRetry}
        data-testid={`pipeline-retry-${stage}`}
        aria-label={`${t('common.retry')} ${t(`ai.stage.${stage}`)}`}
        style={{
          backgroundColor: colors.accent.red,
          color: '#fff',
          border: 'none',
          borderRadius: radius.full,
          padding: '4px 12px',
          fontSize: 12,
          fontWeight: 700,
          cursor: 'pointer',
        }}
      >
        {t('common.retry')} {t(`ai.stage.${stage}`)}
      </button>
      <button
        type="button"
        onClick={onAbort}
        aria-label={t('common.abort')}
        style={{
          backgroundColor: 'transparent',
          color: colors.textPrimary,
          border: `1px solid ${colors.border}`,
          borderRadius: radius.full,
          padding: '4px 12px',
          fontSize: 12,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        {t('common.abort')}
      </button>
    </div>
  );
}