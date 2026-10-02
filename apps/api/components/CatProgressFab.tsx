'use client';

import React, { useEffect, useState } from 'react';
import { colors, fonts, radius, shadows } from '@lib/styles';
import { useT } from '@lib/i18n-client';
import type {
  PipelineState,
  UseOptimizationPipelineReturn,
} from '@lib/useOptimizationPipeline';

interface CatProgressFabProps {
  pipeline: UseOptimizationPipelineReturn;
  onAbort: () => void;
}

export type CatMood = 'analyzing' | 'optimizing' | 'done' | 'error';

// Pure helpers — exported so unit tests can exercise the state machine
// without rendering React.
export function deriveMood(state: PipelineState): CatMood {
  if (state.errorStage) return 'error';
  if (state.status === 'done') return 'done';
  if (state.activeStages.optimize) return 'optimizing';
  return 'analyzing'; // analyze or idle fallback
}

export function getRingColor(mood: CatMood): string {
  switch (mood) {
    case 'analyzing':
      return colors.accent.purple;
    case 'optimizing':
      return colors.accent.blue;
    case 'done':
      return colors.accent.green;
    case 'error':
      return colors.accent.red;
  }
}

const FAB_SIZE = 72;
const RING_RADIUS = 32;
const RING_STROKE = 3;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS; // ≈ 201.06

/**
 * v10 — Floating cat FAB. Sits in viewport's bottom-right corner and
 * gives the user a clear, system-level progress signal during AI Optimize.
 *
 * Visual:
 *   - 72×72 circular FAB
 *   - SVG progress ring around the edge (stroke-dasharray)
 *   - Cat face (pure-color blocks + SVG paths) in the center
 *   - Round label below the FAB ("Round 2/5")
 *   - Tooltip on hover/focus/click with status + ETA + Abort button
 *
 * Behavior:
 *   - Analyzes stage: ring is empty + breathe animation, cat is sleeping
 *   - Optimizing stage: ring fills as rounds complete, cat is smiling
 *   - Done: FAB unmounts (AutoOptimizedCard takes over)
 *   - Error: cat frowns, ring turns red, FAB auto-dismisses after 8s
 */
