'use client';

import React, { useEffect, useRef } from 'react';
import type { AnalysisResult } from '@reach/shared-types';
import { colors, fonts, radius } from '@lib/styles';
import type {
  UseOptimizationPipelineReturn,
  PipelineState,
  RewriteCandidate,
} from '@lib/useOptimizationPipeline';
import { useT } from '@lib/i18n-client';

interface AIOptimizerProps {
  /** Snapshot of the text the pipeline ran against. */
  textSnapshot: string;
  /** Media context so conditional signals fire correctly. */
  hasMedia?: boolean;
  mediaType?: 'image' | 'video' | 'gif' | 'poll';
  isQuoteTweet?: boolean;
  quotedText?: string;
  quotedMediaType?: 'image' | 'video' | 'gif' | 'poll';
  /** Bearer for the AI endpoints. */
  authToken?: string | null;
  /** Tell parent which text to put into the textarea. */
  onApply: (text: string) => void;
  /** Pipeline state + controls from useOptimizationPipeline. */
  pipeline: UseOptimizationPipelineReturn;
}

/**
 * AI panel — v2 pipeline UI.
 *
 * Replaces the older AIOptimizer that had three independent "Run" buttons
 * and forced the user to choose between hook rewrites and auto-optimize.
 * Now: a single CTA on the composer drives a 3-stage pipeline (analyze →
 * rewrite ‖ optimize in parallel). Each candidate has a Use this button
 * so the user can pick at any point, and per-stage Retry handles failures.
 *
 * Layout: rendered inline below the composer; the composer takes care of
 * its own scroll behaviour. We reserve a min-height so layout doesn't jump
 * when stages complete.
 */
