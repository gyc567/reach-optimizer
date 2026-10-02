'use client';

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ScoreEngine } from '@reach/rules-engine';
import { colors, fonts, radius } from '@lib/styles';
import { diffWords } from '@lib/word-diff';
import { useT } from '@lib/i18n-client';
import {
  buildPostToXUrl,
  copyTextToClipboard,
  encodedIntentUrlLength,
  isTweetTooLong,
  TWEET_MAX_LEN,
  URL_WARN_LENGTH,
} from '@lib/tweet-share';
import type { UseOptimizationPipelineReturn } from '@lib/useOptimizationPipeline';

interface AutoOptimizedCardProps {
  pipeline: UseOptimizationPipelineReturn;
  /** Original text the pipeline is comparing against. */
  originalText: string;
  /** What's currently in the textarea (live). */
  currentText: string;
  /** Click Re-run — fresh pipeline. */
  onRerun: () => void;
  /** Click Stop — abort in-flight optimize. */
  onAbort: () => void;
}

const engine = new ScoreEngine();

/**
 * v7 — AutOptimizedCard UX rebuild:
 *   - Optimized text shown as PLAIN TEXT in a prominent, pre-selection block.
 *     No line-through, no background-color markup — the previous diff overlay
 *     made the optimized text unusable for copy/paste.
 *   - Two new actions: 📋 Copy (clipboard) and 🐦 Post to 𝕏 (x.com intent URL).
 *   - "Use this" / "Undo" removed — covered by Copy / Post.
 *   - Diff folded under "Show changes" — visible on demand only.
 *
 * Safety:
 *   - Copy: clipboard API → legacy execCommand fallback
 *   - Post: <a target="_blank" rel="noopener noreferrer"> + URL length warn
 *   - State machine: 'idle' | 'copied' | 'error' for in-button feedback
 *   - Reset copied state when optimized text changes (avoids stale feedback)
 */
