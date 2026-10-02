import { describe, it, expect } from 'vitest';
import {
  reducer,
  PIPELINE_INITIAL_STATE,
  computeProgressPercent,
  computeEtaSeconds,
  type PipelineState,
} from '@lib/useOptimizationPipeline';

// All times below are deterministic so the assertions don't depend on Date.now().
// We pass a custom `now` via a small wrapper that lets us override the clock.
function makeReducer(now: () => number) {
  // Wrap the real reducer by intercepting Date.now via vitest spy on the
  // module level. Easier path: drive Date.now ourselves by mutating a global.
  // Since we can't mock easily without setup file, we pre-seed timestamps by
  // computing relative offsets at the call site.
  return (state: PipelineState, action: Parameters<typeof reducer>[1]) =>
    reducer(state, action);
}

// Helper: build a state at a specific synthetic timestamp so we don't rely on
// Date.now() in assertions. We use a base epoch and add offsets.
const T0 = 1_700_000_000_000;
const t = (offsetSec: number) => T0 + offsetSec * 1000;

function stateWith(overrides: Partial<PipelineState>): PipelineState {
  return { ...PIPELINE_INITIAL_STATE, ...overrides };
}

describe('computeProgressPercent', () => {
  it('returns 20 during analyze stage', () => {
    const s = stateWith({ activeStages: { analyze: true, optimize: false } });
    expect(computeProgressPercent(s)).toBe(20);
  });

  it('returns 20 during optimize with 0 rounds', () => {
    const s = stateWith({
      activeStages: { analyze: false, optimize: true },
      rounds: [],
      optimizeMaxRounds: 5,
    });
    expect(computeProgressPercent(s)).toBe(20);
  });

  it('returns 36 with 1 round of 5', () => {
    const s = stateWith({
      activeStages: { analyze: false, optimize: true },
      rounds: [{ round: 1, bestText: 'a', bestScore: 50 }],
      optimizeMaxRounds: 5,
    });
    expect(computeProgressPercent(s)).toBe(36);
  });

  it('returns 68 with 3 rounds of 5', () => {
    const s = stateWith({
      activeStages: { analyze: false, optimize: true },
      rounds: [
        { round: 1, bestText: 'a', bestScore: 50 },
        { round: 2, bestText: 'b', bestScore: 55 },
        { round: 3, bestText: 'c', bestScore: 60 },
      ],
      optimizeMaxRounds: 5,
    });
    expect(computeProgressPercent(s)).toBe(68);
  });

  it('returns 100 with 5 rounds of 5', () => {
    const s = stateWith({
      activeStages: { analyze: false, optimize: true },
      rounds: Array.from({ length: 5 }, (_, i) => ({
        round: i + 1,
        bestText: `r${i}`,
        bestScore: 50 + i,
      })),
      optimizeMaxRounds: 5,
    });
    expect(computeProgressPercent(s)).toBe(100);
  });

  it('scales linearly for non-default maxRounds (3 rounds → 73% with 2 rounds)', () => {
    // 2 rounds of 3: 20 + (2/3) * 80 = 20 + 53.33 = 73 (rounded)
    const s = stateWith({
      activeStages: { analyze: false, optimize: true },
      rounds: [
        { round: 1, bestText: 'a', bestScore: 50 },
        { round: 2, bestText: 'b', bestScore: 55 },
      ],
      optimizeMaxRounds: 3,
    });
    expect(computeProgressPercent(s)).toBe(73);
  });

  it('clamps to 100 when rounds exceed maxRounds (defensive)', () => {
    const s = stateWith({
      activeStages: { analyze: false, optimize: true },
      rounds: Array.from({ length: 10 }, (_, i) => ({
        round: i + 1,
        bestText: `r${i}`,
        bestScore: 50,
      })),
      optimizeMaxRounds: 5,
    });
    expect(computeProgressPercent(s)).toBe(100);
  });

  it('treats optimizeMaxRounds=0 as 1 to avoid divide-by-zero', () => {
    const s = stateWith({
      activeStages: { analyze: false, optimize: true },
      rounds: [],
      optimizeMaxRounds: 0,
    });
    expect(computeProgressPercent(s)).toBe(20);
  });
});