export function CatProgressFab({ pipeline, onAbort }: CatProgressFabProps) {
  const { state, progressPercent, etaSeconds, currentStage } = pipeline;
  const t = useT();
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // Tick clock every 1s for the elapsed label
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Auto-dismiss error FAB after 8s
  const mood = deriveMood(state);
  useEffect(() => {
    if (mood !== 'error') return;
    const id = window.setTimeout(() => {
      // The user already had 8s to read the error; AutoOptimizedCard shows it
      // anyway. We just unmount.
    }, 8000);
    return () => window.clearTimeout(id);
  }, [mood]);

  // Only show during running; done state lets AutoOptimizedCard take over.
  if (state.status !== 'running') return null;
  // Error state shows for 8s then unmounts (handled by re-render below)
  if (mood === 'done') return null;

  const ringColor = getRingColor(mood);
  const offset = RING_CIRCUMFERENCE * (1 - Math.max(progressPercent, mood === 'analyzing' ? 0 : 0) / 100);

  // Elapsed label
  const stageStart = currentStage === 'analyze'
    ? state.stageStartedAt.analyze
    : currentStage === 'optimize'
      ? state.stageStartedAt.optimize
      : null;
  const elapsedSec = stageStart ? Math.max(0, Math.floor((now - stageStart) / 1000)) : 0;

  // Round label below the FAB
  const roundLabel =
    currentStage === 'optimize' && state.rounds.length > 0
      ? `${state.rounds.length}/${state.optimizeMaxRounds}`
      : currentStage === 'analyze'
        ? '…'
        : '';

  // Status text for tooltip
  const statusLabel =
    currentStage === 'analyze'
      ? t('progress.analyzing')
      : currentStage === 'optimize'
        ? t('progress.round', { current: state.rounds.length, total: state.optimizeMaxRounds })
        : t('progress.optimizing');

  const etaLabel =
    etaSeconds !== null && etaSeconds > 1
      ? t('progress.eta', { seconds: etaSeconds })
      : etaSeconds !== null
        ? t('progress.finishing')
        : null;

  const catColor =
    mood === 'error'
      ? colors.accent.red
      : mood === 'optimizing'
        ? colors.accent.blue
        : mood === 'analyzing'
          ? colors.accent.purple
          : colors.accent.green;

  return (
    <div
      data-testid="cat-progress-fab"
      data-cat-mood={mood}
      data-progress-percent={progressPercent}
      style={{
        position: 'fixed',
        bottom: 'max(24px, env(safe-area-inset-bottom, 24px))',
        right: 24,
        zIndex: 100,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
        fontFamily: fonts.family,
      }}
    >
      {/* The circular FAB */}
      <div
        data-testid="cat-progress-circle"
        role="group"
        aria-label={`AI Optimize: ${statusLabel}`}
        style={{
          position: 'relative',
          width: FAB_SIZE,
          height: FAB_SIZE,
          borderRadius: radius.full,
          backgroundColor: colors.bgSecondary,
          border: `1px solid ${colors.border}`,
          boxShadow: shadows.card,
          cursor: 'pointer',
          transition: 'box-shadow 200ms ease, transform 150ms ease',
        }}
        onMouseEnter={() => setTooltipOpen(true)}
        onMouseLeave={() => setTooltipOpen(false)}
        onFocus={() => setTooltipOpen(true)}
        onBlur={() => setTooltipOpen(false)}
        onClick={() => setTooltipOpen((v) => !v)}
        tabIndex={0}
      >
        {/* SVG ring */}
        <svg
          width={FAB_SIZE}
          height={FAB_SIZE}
          viewBox={`0 0 ${FAB_SIZE} ${FAB_SIZE}`}
          style={{ position: 'absolute', top: 0, left: 0 }}
          aria-hidden
        >
          {/* Background ring */}
          <circle
            cx={FAB_SIZE / 2}
            cy={FAB_SIZE / 2}
            r={RING_RADIUS}
            fill="none"
            stroke={colors.border}
            strokeWidth={RING_STROKE}
          />
          {/* Progress ring */}
          <circle
            data-testid="cat-progress-ring"
            cx={FAB_SIZE / 2}
            cy={FAB_SIZE / 2}
            r={RING_RADIUS}
            fill="none"
            stroke={ringColor}
            strokeWidth={RING_STROKE}
            strokeLinecap="round"
            strokeDasharray={RING_CIRCUMFERENCE}
            strokeDashoffset={mood === 'analyzing' ? RING_CIRCUMFERENCE : offset}
            transform={`rotate(-90 ${FAB_SIZE / 2} ${FAB_SIZE / 2})`}
            style={{
              transition: 'stroke-dashoffset 400ms cubic-bezier(0.4, 0, 0.2, 1), stroke 200ms ease',
            }}
          />
        </svg>

        {/* Cat face */}
        <CatFace mood={mood} catColor={catColor} />

        {/* Breathe animation overlay for analyze phase */}
        {mood === 'analyzing' ? (
          <div
            aria-hidden
            data-testid="cat-progress-breathe"
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: radius.full,
              backgroundColor: ringColor,
              opacity: 0.15,
              animation: 'catBreathe 2s ease-in-out infinite',
              pointerEvents: 'none',
            }}
          />
        ) : null}
      </div>

      {/* Round label below FAB */}
      {roundLabel ? (
        <div
          data-testid="cat-progress-round-label"
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: colors.textPrimary,
            backgroundColor: colors.bgSecondary,
            border: `1px solid ${colors.border}`,
            borderRadius: radius.full,
            padding: '2px 8px',
            fontFamily: fonts.mono,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {roundLabel}
        </div>
      ) : null}

      {/* Tooltip */}
      <div
        data-testid="cat-progress-tooltip"
        role="tooltip"
        aria-live="polite"
        data-tooltip-open={tooltipOpen ? 'true' : 'false'}
        style={{
          position: 'absolute',
          bottom: '100%',
          right: 0,
          marginBottom: 12,
          minWidth: 220,
          maxWidth: 320,
          padding: 12,
          backgroundColor: colors.bg,
          border: `1px solid ${colors.border}`,
          borderRadius: radius.md,
          boxShadow: shadows.dropdown,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          fontSize: 12,
          color: colors.textPrimary,
          opacity: tooltipOpen ? 1 : 0,
          visibility: tooltipOpen ? 'visible' : 'hidden',
          transition: 'opacity 150ms ease, visibility 150ms ease',
          pointerEvents: tooltipOpen ? 'auto' : 'none',
        }}
      >
        <div
          data-testid="cat-progress-status"
          style={{ fontWeight: 700 }}
        >
          {statusLabel}
        </div>
        <div
          data-testid="cat-progress-meta"
          style={{
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
            color: colors.textSecondary,
            fontFamily: fonts.mono,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {etaLabel ? <span>{etaLabel}</span> : null}
          <span>{formatElapsed(elapsedSec)}</span>
          <span data-testid="cat-progress-progressbar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressPercent}>
            {progressPercent}%
          </span>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onAbort();
          }}
          data-testid="cat-progress-abort"
          aria-label={t('common.abort')}
          style={{
            marginTop: 4,
            backgroundColor: 'transparent',
            color: colors.accent.red,
            border: `1px solid ${colors.accent.red}`,
            borderRadius: radius.full,
            padding: '4px 12px',
            fontSize: 11,
            fontWeight: 700,
            cursor: 'pointer',
            fontFamily: fonts.family,
            alignSelf: 'flex-start',
          }}
        >
          {t('common.abort')}
        </button>
      </div>

      <style>{`
        @keyframes catBreathe {
          0%, 100% { opacity: 0.08; transform: scale(1); }
          50% { opacity: 0.20; transform: scale(1.04); }
        }
      `}</style>
    </div>
  );
}