export function AutoOptimizedCard(props: AutoOptimizedCardProps) {
  const { pipeline, originalText, onRerun, onAbort } = props;
  const { state, retryStage } = pipeline;
  const t = useT();
  const cardRef = useRef<HTMLDivElement | null>(null);

  const [copiedState, setCopiedState] = useState<'idle' | 'copied' | 'error'>('idle');
  const [showChanges, setShowChanges] = useState(false);
  const copyTimerRef = useRef<number | null>(null);

  const showCard =
    state.activeStages.optimize ||
    state.rounds.length > 0 ||
    (state.status === 'error' && state.errorStage === 'optimize') ||
    (state.status === 'done' && state.analysis !== null);

  // Scroll into view the first time the panel becomes visible.
  useLayoutEffect(() => {
    if (!showCard) return;
    const tryScroll = () => {
      const el = cardRef.current;
      if (!el) return;
      try {
        el.scrollIntoView({ behavior: 'auto', block: 'center' });
      } catch {
        const rect = el.getBoundingClientRect();
        const targetTop = window.scrollY + rect.top - 80;
        window.scrollTo({ top: Math.max(0, targetTop), behavior: 'auto' });
      }
    };
    tryScroll();
    const t1 = setTimeout(tryScroll, 60);
    const t2 = setTimeout(tryScroll, 200);
    const t3 = setTimeout(tryScroll, 500);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [showCard, state.rounds.length]);

  const lastRound = state.rounds[state.rounds.length - 1] ?? null;
  const optimizedText = lastRound?.bestText ?? '';
  const noImprovement =
    optimizedText === originalText && optimizedText.length > 0;

  // Compute score delta
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

  // Reset copiedState when optimizedText changes (re-run, etc.)
  useEffect(() => {
    setCopiedState('idle');
    if (copyTimerRef.current !== null) {
      clearTimeout(copyTimerRef.current);
      copyTimerRef.current = null;
    }
  }, [optimizedText]);

  // Cleanup the copy timer on unmount
  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) {
        clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  const handleCopy = async () => {
    const ok = await copyTextToClipboard(optimizedText);
    setCopiedState(ok ? 'copied' : 'error');
    if (copyTimerRef.current !== null) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = window.setTimeout(() => {
      setCopiedState('idle');
      copyTimerRef.current = null;
    }, 1500);
  };

  const handlePostClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (encodedIntentUrlLength(optimizedText) > URL_WARN_LENGTH) {
      e.preventDefault();
      // Falls back to Copy so user can paste manually.
      void copyTextToClipboard(optimizedText);
      window.alert(t('common.tweet_too_long', { len: optimizedText.length }));
    }
  };

  // Branch on outcome
  if (state.status === 'error' && state.errorStage === 'optimize') {
    return (
      <ErrorCard
        message={state.errorMessage ?? t('auto.error_label')}
        onRetry={() => {
          void retryStage('optimize');
        }}
      />
    );
  }

  // Skipped (no rounds but completed — score ≥ threshold)
  if (state.status === 'done' && state.rounds.length === 0 && state.analysis !== null) {
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
          <strong>{t('common.skipped')}</strong> — {t('auto.skipped_full', { score: state.analysis.score })}
        </span>
      </div>
    );
  }

  const isRunning = state.activeStages.optimize;
  const headerLabel = isRunning
    ? t('auto.running_label')
    : state.status === 'error'
      ? t('auto.error_label')
      : t('auto.optimized_label');
  const headerColor = state.status === 'error' ? colors.accent.red : colors.accent.blue;
  const postHref = buildPostToXUrl(optimizedText);
  const tooLong = isTweetTooLong(optimizedText);
  const hasText = optimizedText.trim().length > 0;

  return (
    <div
      data-testid="auto-optimized-card"
      data-state={
        isRunning
          ? 'running'
          : state.status === 'done'
            ? 'done'
            : state.status === 'error'
              ? 'error'
              : 'idle'
      }
      style={{
        backgroundColor: colors.bgSecondary,
        border: `1px solid ${colors.border}`,
        borderLeft: `3px solid ${headerColor}`,
        borderRadius: 16,
        padding: 16,
        fontFamily: fonts.family,
        color: colors.textPrimary,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
      ref={cardRef}
    >
      <Header
        headerLabel={headerLabel}
        headerColor={headerColor}
        lastRound={lastRound}
        isRunning={isRunning}
        originalScore={originalScore}
        optimizedScore={optimizedScore}
        scoreDelta={scoreDelta}
      />

      {/* Plain text block — the v7 headline change */}
      {lastRound && hasText ? (
        <PlainTextBlock
          text={optimizedText}
          copiedFlash={copiedState === 'copied'}
        />
      ) : null}

      {/* Metrics */}
      {lastRound ? (
        <div
          data-testid="auto-optimized-metrics"
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
            accent={
              scoreDelta > 0
                ? colors.accent.green
                : scoreDelta < 0
                  ? colors.accent.red
                  : colors.textSecondary
            }
          />
          <Metric
            label={t('auto.length_metric')}
            value={`${optimizedText.length}/${TWEET_MAX_LEN}`}
            accent={tooLong ? colors.accent.red : colors.textSecondary}
          />
          <Metric label={t('auto.rounds_metric')} value={`${state.rounds.length}/5`} accent={colors.textSecondary} />
        </div>
      ) : null}

      {/* Folded diff — visible if expanded */}
      {lastRound && hasText && showChanges ? (
        <DiffView originalText={originalText} optimizedText={optimizedText} />
      ) : null}

      {/* Toggle changes + action buttons */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        {/* Left: Show/Hide changes */}
        {lastRound && hasText ? (
          <button
            type="button"
            onClick={() => setShowChanges((v) => !v)}
            data-testid="auto-optimized-show-changes"
            aria-label={t('common.show_changes_label')}
            aria-expanded={showChanges}
            style={{
              backgroundColor: 'transparent',
              color: colors.textSecondary,
              border: 'none',
              padding: '6px 4px',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: fonts.family,
              textDecoration: 'underline',
              textUnderlineOffset: 2,
            }}
          >
            {showChanges ? `▾ ${t('common.hide_changes')}` : `▸ ${t('common.show_changes')}`}
          </button>
        ) : (
          <span />
        )}

        {/* Right: action buttons */}
        <div style={{ display: 'flex', gap: 8 }}>
          {isRunning ? (
            <AbortButton onAbort={onAbort} t={t} />
          ) : null}

          {lastRound && !isRunning ? (
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
                  {t('common.couldnt_beat', { score: optimizedScore })}
                </span>
                <ReRunButton onRerun={onRerun} t={t} />
              </>
            ) : (
              <>
                <CopyButton
                  copiedState={copiedState}
                  disabled={!hasText}
                  onClick={handleCopy}
                  t={t}
                />
                <PostToXButton
                  href={postHref}
                  onClick={handlePostClick}
                  disabled={!hasText}
                  tooLong={tooLong}
                  t={t}
                />
                <ReRunButton onRerun={onRerun} t={t} />
              </>
            )
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function PlainTextBlock({ text, copiedFlash }: { text: string; copiedFlash: boolean }) {
  const t = useT();
  return (
    <div
      data-testid="auto-optimized-text"
      data-copied-flash={copiedFlash ? 'true' : 'false'}
      style={{
        backgroundColor: colors.bg,
        border: `2px solid ${copiedFlash ? colors.accent.green : colors.border}`,
        borderRadius: radius.md,
        padding: 14,
        fontSize: 15,
        lineHeight: 1.6,
        fontFamily: fonts.family,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        userSelect: 'text',
        WebkitUserSelect: 'text',
        cursor: 'text',
        transition: 'border-color 250ms ease, box-shadow 250ms ease',
        boxShadow: copiedFlash ? `0 0 0 4px ${colors.accent.green}22` : undefined,
      }}
      aria-label={t('common.copy_label')}
    >
      {text}
    </div>
  );
}

function CopyButton({
  copiedState,
  disabled,
  onClick,
  t,
}: {
  copiedState: 'idle' | 'copied' | 'error';
  disabled: boolean;
  onClick: () => void;
  t: (k: string, vars?: Record<string, string | number>) => string;
}) {
  const label =
    copiedState === 'copied'
      ? `✓ ${t('common.copied')}`
      : copiedState === 'error'
        ? `✕ ${t('common.copy_failed')}`
        : `📋 ${t('common.copy')}`;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-testid="auto-optimized-copy"
      data-copy-state={copiedState}
      aria-label={t('common.copy_label')}
      style={{
        backgroundColor: copiedState === 'copied' ? colors.accent.green : colors.accent.blue,
        color: '#fff',
        border: 'none',
        borderRadius: radius.full,
        padding: '6px 14px',
        fontSize: 12,
        fontWeight: 700,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        fontFamily: fonts.family,
        transition: 'background-color 200ms ease',
      }}
    >
      {label}
    </button>
  );
}

function PostToXButton({
  href,
  onClick,
  disabled,
  tooLong,
  t,
}: {
  href: string;
  onClick: (e: React.MouseEvent<HTMLAnchorElement>) => void;
  disabled: boolean;
  tooLong: boolean;
  t: (k: string, vars?: Record<string, string | number>) => string;
}) {
  return (
    <a
      href={href}
      onClick={onClick}
      target="_blank"
      rel="noopener noreferrer"
      data-testid="auto-optimized-post-x"
      data-too-long={tooLong ? 'true' : 'false'}
      aria-label={t('common.post_label')}
      aria-disabled={disabled}
      title={tooLong ? t('common.tweet_too_long', { len: href.length }) : undefined}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        textDecoration: 'none',
        backgroundColor: disabled
          ? colors.bgTertiary
          : tooLong
            ? colors.accent.red
            : colors.bgSecondary,
        color: disabled || tooLong ? '#fff' : colors.textPrimary,
        border: tooLong ? 'none' : `1px solid ${colors.border}`,
        borderRadius: radius.full,
        padding: '6px 14px',
        fontSize: 12,
        fontWeight: 700,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        fontFamily: fonts.family,
        pointerEvents: disabled ? 'none' : 'auto',
      }}
    >
      🐦 {t('common.post_to_x')}
    </a>
  );
}

function ReRunButton({
  onRerun,
  t,
}: {
  onRerun: () => void;
  t: (k: string, vars?: Record<string, string | number>) => string;
}) {
  return (
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
        fontFamily: fonts.family,
      }}
    >
      {t('common.rerun')}
    </button>
  );
}