describe('computeEtaSeconds', () => {
  it('returns null with 0 round timestamps', () => {
    const s = stateWith({ roundTimestamps: [], optimizeMaxRounds: 5 });
    expect(computeEtaSeconds(s)).toBeNull();
  });

  it('returns null with only 1 round timestamp (insufficient extrapolation)', () => {
    const s = stateWith({ roundTimestamps: [t(0)], optimizeMaxRounds: 5 });
    expect(computeEtaSeconds(s)).toBeNull();
  });

  it('extrapolates from the last 2 round intervals (8s apart, 3 rounds remaining)', () => {
    const s = stateWith({
      roundTimestamps: [t(0), t(8)],
      rounds: [
        { round: 1, bestText: 'a', bestScore: 50 },
        { round: 2, bestText: 'b', bestScore: 55 },
      ],
      optimizeMaxRounds: 5,
    });
    // 5 - 2 = 3 rounds left × 8s = 24s
    expect(computeEtaSeconds(s)).toBe(24);
  });

  it('uses ONLY the most recent interval (not the running average)', () => {
    // Rounds at 0s, 30s, 38s — recent gap is 8s, not 19s average.
    const s = stateWith({
      roundTimestamps: [t(0), t(30), t(38)],
      rounds: [
        { round: 1, bestText: 'a', bestScore: 50 },
        { round: 2, bestText: 'b', bestScore: 55 },
        { round: 3, bestText: 'c', bestScore: 60 },
      ],
      optimizeMaxRounds: 5,
    });
    // 5 - 3 = 2 rounds × 8s = 16s
    expect(computeEtaSeconds(s)).toBe(16);
  });

  it('returns 0 when all rounds complete', () => {
    const s = stateWith({
      roundTimestamps: [t(0), t(8), t(16)],
      rounds: Array.from({ length: 5 }, (_, i) => ({
        round: i + 1,
        bestText: `r${i}`,
        bestScore: 50 + i,
      })),
      optimizeMaxRounds: 5,
    });
    expect(computeEtaSeconds(s)).toBe(0);
  });

  it('floors at 1 second minimum (avoids "0s remaining" flicker)', () => {
    const s = stateWith({
      roundTimestamps: [t(0), t(0.1)],
      rounds: [
        { round: 1, bestText: 'a', bestScore: 50 },
        { round: 2, bestText: 'b', bestScore: 55 },
      ],
      optimizeMaxRounds: 10, // 8 remaining × 0.1s = 0.8s → floored to 1
    });
    expect(computeEtaSeconds(s)).toBe(1);
  });

  it('returns null when last two timestamps are equal (no progression)', () => {
    const s = stateWith({
      roundTimestamps: [t(5), t(5)],
      rounds: [
        { round: 1, bestText: 'a', bestScore: 50 },
        { round: 2, bestText: 'b', bestScore: 55 },
      ],
      optimizeMaxRounds: 5,
    });
    expect(computeEtaSeconds(s)).toBeNull();
  });
});

