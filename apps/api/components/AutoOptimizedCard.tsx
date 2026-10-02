'use client';

import React from 'react';
import { ScoreEngine } from '@reach/rules-engine';
import { colors, fonts, radius } from '@lib/styles';
import { diffWords, type DiffSegment } from '@lib/word-diff';
import type { UseOptimizationPipelineReturn } from '@lib/useOptimizationPipeline';
import { useT } from '@lib/i18n-client';

const engine = new ScoreEngine();

interface AutoOptimizedCardProps {
  pipeline: UseOptimizationPipelineReturn;
  /** The original text the pipeline is comparing against (snapshot at click time). */
  originalText: string;
  /** What's currently in the textarea (used for diff vs original). */
  currentText: string;
  /** What was in the textarea BEFORE the most recent Apply — used for Undo. */
  preApplyText: string | null;
  /** Click "Use this" — replaces textarea + records applied. */
  onApply: (text: string) => void;
  /** Click "Undo" — restores pre-apply text. */
  onUndo: () => void;
  /** Click "✨ AI Re-run" — full pipeline reset + rerun with current text. */
  onRerun: () => void;
  /** Click "Stop" — abort the in-flight optimize. */
  onAbort: () => void;
}

/**
 * Auto-Optimized Card — placed directly under the composer textarea.
 *
 * Lives independently of the rest of the pipeline UI so the user can always
 * see "what changed and why" relative to their original text. When the
 * pipeline hasn't run, this component returns null and the layout collapses
 * (no empty placeholder).
 *
 * States (driven by pipeline.state):
 *   running      — live progress + current best text + diff
 *   applied      — Use this was clicked; badge + Undo button
 *   done         — finalize result + score deltas + diff
 *   skipped      — Stage 3 skipped because score ≥ threshold
 *   error        — Stage 3 failed; show error + retry
 */
