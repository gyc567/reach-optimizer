// v11 — Pure helpers for deriving the AI Optimize button state from a
// PipelineState. Kept as a separate file so unit tests can exercise the
// state machine without React or jsdom.

import type { PipelineState } from './useOptimizationPipeline';

export type AIButtonState = 'idle' | 'running' | 'result-ready' | 'error';

/**
 * Map PipelineState → button state. Pure, exported for testing.
 *
 * - running                  → 'running'       (button disabled, shows progress)
 * - error                    → 'error'         (button red, click to retry)
 * - done + rounds.length>0   → 'result-ready'  (button green, click to re-run)
 * - done + 0 rounds          → 'idle'          (skipped — score was already high)
 * - idle                     → 'idle'          (button blue, click to start)
 */
export function deriveButtonState(state: PipelineState): AIButtonState {
  if (state.status === 'running') return 'running';
  if (state.status === 'error') return 'error';
  if (state.status === 'done' && state.rounds.length > 0) return 'result-ready';
  return 'idle';
}

/**
 * Returns the current round counter for the running button label, or null
 * when not applicable (analyze phase, idle, error, done).
 *
 * Only optimize stage with at least one round shows "X/Y" — otherwise the
 * button just shows "处理中…".
 */
export function getRunningRound(
  state: PipelineState,
): { current: number; total: number } | null {
  if (state.status !== 'running') return null;
  if (!state.activeStages.optimize) return null;
  if (state.rounds.length === 0) return null;
  return {
    current: state.rounds.length,
    total: state.optimizeMaxRounds,
  };
}
