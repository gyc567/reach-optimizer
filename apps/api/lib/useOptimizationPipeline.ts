'use client';

import { useCallback, useEffect, useReducer, useRef } from 'react';
import type { AnalysisResult, ScoreTier } from '@reach/shared-types';
import { ANTHROPIC_MODEL } from '@reach/ai-checks';

// ---------------------------------------------------------------------------
// Pipeline state machine — single CTA one-shot optimization pipeline.
//
// Stages:
//   analyze    (Stage 1)        — POST /api/analyze             ~2-3s
//   rewrite    (Stage 2)        — POST /api/suggest {type:hook}  ~2-3s
//   optimize   (Stage 3)        — POST /api/tweets/auto-optimize 5×~5s
//
// v2 changes vs the prior single-CTA proposal:
//   * Stage 2 and Stage 3 run IN PARALLEL after Stage 1 (saves ~2-5s).
//   * Stage 3 is SKIPPED when Stage 1 score is already ≥ 75 (saves token + time).
//   * Editing the textarea does NOT abort the pipeline; pipeline runs against a
//     text snapshot taken at start. Re-click ✨ AI to refresh.
//   * Per-stage retry: only the failed stage re-runs, prior results stay.
//   * Abort cancels all in-flight fetches but preserves partial results.
//   * Each rewrite candidate and the optimizer final each have a "Use this" —
//     user keeps agency instead of waiting 25s for one final result.
// ---------------------------------------------------------------------------

export type PipelineStatus =
  | 'idle' // no pipeline started
  | 'running' // at least one stage in flight
  | 'done' // completed successfully (with or without stage 3)
  | 'error'; // at least one stage failed

export interface RewriteCandidate {
  text: string;
  score: number;
}

export interface OptimizeRound {
  round: number;
  bestText: string;
  bestScore: number;
}

export interface PipelineState {
  status: PipelineStatus;
  /** Stage 1 result. */
  analysis: AnalysisResult | null;
  /** Stage 2 rewrites — populated as they arrive. */
  rewrites: RewriteCandidate[];
  /** Stage 3 rounds — populated incrementally as auto-optimize progresses. */
  rounds: OptimizeRound[];
  /** Snapshot of text the pipeline is running against (immutable per run). */
  textSnapshot: string;
  /** Currently running stages — used to render spinners + progress. */
  activeStages: {
    analyze: boolean;
    rewrite: boolean;
    optimize: boolean;
  };
  /** First error encountered (if any). Per-stage errors are tracked separately. */
  errorStage: 'analyze' | 'rewrite' | 'optimize' | null;
  errorMessage: string | null;
  /** True after the user has applied a candidate (textarea mutated). */
  appliedText: string | null;
  /** Length warning: the latest applied text exceeded 280 chars. */
  overLimit: boolean;
}

export const PIPELINE_INITIAL_STATE: PipelineState = {
  status: 'idle',
  analysis: null,
  rewrites: [],
  rounds: [],
  textSnapshot: '',
  activeStages: { analyze: false, rewrite: false, optimize: false },
  errorStage: null,
  errorMessage: null,
  appliedText: null,
  overLimit: false,
};

// Pure reducer — every state transition explicit and testable.
export type PipelineAction =
  | { type: 'START'; textSnapshot: string }
  | { type: 'STAGE_BEGIN'; stage: 'analyze' | 'rewrite' | 'optimize' }
  | { type: 'ANALYZE_SUCCESS'; result: AnalysisResult }
  | { type: 'ANALYZE_FAIL'; message: string }
  | { type: 'REWRITE_SUCCESS'; candidates: RewriteCandidate[] }
  | { type: 'REWRITE_FAIL'; message: string }
  | { type: 'OPTIMIZE_ROUND'; round: OptimizeRound }
  | { type: 'OPTIMIZE_SUCCESS'; finalRound: OptimizeRound }
  | { type: 'OPTIMIZE_FAIL'; message: string }
  | { type: 'STAGE_END'; stage: 'analyze' | 'rewrite' | 'optimize' }
  | { type: 'ABORT' }
  | { type: 'APPLY'; text: string }
  | { type: 'RESET' };