function AbortButton({
  onAbort,
  t,
}: {
  onAbort: () => void;
  t: (k: string, vars?: Record<string, string | number>) => string;
}) {
  return (
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
        fontFamily: fonts.family,
      }}
    >
      {t('common.abort')}
    </button>
  );
}

function DiffView({ originalText, optimizedText }: { originalText: string; optimizedText: string }) {
  const segments = diffWords(originalText, optimizedText);
  return (
    <div
      data-testid="auto-optimized-diff"
      style={{
        backgroundColor: colors.bgTertiary,
        border: `1px dashed ${colors.border}`,
        borderRadius: radius.md,
        padding: 10,
        fontSize: 12,
        lineHeight: 1.5,
        fontFamily: fonts.mono,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        opacity: 0.85,
      }}
    >
      {segments.map((seg, i) => {
        if (seg.kind === 'keep') {
          return (
            <span key={i} style={{ color: colors.textSecondary }} data-segment="keep">
              {seg.text}
            </span>
          );
        }
        if (seg.kind === 'del') {
          return (
            <span
              key={i}
              style={{
                color: colors.accent.red,
                opacity: 0.7,
              }}
              data-segment="del"
              title="removed"
            >
              {seg.text}
            </span>
          );
        }
        return (
          <span
            key={i}
            style={{
              color: colors.accent.green,
              fontWeight: 600,
            }}
            data-segment="ins"
            title="added"
          >
            {seg.text}
          </span>
        );
      })}
    </div>
  );
}

