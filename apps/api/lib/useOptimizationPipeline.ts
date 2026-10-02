'use client';

import { useCallback, useEffect, useReducer, useRef } from 'react';
import { type Locale } from './i18n';

export type PipelineStatus = 'idle' | 'running' | 'done' | 'error';

export interface OptimizeRound {
  round: number;
  bestText: string;
  bestScore: number;
}

export interface PipelineState {
  status: PipelineStatus;
  analysis: { score: number; tier: string } | null;
  rounds: OptimizeRound[];
  textSnapshot: string;
  activeStages: { analyze: boolean; optimize: boolean };
  errorStage: 'analyze' | 'optimize' | null;
  errorMessage: string | null;
  appliedText: string | null;
  overLimit: boolean;
  // v9 — progress tracking
  /** Wall-clock time (ms) when each stage began; null if stage not started. */
  stageStartedAt: { analyze: number | null; optimize: number | null };
  /** Wall-clock time (ms) recorded on each OPTIMIZE_ROUND dispatch. Used to
   * derive ETA from the gap between the last two rounds. */
  roundTimestamps: number[];
  /** Max rounds requested by client; server caps to 5 and may stop early. */
  optimizeMaxRounds: number;
}

export const PIPELINE_INITIAL_STATE: PipelineState = {
  status: 'idle',
  analysis: null,
  rounds: [],
  textSnapshot: '',
  activeStages: { analyze: false, optimize: false },
  errorStage: null,
  errorMessage: null,
  appliedText: null,
  overLimit: false,
  stageStartedAt: { analyze: null, optimize: null },
  roundTimestamps: [],
  optimizeMaxRounds: 5,
};

export type PipelineAction =
  | { type: 'START'; textSnapshot: string; maxRounds?: number }
  | { type: 'STAGE_BEGIN'; stage: 'analyze' | 'optimize' }
  | { type: 'ANALYZE_SUCCESS'; result: { score: number; tier: string } }
  | { type: 'ANALYZE_FAIL'; message: string }
  | { type: 'OPTIMIZE_ROUND'; round: OptimizeRound }
  | { type: 'OPTIMIZE_SUCCESS'; finalRound: OptimizeRound }
  | { type: 'OPTIMIZE_FAIL'; message: string }
  | { type: 'STAGE_END'; stage: 'analyze' | 'optimize' }
  | { type: 'ABORT' }
  | { type: 'APPLY'; text: string }
  | { type: 'RESET' };

/** Reducer — exported for unit tests so the pipeline state machine can be
 * exercised without React. */
export function reducer(state: PipelineState, action: PipelineAction): PipelineState {
  switch (action.type) {
    case 'START':
      return {
        ...PIPELINE_INITIAL_STATE,
        status: 'running',
        textSnapshot: action.textSnapshot,
        activeStages: { analyze: true, optimize: false },
        stageStartedAt: { analyze: Date.now(), optimize: null },
        roundTimestamps: [],
        optimizeMaxRounds: action.maxRounds ?? 5,
      };
    case 'STAGE_BEGIN':
      return {
        ...state,
        activeStages: { ...state.activeStages, [action.stage]: true },
        stageStartedAt: {
          ...state.stageStartedAt,
          [action.stage]: Date.now(),
        },
      };
    case 'ANALYZE_SUCCESS':
      return {
        ...state,
        analysis: action.result,
        activeStages: { ...state.activeStages, analyze: false },
      };
    case 'ANALYZE_FAIL':
      return {
        ...state,
        status: 'error',
        activeStages: { analyze: false, optimize: false },
        errorStage: 'analyze',
        errorMessage: action.message,
      };
    case 'OPTIMIZE_ROUND': {
      if (state.rounds.find((r) => r.round === action.round.round)) return state;
      return {
        ...state,
        rounds: [...state.rounds, action.round],
        roundTimestamps: [...state.roundTimestamps, Date.now()],
      };
    }
    case 'OPTIMIZE_SUCCESS': {
      const hasFinal = state.rounds.find((r) => r.round === action.finalRound.round);
      const rounds = hasFinal ? state.rounds : [...state.rounds, action.finalRound];
      return {
        ...state,
        rounds,
        activeStages: { ...state.activeStages, optimize: false },
        status: state.status === 'error' ? state.status : 'done',
      };
    }
    case 'OPTIMIZE_FAIL':
      return {
        ...state,
        activeStages: { ...state.activeStages, optimize: false },
        errorStage: 'optimize',
        errorMessage: action.message,
        status: state.analysis ? state.status : 'error',
      };
    case 'STAGE_END':
      return {
        ...state,
        activeStages: { ...state.activeStages, [action.stage]: false },
      };
    case 'ABORT':
      return {
        ...state,
        status: 'idle',
        activeStages: { analyze: false, optimize: false },
        stageStartedAt: { analyze: null, optimize: null },
        roundTimestamps: [],
      };
    case 'APPLY':
      return { ...state, appliedText: action.text, overLimit: action.text.length > 280 };
    case 'RESET':
      return { ...PIPELINE_INITIAL_STATE };
    default:
      return state;
  }
}