describe('reducer — v9 state machine', () => {
  it('START sets stageStartedAt.analyze and roundTimestamps: []', () => {
    const next = reducer(PIPELINE_INITIAL_STATE, {
      type: 'START',
      textSnapshot: 'hello',
    });
    expect(next.stageStartedAt.analyze).not.toBeNull();
    expect(next.stageStartedAt.optimize).toBeNull();
    expect(next.roundTimestamps).toEqual([]);
    expect(next.optimizeMaxRounds).toBe(5);
  });

  it('START honors maxRounds option', () => {
    const next = reducer(PIPELINE_INITIAL_STATE, {
      type: 'START',
      textSnapshot: 'hello',
      maxRounds: 3,
    });
    expect(next.optimizeMaxRounds).toBe(3);
  });

  it('STAGE_BEGIN optimize sets stageStartedAt.optimize', () => {
    const after = reducer(PIPELINE_INITIAL_STATE, {
      type: 'STAGE_BEGIN',
      stage: 'optimize',
    });
    expect(after.stageStartedAt.optimize).not.toBeNull();
  });

  it('OPTIMIZE_ROUND is idempotent on rounds and roundTimestamps (dedupes)', () => {
    const r = { round: 1, bestText: 'x', bestScore: 50 };
    const once = reducer(PIPELINE_INITIAL_STATE, { type: 'OPTIMIZE_ROUND', round: r });
    const twice = reducer(once, { type: 'OPTIMIZE_ROUND', round: r });
    expect(twice.rounds).toHaveLength(1);
    expect(twice.roundTimestamps).toHaveLength(1);
  });

  it('OPTIMIZE_ROUND appends to roundTimestamps when new', () => {
    const r1 = { round: 1, bestText: 'x', bestScore: 50 };
    const r2 = { round: 2, bestText: 'y', bestScore: 55 };
    const a = reducer(PIPELINE_INITIAL_STATE, { type: 'OPTIMIZE_ROUND', round: r1 });
    const b = reducer(a, { type: 'OPTIMIZE_ROUND', round: r2 });
    expect(b.rounds).toHaveLength(2);
    expect(b.roundTimestamps).toHaveLength(2);
    expect(b.roundTimestamps[1]).toBeGreaterThanOrEqual(b.roundTimestamps[0]);
  });

  it('ABORT clears stageStartedAt and roundTimestamps', () => {
    const started = reducer(PIPELINE_INITIAL_STATE, {
      type: 'START',
      textSnapshot: 'hi',
    });
    const withRound = reducer(started, {
      type: 'OPTIMIZE_ROUND',
      round: { round: 1, bestText: 'x', bestScore: 50 },
    });
    const aborted = reducer(withRound, { type: 'ABORT' });
    expect(aborted.stageStartedAt).toEqual({ analyze: null, optimize: null });
    expect(aborted.roundTimestamps).toEqual([]);
    expect(aborted.status).toBe('idle');
  });

  it('RESET returns to PIPELINE_INITIAL_STATE', () => {
    const started = reducer(PIPELINE_INITIAL_STATE, {
      type: 'START',
      textSnapshot: 'hi',
    });
    const reset = reducer(started, { type: 'RESET' });
    expect(reset).toEqual(PIPELINE_INITIAL_STATE);
  });

  it('ANALYZE_SUCCESS clears activeStages.analyze but keeps stageStartedAt.analyze', () => {
    const started = reducer(PIPELINE_INITIAL_STATE, {
      type: 'START',
      textSnapshot: 'hi',
    });
    const success = reducer(started, {
      type: 'ANALYZE_SUCCESS',
      result: { score: 60, tier: 'good' },
    });
    expect(success.activeStages.analyze).toBe(false);
    expect(success.stageStartedAt.analyze).not.toBeNull();
    expect(success.stageStartedAt.optimize).toBeNull();
  });

  it('STAGE_END does not touch stageStartedAt (preserves historical start times)', () => {
    const started = reducer(PIPELINE_INITIAL_STATE, {
      type: 'START',
      textSnapshot: 'hi',
    });
    const begun = reducer(started, { type: 'STAGE_BEGIN', stage: 'optimize' });
    const ended = reducer(begun, { type: 'STAGE_END', stage: 'optimize' });
    expect(ended.stageStartedAt.optimize).toBe(begun.stageStartedAt.optimize);
  });
});