function Header({
  headerLabel,
  headerColor,
  lastRound,
  isRunning,
  originalScore,
  optimizedScore,
  scoreDelta,
}: {
  headerLabel: string;
  headerColor: string;
  lastRound: { round: number; bestText: string; bestScore: number } | null;
  isRunning: boolean;
  originalScore: number;
  optimizedScore: number;
  scoreDelta: number;
}) {
  const t = useT();
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
          style={{ fontSize: 14, fontWeight: 700, color: headerColor }}
        >
          {headerLabel}
        </span>
        {isRunning && lastRound ? (
          <span style={{ fontSize: 11, color: colors.textSecondary }}>
            {t('auto.round_progress_running', { current: lastRound.round, score: lastRound.bestScore })}
          </span>
        ) : null}
        {!isRunning && lastRound ? (
          <span style={{ fontSize: 11, color: colors.textSecondary }}>
            {t('auto.round_progress', { current: lastRound.round })}
          </span>
        ) : null}
      </div>
      {!isRunning && lastRound ? (
        <span
          data-testid="auto-optimized-score-delta"
          style={{
            fontSize: 11,
            fontWeight: 700,
            color:
              scoreDelta > 0
                ? colors.accent.green
                : scoreDelta < 0
                  ? colors.accent.red
                  : colors.textSecondary,
          }}
        >
          {scoreDelta > 0 ? '+' : ''}
          {scoreDelta} ({originalScore} → {optimizedScore})
        </span>
      ) : null}
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
  return (
    <span style={{ display: 'inline-flex', gap: 4, alignItems: 'baseline' }}>
      <span style={{ color: colors.textTertiary }}>{label}</span>
      <span style={{ color: accent, fontFamily: fonts.mono, fontWeight: 700 }}>{value}</span>
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
      <span style={{ fontSize: 14, fontWeight: 700 }}>{t('auto.error_label')}</span>
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
        {t('auto.retry_stage_3')}
      </button>
    </div>
  );
}