export interface UseOptimizationPipelineOptions {
  authToken?: string | null;
  locale?: Locale;
  skipOptimizeThreshold?: number;
}

export interface UseOptimizationPipelineReturn {
  state: PipelineState;
  start: (text: string, options?: { maxRounds?: number }) => void;
  abort: () => void;
  reset: () => void;
  apply: (text: string) => void;
  retryStage: (stage: 'analyze' | 'optimize') => Promise<void>;
  bestOptimize: OptimizeRound | null;
  /** 0-100 — analyze is always 20; optimize scales by rounds / maxRounds. */
  progressPercent: number;
  /** null until we have ≥ 2 round timestamps to extrapolate. */
  etaSeconds: number | null;
  /** Which stage the pipeline is currently in (for progress UI). */
  currentStage: 'analyze' | 'optimize' | null;
}

/**
 * v9 — pure selector for progress percent. Exported so unit tests can verify
 * the calculation without rendering React.
 *
 * Analyze is always 20%. Optimize scales linearly: 20 + (rounds / maxRounds)
 * × 80, clamped to 100. This means a 3-round optimize reaches 100% after the
 * 3rd round (same as a 5-round optimize after the 5th).
 */
export function computeProgressPercent(state: PipelineState): number {
  if (state.activeStages.analyze) return 20;
  const max = Math.max(state.optimizeMaxRounds, 1);
  const pct = 20 + (state.rounds.length / max) * 80;
  return Math.min(100, Math.round(pct));
}

/**
 * v9 — pure selector for ETA in seconds. Requires at least 2 round timestamps
 * so we can extrapolate from the most recent round gap (avoids the first
 * round's outlier startup cost).
 */
export function computeEtaSeconds(state: PipelineState): number | null {
  if (state.roundTimestamps.length < 2) return null;
  const last2 = state.roundTimestamps.slice(-2);
  const intervalMs = last2[1] - last2[0];
  const intervalSec = intervalMs / 1000;
  if (intervalSec <= 0) return null;
  const remaining = state.optimizeMaxRounds - state.rounds.length;
  if (remaining <= 0) return 0;
  return Math.max(1, Math.round(intervalSec * remaining));
}

const DEFAULT_SKIP_THRESHOLD = 75;