export function AIOptimizer(props: AIOptimizerProps) {
  const { textSnapshot, onApply, pipeline } = props;
  const { state, abort, retryStage } = pipeline;
  const t = useT();

  // Reserve vertical space to avoid layout jump as stages appear.
  // 280px comfortably holds: 1 stage row + analysis summary OR 3 candidates.
  const minHeight = state.status === 'idle' ? 0 : 280;

  if (state.status === 'idle' && state.analysis === undefined) {
    return (
      <div
        data-testid="ai-optimizer"
        style={{ minHeight }}
        aria-live="polite"
      />
    );
  }

  return (
    <div
      data-testid="ai-optimizer"
      aria-busy={state.status === 'running'}
      style={{
        backgroundColor: colors.bgSecondary,
        border: `1px solid ${colors.border}`,
        borderRadius: 16,
        padding: 16,
        fontFamily: fonts.family,
        color: colors.textPrimary,
        minHeight,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      {/* Header: applied badge or summary */}
      {state.appliedText ? (
        <AppliedBanner state={state} onReset={() => { state.activeStages; /* keep applied */ }} />
      ) : null}

      {/* Stage row */}
      <StagesRow state={state} onAbort={abort} />

      {/* Stage 1 result: score + slop + hook + trending summary */}
      {state.analysis ? <AnalysisSummary analysis={state.analysis} /> : null}

      {/* Stage 2 result: 3 rewrite candidates */}
      {state.rewrites.length > 0 ? (
        <RewritesSection rewrites={state.rewrites} onApply={onApply} />
      ) : null}

      {/* Stage 3 result moved to AutoOptimizedCard (renders directly under
          the composer for the compare layout). We only keep the rewrites
          panel here — optimize stage / progress / use this now lives next
          to the original textarea. */}

      {/* Error with retry */}
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

      {/* Live region for screen readers — announces stage changes */}
      <div style={{ position: 'absolute', left: -9999, top: -9999 }} aria-live="polite">
        {state.status === 'running' ? (
          <PipelineLiveStatus state={state} />
        ) : null}
        {state.appliedText ? `Applied to tweet` : ''}
        {state.errorStage ? `Error in ${state.errorStage}` : ''}
      </div>

      {/* Length warning after apply */}
      {state.overLimit ? (
        <div
          style={{
            backgroundColor: colors.accent.red + '22',
            border: `1px solid ${colors.accent.red}66`,
            color: colors.accent.red,
            borderRadius: radius.md,
            padding: '6px 10px',
            fontSize: 12,
          }}
          data-testid="over-limit-warning"
        >
          ⚠️ Applied version exceeds 280 characters ({state.appliedText?.length}). Trim before posting.
        </div>
      ) : null}

      {/* Subtle marker when pipeline is idle and no analysis to show yet */}
      {state.status === 'idle' && !state.analysis && !state.errorStage && !state.appliedText ? (
        <div style={{ fontSize: 12, color: colors.textTertiary }}>
          Click ✨ AI in the composer to analyze + optimize.
        </div>
      ) : null}

      {/* Mark textSnapshot reference for tests */}
      <span data-testid="pipeline-snapshot" hidden>{textSnapshot}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StagesRow({ state, onAbort }: { state: PipelineState; onAbort: () => void }) {
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
        status={state.rewrites.length > 0 ? 'done' : state.errorStage === 'rewrite' ? 'error' : isRunning && state.activeStages.rewrite ? 'running' : 'pending'}
        label={t('ai.stage.rewrite')}
      />
      <Connector />
      <StageIndicator
        status={state.rounds.length > 0 ? 'done' : state.errorStage === 'optimize' ? 'error' : isRunning && state.activeStages.optimize ? 'running' : 'pending'}
        label={t('ai.stage.optimize')}
      />
      <div style={{ flex: 1 }} />
      {isRunning ? (
        <button
          type="button"
          onClick={onAbort}
          data-testid="pipeline-abort"
          aria-label={t('common.abort')}
          style={{
            background: 'transparent',
            color: colors.textSecondary,
            border: `1px solid ${colors.border}`,
            borderRadius: radius.full,
            padding: '4px 10px',
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {t('common.abort')}
        </button>
      ) : null}
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

function AnalysisSummary({ analysis }: { analysis: AnalysisResult }) {
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

function RewritesSection({
  rewrites,
  onApply,
}: {
  rewrites: RewriteCandidate[];
  onApply: (text: string) => void;
}) {
  const t = useT();
  // Pick best rewrite as visual highlight
  const bestIdx = rewrites.reduce((b, c, i) => (c.score > rewrites[b].score ? i : b), 0);
  return (
    <div data-testid="rewrites-section">
      <div
        style={{
          fontSize: 12,
          color: colors.textSecondary,
          fontWeight: 700,
          marginBottom: 6,
          letterSpacing: 0.4,
          textTransform: 'uppercase',
        }}
      >
        {t('ai.rewrites_section', { count: rewrites.length })}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {rewrites.map((r, i) => {
          const isBest = i === bestIdx;
          return (
            <div
              key={i}
              data-testid={`rewrite-${i}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                backgroundColor: colors.bgTertiary,
                border: `1px solid ${isBest ? colors.accent.green + '66' : colors.border}`,
                borderRadius: radius.md,
                padding: '8px 10px',
              }}
            >
              <span
                style={{
                  fontFamily: fonts.mono,
                  fontSize: 12,
                  color: isBest ? colors.accent.green : colors.textSecondary,
                  fontWeight: 700,
                  minWidth: 32,
                  textAlign: 'right',
                }}
              >
                {r.score}
              </span>
              <span style={{ flex: 1, fontSize: 13, lineHeight: 1.4, color: colors.textPrimary }}>
                {r.text}
              </span>
              <button
                type="button"
                onClick={() => onApply(r.text)}
                data-testid={`rewrite-use-${i}`}
                aria-label={t('ai.use_rewrite_aria', { score: r.score })}
                style={{
                  backgroundColor: isBest ? colors.accent.green : colors.accent.blue,
                  color: '#fff',
                  border: 'none',
                  borderRadius: radius.full,
                  padding: '4px 12px',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {t('common.use_this')}
              </button>
            </div>
          );
        })}
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
  stage: 'analyze' | 'rewrite' | 'optimize';
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
        aria-label={`Retry ${stage}`}
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

function AppliedBanner({ state }: { state: PipelineState; onReset: () => void }) {
  const t = useT();
  const len = state.appliedText?.length ?? 0;
  return (
    <div
      data-testid="applied-banner"
      style={{
        backgroundColor: colors.accent.green + '22',
        border: `1px solid ${colors.accent.green}66`,
        color: colors.accent.green,
        borderRadius: radius.md,
        padding: '8px 12px',
        fontSize: 13,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <span>✓ Applied to tweet ({len} chars)</span>
    </div>
  );
}

function PipelineLiveStatus({ state }: { state: PipelineState }) {
  const stages = ['analyze', 'rewrite', 'optimize'] as const;
  const running = stages.find((s) => state.activeStages[s]);
  if (running) return `Running ${running}`;
  return '';
}

// Internal: keep references for unit-test consumers
export type { RewriteCandidate };