describe('v9 invariants — UI source contracts', () => {
  it('AIOptimizer.tsx no longer has its own top-level Abort button (pipeline-abort)', async () => {
    const fs = await import('fs');
    const text = fs.readFileSync(
      '/Users/jie/code/reach-optimizer/apps/api/components/AIOptimizer.tsx',
      'utf8',
    );
    // The old testid "pipeline-abort" should be gone from StagesRow.
    // (PipelineProgress uses "progress-abort" instead.)
    const stagesRowMatch = text.match(/function StagesRow[\s\S]*?\n\}/);
    expect(stagesRowMatch).toBeTruthy();
    expect(stagesRowMatch![0]).not.toMatch(/pipeline-abort/);
  });

  it('AIOptimizer.tsx does NOT mount PipelineProgress (v10 moved it to floating CatProgressFab)', async () => {
    const fs = await import('fs');
    const text = fs.readFileSync(
      '/Users/jie/code/reach-optimizer/apps/api/components/AIOptimizer.tsx',
      'utf8',
    );
    // v10 — PipelineProgress is no longer mounted inline. It's kept in the
    // codebase as an unused component but no longer wired up. The page-level
    // CatProgressFab handles progress display now.
    expect(text).not.toMatch(/<PipelineProgress/);
  });

  it('app/page.tsx mounts CatProgressFab (v10 floating FAB takes over)', async () => {
    const fs = await import('fs');
    const text = fs.readFileSync(
      '/Users/jie/code/reach-optimizer/apps/api/app/page.tsx',
      'utf8',
    );
    expect(text).toMatch(/import\s*\{\s*CatProgressFab\s*\}/);
    expect(text).toMatch(/<CatProgressFab[\s\S]*?\/>/);
  });

  it('PipelineProgress.tsx renders only when status === running', async () => {
    const fs = await import('fs');
    const text = fs.readFileSync(
      '/Users/jie/code/reach-optimizer/apps/api/components/PipelineProgress.tsx',
      'utf8',
    );
    expect(text).toMatch(/if \(state\.status !== 'running'\) return null/);
  });

  it('PipelineProgress.tsx has ARIA progressbar role + aria-valuenow', async () => {
    const fs = await import('fs');
    const text = fs.readFileSync(
      '/Users/jie/code/reach-optimizer/apps/api/components/PipelineProgress.tsx',
      'utf8',
    );
    expect(text).toMatch(/role="progressbar"/);
    expect(text).toMatch(/aria-valuemin=\{0\}/);
    expect(text).toMatch(/aria-valuemax=\{100\}/);
    expect(text).toMatch(/aria-valuenow=/);
  });

  it('PipelineProgress.tsx has aria-live region for status', async () => {
    const fs = await import('fs');
    const text = fs.readFileSync(
      '/Users/jie/code/reach-optimizer/apps/api/components/PipelineProgress.tsx',
      'utf8',
    );
    expect(text).toMatch(/aria-live="polite"/);
  });

  it('i18n en.json has v9 progress keys', async () => {
    const fs = await import('fs');
    const text = fs.readFileSync(
      '/Users/jie/code/reach-optimizer/apps/api/messages/en.json',
      'utf8',
    );
    expect(text).toMatch(/"progress\.label"/);
    expect(text).toMatch(/"progress\.analyzing"/);
    expect(text).toMatch(/"progress\.optimizing_first"/);
    expect(text).toMatch(/"progress\.round"/);
    expect(text).toMatch(/"progress\.eta"/);
    expect(text).toMatch(/"progress\.finishing"/);
  });

  it('i18n zh.json has v9 progress keys', async () => {
    const fs = await import('fs');
    const text = fs.readFileSync(
      '/Users/jie/code/reach-optimizer/apps/api/messages/zh.json',
      'utf8',
    );
    expect(text).toMatch(/"progress\.label"/);
    expect(text).toMatch(/"progress\.analyzing"/);
    expect(text).toMatch(/"progress\.round"/);
    expect(text).toMatch(/"progress\.eta"/);
    expect(text).toMatch(/"progress\.finishing"/);
  });
});