export function useOptimizationPipeline(
  options: UseOptimizationPipelineOptions = {},
): UseOptimizationPipelineReturn {
  const { authToken, locale, skipOptimizeThreshold = DEFAULT_SKIP_THRESHOLD } = options;
  const [state, dispatch] = useReducer(reducer, PIPELINE_INITIAL_STATE);
  const abortRef = useRef<AbortController | null>(null);

  const abort = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    dispatch({ type: 'ABORT' });
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    dispatch({ type: 'RESET' });
  }, []);

  const apply = useCallback((text: string) => {
    dispatch({ type: 'APPLY', text });
  }, []);

  /**
   * Run the pipeline: analyze → auto-optimize (skipped if score already
   * ≥ threshold). Stage 2 "rewrite × 3" was removed in v8 — auto-optimize
   * covers the use case and produces a single best-version with full v6
   * scoring signal injection.
   */
  const start = useCallback(
    (text: string, options?: { maxRounds?: number }) => {
      const controller = new AbortController();
      abortRef.current?.abort();
      abortRef.current = controller;
      const signal = controller.signal;

      const maxRounds = options?.maxRounds ?? 5;
      dispatch({ type: 'START', textSnapshot: text, maxRounds });

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) headers.Authorization = `Bearer ${authToken}`;

      (async () => {
        // Stage 1: analyze
        try {
          const res = await fetch('/api/analyze', {
            method: 'POST',
            headers,
            signal,
            body: JSON.stringify({
              content: text,
              platform: 'x',
              isThread: false,
              hasMedia: false,
            }),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error((err as { error?: string }).error ?? `Server ${res.status}`);
          }
          const data = await res.json();
          const score = (data.data as { score: number }).score;
          const tier = (data.data as { tier: string }).tier;
          dispatch({ type: 'ANALYZE_SUCCESS', result: { score, tier } });

          // Decide whether to skip Stage 2 (auto-optimize)
          const skipOptimize = score >= skipOptimizeThreshold;

          // Stage 2: auto-optimize (unless skipped)
          if (skipOptimize) return;

          // v9 — mark optimize stage begin for progress UI.
          dispatch({ type: 'STAGE_BEGIN', stage: 'optimize' });

          try {
            const o = await fetch('/api/tweets/auto-optimize', {
              method: 'POST',
              headers,
              signal,
              body: JSON.stringify({
                content: text,
                maxRounds,
                hasMedia: false,
                isQuoteTweet: false,
              }),
            });
            if (!o.ok) {
              const err = await o.json().catch(() => ({}));
              throw new Error((err as { error?: string }).error ?? `Server ${o.status}`);
            }
            const od = await o.json();
            const rounds = ((od.data as { rounds?: Array<{ round: number; bestText: string; bestScore: number }> }).rounds ?? []);
            for (const r of rounds) {
              if (signal.aborted) return;
              dispatch({ type: 'OPTIMIZE_ROUND', round: r });
              // tiny delay so the UI animates round-by-round
              await new Promise((res) => setTimeout(res, 60));
            }
            const lastRound = rounds[rounds.length - 1];
            if (lastRound) {
              dispatch({ type: 'OPTIMIZE_SUCCESS', finalRound: lastRound });
            } else {
              dispatch({ type: 'OPTIMIZE_FAIL', message: 'No rounds returned' });
            }
          } catch (err) {
            if (signal.aborted) return;
            const message = err instanceof Error ? err.message : 'Auto-optimize failed';
            dispatch({ type: 'OPTIMIZE_FAIL', message });
          }
        } catch (err) {
          if (signal.aborted) return;
          const message = err instanceof Error ? err.message : 'Analyze failed';
          dispatch({ type: 'ANALYZE_FAIL', message });
        }
      })();
    },
    [authToken, skipOptimizeThreshold],
  );

  const retryStage = useCallback(
    async (stage: 'analyze' | 'optimize') => {
      if (state.status !== 'error') return;
      const text = state.textSnapshot;
      if (!text) return;
      // For simplicity, retry = re-run the whole pipeline against the snapshot.
      // (Single-stage retry would require per-stage abort/refetch wiring that's
      // not worth the complexity for v1.)
      start(text);
    },
    [state, start],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const bestOptimize =
    state.rounds.length > 0
      ? state.rounds.reduce((b, r) => (r.bestScore > b.bestScore ? r : b))
      : null;

  // locale is consumed by callers via the t() helper from i18n.ts; the
  // pipeline hook itself doesn't need to thread it through.
  void locale;

  // v9 — progress selectors. Recomputed every render; reducer is the
  // authoritative state. Avoid useMemo: state changes are infrequent and the
  // selectors are O(1) / O(n) with n ≤ 5.
  const currentStage: 'analyze' | 'optimize' | null = state.activeStages.analyze
    ? 'analyze'
    : state.activeStages.optimize
      ? 'optimize'
      : null;

  return {
    state,
    start,
    abort,
    reset,
    apply,
    retryStage,
    bestOptimize,
    progressPercent: computeProgressPercent(state),
    etaSeconds: computeEtaSeconds(state),
    currentStage,
  };
}