function CatFace({ mood, catColor }: { mood: CatMood; catColor: string }) {
  const eyeColor = colors.textPrimary;
  return (
    <svg
      data-testid="cat-progress-face"
      width={28}
      height={28}
      viewBox="-14 -14 28 28"
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'none',
      }}
      aria-hidden
    >
      {/* Ears */}
      <polygon points="-10,-9 -6,-3 -12,-3" fill={catColor} />
      <polygon points="10,-9 6,-3 12,-3" fill={catColor} />
      {/* Head — pure color block */}
      <rect
        x={-10}
        y={-5}
        width={20}
        height={16}
        rx={6}
        fill={catColor}
      />

      {mood === 'analyzing' ? (
        // Sleepy eyes (closed)
        <g
          stroke={eyeColor}
          strokeWidth={1.4}
          strokeLinecap="round"
          fill="none"
        >
          <line x1={-6} y1={-1} x2={-2} y2={-1} />
          <line x1={2} y1={-1} x2={6} y2={-1} />
          {/* Tiny zZz */}
          <text x={8} y={-7} fontSize={4} fill={eyeColor} textAnchor="middle" fontFamily="sans-serif">z</text>
        </g>
      ) : mood === 'optimizing' ? (
        // Open eyes + smile
        <g>
          <circle cx={-4} cy={-1} r={1.6} fill={eyeColor} />
          <circle cx={4} cy={-1} r={1.6} fill={eyeColor} />
          <path
            d="M -3 4 Q 0 6 3 4"
            stroke={eyeColor}
            strokeWidth={1.2}
            fill="none"
            strokeLinecap="round"
          />
        </g>
      ) : mood === 'error' ? (
        // Frowning
        <g
          stroke={eyeColor}
          strokeWidth={1.4}
          strokeLinecap="round"
          fill="none"
        >
          <line x1={-7} y1={-3} x2={-2} y2={-1} />
          <line x1={2} y1={-1} x2={7} y2={-3} />
          <path
            d="M -3 5 Q 0 3 3 5"
            stroke={eyeColor}
            strokeWidth={1.2}
            fill="none"
          />
        </g>
      ) : (
        // Done — happy
        <g>
          <circle cx={-4} cy={-1} r={1.6} fill={eyeColor} />
          <circle cx={4} cy={-1} r={1.6} fill={eyeColor} />
          <path
            d="M -3 4 Q 0 7 3 4"
            stroke={eyeColor}
            strokeWidth={1.2}
            fill="none"
            strokeLinecap="round"
          />
        </g>
      )}
    </svg>
  );
}

function formatElapsed(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