function reducer(state: PipelineState, action: PipelineAction): PipelineState {
  switch (action.type) {
    case 'START':
      // Fresh run. Preserve nothing — user explicitly re-clicked.
      return {
        ...PIPELINE_INITIAL_STATE,
        status: 'running',
        textSnapshot: action.textSnapshot,
        activeStages: { analyze: true, rewrite: false, optimize: false },
      };

    case 'STAGE_BEGIN':
      return {
        ...state,
        activeStages: { ...state.activeStages, [action.stage]: true },
        errorStage: state.errorStage === action.stage ? null : state.errorStage,
        errorMessage: state.errorStage === action.stage ? null : state.errorMessage,
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
        activeStages: { analyze: false, rewrite: false, optimize: false },
        errorStage: 'analyze',
        errorMessage: action.message,
      };

    case 'REWRITE_SUCCESS':
      return {
        ...state,
        rewrites: action.candidates,
        activeStages: { ...state.activeStages, rewrite: false },
      };

    case 'REWRITE_FAIL':
      return {
        ...state,
        activeStages: { ...state.activeStages, rewrite: false },
        errorStage: 'rewrite',
        errorMessage: action.message,
      };

    case 'OPTIMIZE_ROUND':
      // Append round if not already present (idempotent on retried emits)
      if (state.rounds.find((r) => r.round === action.round.round)) {
        return { ...state, rounds: [...state.rounds] };
      }
      return { ...state, rounds: [...state.rounds, action.round] };

    case 'OPTIMIZE_SUCCESS':
      // Final round may already be in rounds[] (from OPTIMIZE_ROUND); ensure it's there
      const hasFinal = state.rounds.find((r) => r.round === action.finalRound.round);
      const rounds = hasFinal ? state.rounds : [...state.rounds, action.finalRound];
      return {
        ...state,
        rounds,
        activeStages: { ...state.activeStages, optimize: false },
        status: state.status === 'error' ? state.status : 'done',
      };

    case 'OPTIMIZE_FAIL':
      return {
        ...state,
        activeStages: { ...state.activeStages, optimize: false },
        errorStage: 'optimize',
        errorMessage: action.message,
        // If optimize failed but other stages are done, surface partial — not error.
        status: state.analysis || state.rewrites.length > 0 ? state.status : 'error',
      };

    case 'STAGE_END':
      return {
        ...state,
        activeStages: { ...state.activeStages, [action.stage]: false },
      };

    case 'ABORT':
      // Cancel any in-flight fetches but preserve partial results the user
      // might want to read. Status returns to idle (not done) so a re-click
      // starts a clean run.
      return {
        ...state,
        status: 'idle',
        activeStages: { analyze: false, rewrite: false, optimize: false },
      };

    case 'APPLY':
      return {
        ...state,
        appliedText: action.text,
        overLimit: action.text.length > 280,
      };

    case 'RESET':
      return { ...PIPELINE_INITIAL_STATE };

    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Hook — orchestrates fetches with AbortController and dispatches reducer
// actions as each stage progresses. Stage 2 and Stage 3 start IN PARALLEL
// after Stage 1 succeeds.
// ---------------------------------------------------------------------------

export interface UseOptimizationPipelineOptions {
  /** Optional bearer token forwarded to all API calls. */
  authToken?: string | null;
  /** Score threshold above which Stage 3 is skipped. Defaults to 75. */
  skipOptimizeThreshold?: number;
}

export interface UseOptimizationPipelineReturn {
  state: PipelineState;
  /** Begin a new pipeline run against the supplied text. Cancels any in-flight run. */
  start: (text: string) => void;
  /** Abort the in-flight pipeline. Partial results stay. */
  abort: () => void;
  /** Reset to the initial empty state. */
  reset: () => void;
  /** Mark a candidate as applied to the textarea. */
  apply: (text: string) => void;
  /** Retry a single failed stage without re-running the rest. */
  retryStage: (stage: 'analyze' | 'rewrite' | 'optimize') => Promise<void>;
  /** Stable helpers for components. */
  bestRewrite: RewriteCandidate | null;
  bestOptimize: OptimizeRound | null;
  bestOverall: { text: string; score: number; source: 'rewrite' | 'optimize' } | null;
}

const TIER_THRESHOLD_FOR_SKIP = 75;

export function useOptimizationPipeline(
  options: UseOptimizationPipelineOptions = {},
): UseOptimizationPipelineReturn {
  const { authToken, skipOptimizeThreshold = TIER_THRESHOLD_FOR_SKIP } = options;
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
   * Run a single stage (used by retry). Each call creates its own
   * AbortController so it can be cancelled independently.
   */
  const runStage = useCallback(
    async (
      stage: 'analyze' | 'rewrite' | 'optimize',
      text: string,
      mediaContext: {
        hasMedia: boolean;
        mediaType?: 'image' | 'video' | 'gif' | 'poll';
        isQuoteTweet: boolean;
        quotedText?: string;
        quotedMediaType?: 'image' | 'video' | 'gif' | 'poll';
      },
      analysisForOptimize?: AnalysisResult,
    ): Promise<void> => {
      const controller = new AbortController();
      // If a global abort happens we want this stage's fetch cancelled too.
      const prev = abortRef.current;
      abortRef.current = controller;
      const signal = controller.signal;

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) headers.Authorization = `Bearer ${authToken}`;

      dispatch({ type: 'STAGE_BEGIN', stage });

      try {
        if (stage === 'analyze') {
          const res = await fetch('/api/analyze', {
            method: 'POST',
            headers,
            signal,
            body: JSON.stringify({
              content: text,
              platform: 'x',
              isThread: false,
              hasMedia: mediaContext.hasMedia,
              mediaType: mediaContext.mediaType,
              isQuoteTweet: mediaContext.isQuoteTweet,
              quotedText: mediaContext.quotedText,
              quotedMediaType: mediaContext.quotedMediaType,
            }),
          });
          if (!res.ok) {
            const errBody = await res.json().catch(() => ({}));
            throw new Error(errBody.error ?? `Server ${res.status}`);
          }
          const data = await res.json();
          dispatch({ type: 'ANALYZE_SUCCESS', result: data.data as AnalysisResult });
          // The pipeline orchestrator decides whether to also fire Stage 2 / 3.
          return;
        }

        if (stage === 'rewrite') {
          const res = await fetch('/api/suggest', {
            method: 'POST',
            headers,
            signal,
            body: JSON.stringify({ content: text, type: 'hook' }),
          });
          if (!res.ok) {
            const errBody = await res.json().catch(() => ({}));
            throw new Error(errBody.error ?? `Server ${res.status}`);
          }
          const data = await res.json();
          const suggestions: string[] = data.suggestions ?? [];
          // Score each rewrite with the local engine so the user sees relative scores
          const scored: RewriteCandidate[] = await Promise.all(
            suggestions.slice(0, 3).map(async (t) => {
              const r = await fetch('/api/analyze', {
                method: 'POST',
                headers,
                signal,
                body: JSON.stringify({
                  content: t,
                  platform: 'x',
                  isThread: false,
                  hasMedia: mediaContext.hasMedia,
                  mediaType: mediaContext.mediaType,
                  isQuoteTweet: mediaContext.isQuoteTweet,
                }),
              });
              const j = await r.json().catch(() => null);
              return { text: t, score: j?.data?.score ?? 0 };
            }),
          );
          dispatch({ type: 'REWRITE_SUCCESS', candidates: scored });
          return;
        }

        if (stage === 'optimize') {
          // Use snapshot analysis as initialScore baseline
          const initialScore = analysisForOptimize?.score ?? 0;
          const res = await fetch('/api/tweets/auto-optimize', {
            method: 'POST',
            headers,
            signal,
            body: JSON.stringify({
              content: text,
              maxRounds: 5,
              hasMedia: mediaContext.hasMedia,
              mediaType: mediaContext.mediaType,
              isQuoteTweet: mediaContext.isQuoteTweet,
              quotedMediaType: mediaContext.quotedMediaType,
            }),
          });
          if (!res.ok) {
            const errBody = await res.json().catch(() => ({}));
            throw new Error(errBody.error ?? `Server ${res.status}`);
          }
          const data = await res.json();
          const d = data.data as {
            rounds: OptimizeRound[];
            finalScore: number;
            bestText: string;
          };
          // Emit incrementally so the progress bar moves
          for (const r of d.rounds) {
            if (signal.aborted) return;
            dispatch({ type: 'OPTIMIZE_ROUND', round: r });
            // tiny delay so the UI animates round-by-round (not all at once)
            await new Promise((r) => setTimeout(r, 60));
          }
          const lastRound = d.rounds[d.rounds.length - 1] ?? {
            round: d.rounds.length,
            bestText: d.bestText,
            bestScore: d.finalScore,
          };
          dispatch({ type: 'OPTIMIZE_SUCCESS', finalRound: lastRound });
          // Suppress unused warning — initialScore kept for future enhancements
          void initialScore;
          return;
        }
      } catch (err) {
        if (controller.signal.aborted) return; // expected on user abort
        const message = err instanceof Error ? err.message : `${stage} failed`;
        if (stage === 'analyze') dispatch({ type: 'ANALYZE_FAIL', message });
        if (stage === 'rewrite') dispatch({ type: 'REWRITE_FAIL', message });
        if (stage === 'optimize') dispatch({ type: 'OPTIMIZE_FAIL', message });
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [authToken],
  );

  /**
   * Run a complete pipeline: analyze → (rewrite || optimize in parallel).
   * Stage 3 is skipped when the analyze score is already excellent.
   */
  const runPipeline = useCallback(
    async (
      text: string,
      mediaContext: {
        hasMedia: boolean;
        mediaType?: 'image' | 'video' | 'gif' | 'poll';
        isQuoteTweet: boolean;
        quotedText?: string;
        quotedMediaType?: 'image' | 'video' | 'gif' | 'poll';
      },
    ): Promise<void> => {
      const controller = new AbortController();
      abortRef.current?.abort();
      abortRef.current = controller;
      const signal = controller.signal;

      dispatch({ type: 'START', textSnapshot: text });

      // Stage 1
      let analysisResult: AnalysisResult | null = null;
      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (authToken) headers.Authorization = `Bearer ${authToken}`;
        dispatch({ type: 'STAGE_BEGIN', stage: 'analyze' });
        const res = await fetch('/api/analyze', {
          method: 'POST',
          headers,
          signal,
          body: JSON.stringify({
            content: text,
            platform: 'x',
            isThread: false,
            hasMedia: mediaContext.hasMedia,
            mediaType: mediaContext.mediaType,
            isQuoteTweet: mediaContext.isQuoteTweet,
            quotedText: mediaContext.quotedText,
            quotedMediaType: mediaContext.quotedMediaType,
          }),
        });
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(errBody.error ?? `Server ${res.status}`);
        }
        const data = await res.json();
        analysisResult = data.data as AnalysisResult;
        dispatch({ type: 'ANALYZE_SUCCESS', result: analysisResult });
      } catch (err) {
        if (signal.aborted) return;
        const message = err instanceof Error ? err.message : 'Analyze failed';
        dispatch({ type: 'ANALYZE_FAIL', message });
        return; // Without Stage 1 we can't run Stage 2/3
      }

      // Stage 2 + Stage 3 in parallel
      const skipOptimize = analysisResult.score >= skipOptimizeThreshold;
      const tasks: Promise<void>[] = [];

      if (!signal.aborted) {
        const rewriteTask = (async () => {
          try {
            const headers: Record<string, string> = { 'Content-Type': 'application/json' };
            if (authToken) headers.Authorization = `Bearer ${authToken}`;
            dispatch({ type: 'STAGE_BEGIN', stage: 'rewrite' });
            const res = await fetch('/api/suggest', {
              method: 'POST',
              headers,
              signal,
              body: JSON.stringify({ content: text, type: 'hook' }),
            });
            if (!res.ok) {
              const errBody = await res.json().catch(() => ({}));
              throw new Error(errBody.error ?? `Server ${res.status}`);
            }
            const data = await res.json();
            const suggestions: string[] = (data.suggestions ?? []).slice(0, 3);
            // Score each candidate locally
            const scored: RewriteCandidate[] = await Promise.all(
              suggestions.map(async (t) => {
                try {
                  const r = await fetch('/api/analyze', {
                    method: 'POST',
                    headers,
                    signal,
                    body: JSON.stringify({
                      content: t,
                      platform: 'x',
                      isThread: false,
                      hasMedia: mediaContext.hasMedia,
                      mediaType: mediaContext.mediaType,
                      isQuoteTweet: mediaContext.isQuoteTweet,
                    }),
                  });
                  const j = await r.json().catch(() => null);
                  return { text: t, score: j?.data?.score ?? 0 };
                } catch {
                  return { text: t, score: 0 };
                }
              }),
            );
            dispatch({ type: 'REWRITE_SUCCESS', candidates: scored });
          } catch (err) {
            if (signal.aborted) return;
            const message = err instanceof Error ? err.message : 'Rewrite failed';
            dispatch({ type: 'REWRITE_FAIL', message });
          }
        })();
        tasks.push(rewriteTask);
      }

      if (!skipOptimize && !signal.aborted) {
        const optimizeTask = (async () => {
          try {
            const headers: Record<string, string> = { 'Content-Type': 'application/json' };
            if (authToken) headers.Authorization = `Bearer ${authToken}`;
            dispatch({ type: 'STAGE_BEGIN', stage: 'optimize' });
            const res = await fetch('/api/tweets/auto-optimize', {
              method: 'POST',
              headers,
              signal,
              body: JSON.stringify({
                content: text,
                maxRounds: 5,
                hasMedia: mediaContext.hasMedia,
                mediaType: mediaContext.mediaType,
                isQuoteTweet: mediaContext.isQuoteTweet,
                quotedMediaType: mediaContext.quotedMediaType,
              }),
            });
            if (!res.ok) {
              const errBody = await res.json().catch(() => ({}));
              throw new Error(errBody.error ?? `Server ${res.status}`);
            }
            const data = await res.json();
            const d = data.data as {
              rounds: OptimizeRound[];
              finalScore: number;
              bestText: string;
            };
            for (const r of d.rounds) {
              if (signal.aborted) return;
              dispatch({ type: 'OPTIMIZE_ROUND', round: r });
              await new Promise((res) => setTimeout(res, 60));
            }
            const lastRound = d.rounds[d.rounds.length - 1] ?? {
              round: d.rounds.length,
              bestText: d.bestText,
              bestScore: d.finalScore,
            };
            dispatch({ type: 'OPTIMIZE_SUCCESS', finalRound: lastRound });
          } catch (err) {
            if (signal.aborted) return;
            const message = err instanceof Error ? err.message : 'Optimize failed';
            dispatch({ type: 'OPTIMIZE_FAIL', message });
          }
        })();
        tasks.push(optimizeTask);
      }

      await Promise.allSettled(tasks);

      // If both stages finished without setting error and at least one
      // succeeded, transition to done.
      if (!signal.aborted) {
        dispatch({ type: 'STAGE_END', stage: 'analyze' });
      }
    },
    [authToken, skipOptimizeThreshold],
  );

  const start = useCallback(
    (text: string) => {
      void runPipeline(text, {
        hasMedia: false,
        isQuoteTweet: false,
      });
    },
    [runPipeline],
  );

  const retryStage = useCallback(
    async (stage: 'analyze' | 'rewrite' | 'optimize') => {
      if (state.status !== 'error') return;
      const text = state.textSnapshot;
      if (!text) return;
      // Clear the error for this stage then re-run
      if (stage === 'analyze') {
        dispatch({ type: 'START', textSnapshot: text });
        await runStage('analyze', text, { hasMedia: false, isQuoteTweet: false });
        // After retry, kick off Stage 2/3 if analyze succeeded
        if (state.analysis) {
          // Re-run the rest
          void runPipeline(text, { hasMedia: false, isQuoteTweet: false });
        }
      } else if (stage === 'rewrite' && state.analysis) {
        dispatch({ type: 'STAGE_BEGIN', stage: 'rewrite' });
        await runStage('rewrite', text, { hasMedia: false, isQuoteTweet: false });
        dispatch({ type: 'STAGE_END', stage: 'rewrite' });
      } else if (stage === 'optimize' && state.analysis) {
        dispatch({ type: 'STAGE_BEGIN', stage: 'optimize' });
        await runStage('optimize', text, { hasMedia: false, isQuoteTweet: false }, state.analysis);
        dispatch({ type: 'STAGE_END', stage: 'optimize' });
      }
    },
    [state, runPipeline, runStage],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // Derived bests
  const bestRewrite =
    state.rewrites.length > 0
      ? state.rewrites.reduce((b, c) => (c.score > b.score ? c : b))
      : null;
  const bestOptimize =
    state.rounds.length > 0
      ? state.rounds.reduce((b, r) => (r.bestScore > b.bestScore ? r : b))
      : null;
  const bestOverall: UseOptimizationPipelineReturn['bestOverall'] = (() => {
    const candidates: Array<{ score: number; text: string; source: 'rewrite' | 'optimize' }> = [];
    if (bestRewrite) candidates.push({ text: bestRewrite.text, score: bestRewrite.score, source: 'rewrite' });
    if (bestOptimize) candidates.push({ text: bestOptimize.bestText, score: bestOptimize.bestScore, source: 'optimize' });
    if (candidates.length === 0) return null;
    return candidates.reduce((b, c) => (c.score > b.score ? c : b));
  })();

  return {
    state,
    start,
    abort,
    reset,
    apply,
    retryStage,
    bestRewrite,
    bestOptimize,
    bestOverall,
  };
}

// Re-export for unit tests
export { reducer as pipelineReducer };
// Hint to ensure tier imports are tree-shaken correctly when not used in app
export const __TIER_REFERENCE__: ReadonlyArray<ScoreTier> = [];
// Reference to satisfy build graph if needed
export const __MODEL_REFERENCE__ = ANTHROPIC_MODEL;