export function AutoOptimizedCard(props: AutoOptimizedCardProps) {
  const { pipeline, originalText, currentText, preApplyText, onApply, onUndo, onRerun, onAbort } = props;
  const { state, bestOptimize, retryStage } = pipeline;
  const t = useT();

  // Don't render anything until Stage 3 has started (running or done).
  // skipped/error come with empty rounds; we handle those explicitly below.
  const showCard =
    state.activeStages.optimize ||
    state.rounds.length > 0 ||
    state.status === 'done' ||
    (state.status === 'error' && state.errorStage === 'optimize');

  if (!showCard) return null;

  const lastRound = bestOptimize;
  const optimizedText = lastRound?.bestText ?? '';
  const isApplied = state.appliedText !== null && state.appliedText === currentText;

  // Edge case: when MiniMaxi's 5 rounds can't beat the original score, the
  // auto-optimize route returns the **original text** as the best. If we
  // surface "Use this" then, clicking it would be a no-op (setText(sameText))
  // — confusing. Detect this and hide the button + show a "no improvement"
  // hint instead.
  const noImprovement = optimizedText === originalText && optimizedText.length > 0;

  // Compute score delta if both are non-empty
  let originalScore = 0;
  let optimizedScore = 0;
  let scoreDelta = 0;
  if (originalText.trim().length >= 3) {
    const oResult = engine.evaluate({
      text: originalText,
      platform: 'x',
      isThread: false,
      hasMedia: false,
    });
    originalScore = oResult.score;
  }
  if (optimizedText.trim().length >= 3) {
    const nResult = engine.evaluate({
      text: optimizedText,
      platform: 'x',
      isThread: false,
      hasMedia: false,
    });
    optimizedScore = nResult.score;
  }
  scoreDelta = optimizedScore - originalScore;

  // Branch on outcome
  if (state.status === 'error' && state.errorStage === 'optimize') {
    return (
      <ErrorCard
        message={state.errorMessage ?? 'Auto-Optimize failed'}
        onRetry={() => {
          void retryStage('optimize');
        }}
      />
    );
  }

  // Skipped (no rounds but completed — score ≥ threshold)
  if (state.status === 'done' && state.rounds.length === 0) {
    return <SkippedCard score={originalScore} threshold={75} />;
  }

  return (
    <div
      data-testid="auto-optimized-card"
      data-state={
        state.activeStages.optimize
          ? 'running'
          : isApplied
            ? 'applied'
            : state.status === 'done'
              ? 'done'
              : 'idle'
      }
      style={{
        backgroundColor: colors.bgSecondary,
        border: `1px solid ${isApplied ? colors.accent.green : colors.border}`,
        borderLeft: `3px solid ${isApplied ? colors.accent.green : colors.accent.blue}`,
        borderRadius: 16,
        padding: 16,
        fontFamily: fonts.family,
        color: colors.textPrimary,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <Header
        state={state}
        isApplied={isApplied}
        lastRound={lastRound}
        originalScore={originalScore}
        optimizedScore={optimizedScore}
        scoreDelta={scoreDelta}
        onAbort={onAbort}
      />

      {/* Diff display */}
      {lastRound && originalText.trim().length > 0 && optimizedText.trim().length > 0 ? (
        <DiffView
          before={originalText}
          after={optimizedText}
          isApplied={isApplied}
        />
      ) : null}

      {/* Metrics row */}
      {lastRound ? (
        <div
          style={{
            display: 'flex',
            gap: 16,
            fontSize: 12,
            color: colors.textSecondary,
            flexWrap: 'wrap',
          }}
        >
          <Metric label={t('auto.score_metric')} value={`${optimizedScore}`} accent={colors.accent.blue} />
          <Metric
            label={t('auto.delta_metric')}
            value={`${scoreDelta >= 0 ? '+' : ''}${scoreDelta}`}
            accent={scoreDelta > 0 ? colors.accent.green : scoreDelta < 0 ? colors.accent.red : colors.textSecondary}
          />
          <Metric label={t('auto.length_metric')} value={`${optimizedText.length}/280`} accent={optimizedText.length > 280 ? colors.accent.red : colors.textSecondary} />
          <Metric label={t('auto.rounds_metric')} value={`${state.rounds.length}/5`} accent={colors.textSecondary} />
        </div>
      ) : null}

      {state.activeStages.optimize && state.rounds.length > 0 ? (
        <ProgressBar rounds={state.rounds} />
      ) : null}

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        {state.activeStages.optimize ? (
          <button
            type="button"
            onClick={onAbort}
            data-testid="auto-optimized-abort"
            style={{
              backgroundColor: 'transparent',
              color: colors.textPrimary,
              border: `1px solid ${colors.border}`,
              borderRadius: radius.full,
              padding: '6px 14px',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {t('common.abort')}
          </button>
        ) : null}

        {isApplied ? (
          <>
            <button
              type="button"
              onClick={onUndo}
              data-testid="auto-optimized-undo"
              aria-label={t('common.undo')}
              style={{
                backgroundColor: 'transparent',
                color: colors.textPrimary,
                border: `1px solid ${colors.border}`,
                borderRadius: radius.full,
                padding: '6px 14px',
                fontSize: 12,
                fontWeight: 600,
                cursor: preApplyText === null ? 'not-allowed' : 'pointer',
                opacity: preApplyText === null ? 0.5 : 1,
              }}
            >
              {t('common.undo')}
            </button>
            <button
              type="button"
              onClick={onRerun}
              data-testid="auto-optimized-rerun"
              style={{
                backgroundColor: colors.accent.blue,
                color: '#fff',
                border: 'none',
                borderRadius: radius.full,
                padding: '6px 14px',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {t('common.rerun')}
            </button>
          </>
        ) : lastRound ? (
          noImprovement ? (
            <>
              <span
                data-testid="auto-optimized-no-improvement"
                style={{
                  fontSize: 12,
                  color: colors.textSecondary,
                  padding: '6px 10px',
                }}
              >
                ✓ {t('common.couldnt_beat', { score: optimizedScore })}
              </span>
              <button
                type="button"
                onClick={onRerun}
                data-testid="auto-optimized-rerun"
                style={{
                  backgroundColor: 'transparent',
                  color: colors.textSecondary,
                  border: `1px solid ${colors.border}`,
                  borderRadius: radius.full,
                  padding: '6px 14px',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {t('common.rerun')}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => onApply(optimizedText)}
                data-testid="auto-optimized-use"
                aria-label={t('common.use_this') + ` (${optimizedScore})`}
                style={{
                  backgroundColor: colors.accent.green,
                  color: '#fff',
                  border: 'none',
                  borderRadius: radius.full,
                  padding: '6px 18px',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {t('common.use_this')}
              </button>
              <button
                type="button"
                onClick={onRerun}
                data-testid="auto-optimized-rerun"
                style={{
                  backgroundColor: 'transparent',
                  color: colors.textSecondary,
                  border: `1px solid ${colors.border}`,
                  borderRadius: radius.full,
                  padding: '6px 14px',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {t('common.rerun')}
              </button>
            </>
          )
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Header({
  state,
  isApplied,
  lastRound,
  originalScore,
  optimizedScore,
  scoreDelta,
  onAbort,
}: {
  state: UseOptimizationPipelineReturn['state'];
  isApplied: boolean;
  lastRound: { round: number; bestText: string; bestScore: number } | null;
  originalScore: number;
  optimizedScore: number;
  scoreDelta: number;
  onAbort: () => void;
}) {
  const t = useT();
  const isRunning = state.activeStages.optimize;
  const isError = state.status === 'error' && state.errorStage === 'optimize';
  const label = isError
    ? t('auto.error_label')
    : isRunning
      ? t('auto.running_label')
      : isApplied
        ? t('auto.applied_done_label')
        : t('auto.optimized_label');
  const color = isError ? colors.accent.red : isApplied ? colors.accent.green : colors.accent.blue;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span
          data-testid="auto-optimized-header"
          style={{ fontSize: 14, fontWeight: 700, color }}
        >
          {label}
        </span>
        {isRunning && lastRound ? (
          <span style={{ fontSize: 11, color: colors.textSecondary }}>
            Round {state.rounds.length}/5 — current best {lastRound.bestScore}
          </span>
        ) : null}
        {!isRunning && lastRound ? (
          <span style={{ fontSize: 11, color: colors.textSecondary }}>
            Round {state.rounds.length}/5
          </span>
        ) : null}
      </div>
      {/* Mini-score-delta badge */}
      {!isRunning && lastRound ? (
        <span
          data-testid="auto-optimized-score-delta"
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: scoreDelta > 0 ? colors.accent.green : scoreDelta < 0 ? colors.accent.red : colors.textSecondary,
          }}
        >
          {scoreDelta > 0 ? '+' : ''}
          {scoreDelta} ({originalScore} → {optimizedScore})
        </span>
      ) : null}
    </div>
  );
}

function ProgressBar({ rounds }: { rounds: Array<{ round: number; bestScore: number }> }) {
  // Each round is ~20% of the bar. Cap at 100% so we don't overshoot when
  // the server returns 5 results.
  const pct = Math.min(100, Math.max(0, rounds.length * 20));
  return (
    <div
      style={{
        height: 4,
        backgroundColor: colors.bgTertiary,
        borderRadius: radius.full,
        overflow: 'hidden',
      }}
    >
      <div
        data-testid="auto-optimized-progress"
        style={{
          width: `${pct}%`,
          height: '100%',
          backgroundColor: colors.accent.green,
          transition: 'width 250ms ease',
        }}
      />
    </div>
  );
}

function Metric({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: string;
}) {
  const t = useT();
  return (
    <span style={{ display: 'inline-flex', gap: 4, alignItems: 'baseline' }}>
      <span style={{ color: colors.textTertiary }}>{label}</span>
      <span style={{ color: accent, fontFamily: fonts.mono, fontWeight: 700 }}>{value}</span>
    </span>
  );
}

function DiffView({
  before,
  after,
  isApplied,
}: {
  before: string;
  after: string;
  isApplied: boolean;
}) {
  const t = useT();
  const segments = diffWords(before, after);
  return (
    <div
      data-testid="auto-optimized-diff"
      style={{
        backgroundColor: colors.bgTertiary,
        border: `1px solid ${colors.border}`,
        borderRadius: radius.md,
        padding: 10,
        fontSize: 13,
        lineHeight: 1.5,
        fontFamily: fonts.family,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        // Slight green tint when this version is currently in the textarea
        background: isApplied ? colors.accent.green + '0a' : undefined,
      }}
    >
      {segments.map((seg, i) => (
        <DiffSegmentView key={i} segment={seg} />
      ))}
    </div>
  );
}

function DiffSegmentView({ segment }: { segment: DiffSegment }) {
  if (segment.kind === 'keep') {
    return (
      <span style={{ color: colors.textPrimary }} data-segment="keep">
        {segment.text}
      </span>
    );
  }
  if (segment.kind === 'del') {
    return (
      <span
        style={{
          color: colors.accent.red,
          textDecoration: 'line-through',
          backgroundColor: colors.accent.red + '14',
        }}
        data-segment="del"
      >
        {segment.text}
      </span>
    );
  }
  return (
    <span
      style={{
        color: colors.accent.green,
        backgroundColor: colors.accent.green + '22',
        borderRadius: 2,
      }}
      data-segment="ins"
    >
      {segment.text}
    </span>
  );
}

function ErrorCard({ message, onRetry }: { message: string; onRetry: () => void }) {
  const t = useT();
  return (
    <div
      data-testid="auto-optimized-error"
      style={{
        backgroundColor: colors.accent.red + '14',
        border: `1px solid ${colors.accent.red}66`,
        borderLeft: `3px solid ${colors.accent.red}`,
        borderRadius: 16,
        padding: 16,
        fontFamily: fonts.family,
        color: colors.accent.red,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexWrap: 'wrap',
      }}
    >
      <span style={{ fontSize: 14, fontWeight: 700 }}>
        ✕ Auto-Optimize failed
      </span>
      <span style={{ color: colors.textPrimary, fontSize: 13 }}>{message}</span>
      <div style={{ flex: 1 }} />
      <button
        type="button"
        onClick={onRetry}
        data-testid="auto-optimized-retry"
        style={{
          backgroundColor: colors.accent.red,
          color: '#fff',
          border: 'none',
          borderRadius: radius.full,
          padding: '6px 14px',
          fontSize: 12,
          fontWeight: 700,
          cursor: 'pointer',
        }}
      >
        Retry Stage 3
      </button>
    </div>
  );
}

function SkippedCard({ score, threshold }: { score: number; threshold: number }) {
  const t = useT();
  return (
    <div
      data-testid="auto-optimized-skipped"
      style={{
        backgroundColor: colors.bgSecondary,
        border: `1px solid ${colors.border}`,
        borderLeft: `3px solid ${colors.accent.yellow}`,
        borderRadius: 16,
        padding: 12,
        fontFamily: fonts.family,
        color: colors.textPrimary,
        fontSize: 13,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <span style={{ color: colors.accent.yellow }}>⏭</span>
      <span>
        <strong>{t('common.skipped')}</strong> — {t('auto.skipped_full', { score })}
      </span>
    </div>
  );
}

// Reference to ensure we use this component somewhere to keep tree-shaker honest
export const __AUTO_OPT_PROGRESS__: typeof ProgressBar = 'function' as never;
// (DiffSegment is exported via word-diff)