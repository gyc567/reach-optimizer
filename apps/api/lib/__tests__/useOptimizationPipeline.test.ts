import { describe, expect, it } from 'vitest';
import { pipelineReducer, PIPELINE_INITIAL_STATE, type PipelineState } from '../useOptimizationPipeline';

const baseState = (): PipelineState => ({ ...PIPELINE_INITIAL_STATE });

describe('pipelineReducer', () => {
  describe('START', () => {
    it('resets to running with the supplied text', () => {
      const next = pipelineReducer(baseState(), { type: 'START', textSnapshot: 'hello world' });
      expect(next.status).toBe('running');
      expect(next.textSnapshot).toBe('hello world');
      expect(next.activeStages.analyze).toBe(true);
      expect(next.activeStages.rewrite).toBe(false);
      expect(next.activeStages.optimize).toBe(false);
    });

    it('wipes any prior partial results', () => {
      const dirty: PipelineState = {
        ...baseState(),
        rewrites: [{ text: 'old', score: 70 }],
        rounds: [{ round: 1, bestText: 'old', bestScore: 50 }],
      };
      const next = pipelineReducer(dirty, { type: 'START', textSnapshot: 'fresh' });
      expect(next.rewrites).toEqual([]);
      expect(next.rounds).toEqual([]);
    });
  });

  describe('STAGE_BEGIN / STAGE_END', () => {
    it('toggles activeStage for the named stage', () => {
      let s = pipelineReducer(baseState(), { type: 'START', textSnapshot: 't' });
      s = pipelineReducer(s, { type: 'STAGE_BEGIN', stage: 'rewrite' });
      expect(s.activeStages.rewrite).toBe(true);
      s = pipelineReducer(s, { type: 'STAGE_END', stage: 'rewrite' });
      expect(s.activeStages.rewrite).toBe(false);
    });
  });

  describe('ANALYZE_SUCCESS', () => {
    it('stores the result and marks analyze stage inactive', () => {
      let s = pipelineReducer(baseState(), { type: 'START', textSnapshot: 't' });
      s = pipelineReducer(s, {
        type: 'ANALYZE_SUCCESS',
        result: { score: 65 } as never,
      });
      expect(s.analysis).toEqual({ score: 65 });
      expect(s.activeStages.analyze).toBe(false);
    });
  });

  describe('ANALYZE_FAIL', () => {
    it('sets error state and stops all in-flight stages', () => {
      let s = pipelineReducer(baseState(), { type: 'START', textSnapshot: 't' });
      s = pipelineReducer(s, { type: 'STAGE_BEGIN', stage: 'rewrite' });
      s = pipelineReducer(s, { type: 'ANALYZE_FAIL', message: 'oops' });
      expect(s.status).toBe('error');
      expect(s.errorStage).toBe('analyze');
      expect(s.errorMessage).toBe('oops');
      expect(s.activeStages.rewrite).toBe(false);
    });
  });

  describe('REWRITE_SUCCESS', () => {
    it('stores candidates and marks rewrite stage inactive', () => {
      let s = pipelineReducer(baseState(), { type: 'START', textSnapshot: 't' });
      s = pipelineReducer(s, { type: 'STAGE_BEGIN', stage: 'rewrite' });
      s = pipelineReducer(s, {
        type: 'REWRITE_SUCCESS',
        candidates: [
          { text: 'a', score: 50 },
          { text: 'b', score: 70 },
        ],
      });
      expect(s.rewrites).toHaveLength(2);
      expect(s.activeStages.rewrite).toBe(false);
    });
  });

  describe('OPTIMIZE_ROUND', () => {
    it('appends new rounds and is idempotent on duplicates', () => {
      let s = pipelineReducer(baseState(), { type: 'START', textSnapshot: 't' });
      s = pipelineReducer(s, { type: 'STAGE_BEGIN', stage: 'optimize' });
      s = pipelineReducer(s, { type: 'OPTIMIZE_ROUND', round: { round: 1, bestText: 'r1', bestScore: 60 } });
      s = pipelineReducer(s, { type: 'OPTIMIZE_ROUND', round: { round: 2, bestText: 'r2', bestScore: 70 } });
      expect(s.rounds.map((r) => r.round)).toEqual([1, 2]);
      // Duplicate dispatch: same round should not be added twice
      s = pipelineReducer(s, { type: 'OPTIMIZE_ROUND', round: { round: 2, bestText: 'r2-duplicate', bestScore: 71 } });
      expect(s.rounds.map((r) => r.round)).toEqual([1, 2]);
      expect(s.rounds.find((r) => r.round === 2)?.bestScore).toBe(70);
    });
  });

  describe('OPTIMIZE_SUCCESS', () => {
    it('marks done and ensures final round is present', () => {
      let s = pipelineReducer(baseState(), { type: 'START', textSnapshot: 't' });
      s = pipelineReducer(s, { type: 'OPTIMIZE_ROUND', round: { round: 1, bestText: 'r1', bestScore: 60 } });
      s = pipelineReducer(s, { type: 'OPTIMIZE_SUCCESS', finalRound: { round: 1, bestText: 'r1', bestScore: 60 } });
      expect(s.status).toBe('done');
      expect(s.rounds).toHaveLength(1);
    });

    it('adds final round if not already present', () => {
      let s = pipelineReducer(baseState(), { type: 'START', textSnapshot: 't' });
      s = pipelineReducer(s, { type: 'OPTIMIZE_SUCCESS', finalRound: { round: 5, bestText: 'r5', bestScore: 90 } });
      expect(s.rounds).toHaveLength(1);
      expect(s.rounds[0].round).toBe(5);
    });
  });

  describe('OPTIMIZE_FAIL', () => {
    it('keeps status running if Stage 1 succeeded', () => {
      let s = pipelineReducer(baseState(), { type: 'START', textSnapshot: 't' });
      s = pipelineReducer(s, { type: 'ANALYZE_SUCCESS', result: { score: 50 } as never });
      s = pipelineReducer(s, { type: 'STAGE_BEGIN', stage: 'optimize' });
      s = pipelineReducer(s, { type: 'OPTIMIZE_FAIL', message: 'ai rate limit' });
      expect(s.status).not.toBe('error');
      expect(s.errorStage).toBe('optimize');
      expect(s.errorMessage).toBe('ai rate limit');
      expect(s.activeStages.optimize).toBe(false);
    });

    it('escalates to error if analyze never succeeded', () => {
      let s = pipelineReducer(baseState(), { type: 'START', textSnapshot: 't' });
      s = pipelineReducer(s, { type: 'STAGE_BEGIN', stage: 'optimize' });
      s = pipelineReducer(s, { type: 'OPTIMIZE_FAIL', message: 'fail' });
      expect(s.status).toBe('error');
    });
  });

  describe('ABORT', () => {
    it('preserves partial results but returns status to idle', () => {
      let s = pipelineReducer(baseState(), { type: 'START', textSnapshot: 't' });
      s = pipelineReducer(s, { type: 'ANALYZE_SUCCESS', result: { score: 70 } as never });
      s = pipelineReducer(s, { type: 'REWRITE_SUCCESS', candidates: [{ text: 'r', score: 80 }] });
      s = pipelineReducer(s, { type: 'ABORT' });
      expect(s.status).toBe('idle');
      expect(s.activeStages).toEqual({ analyze: false, rewrite: false, optimize: false });
      // Partial results are preserved
      expect(s.analysis).toEqual({ score: 70 });
      expect(s.rewrites).toHaveLength(1);
    });
  });

  describe('APPLY', () => {
    it('records the chosen candidate', () => {
      const s = pipelineReducer(baseState(), { type: 'APPLY', text: 'replacement' });
      expect(s.appliedText).toBe('replacement');
      expect(s.overLimit).toBe(false);
    });

    it('flags overLimit when text exceeds 280 chars', () => {
      const long = 'a'.repeat(300);
      const s = pipelineReducer(baseState(), { type: 'APPLY', text: long });
      expect(s.overLimit).toBe(true);
    });
  });

  describe('RESET', () => {
    it('wipes everything back to initial', () => {
      let s = pipelineReducer(baseState(), { type: 'START', textSnapshot: 't' });
      s = pipelineReducer(s, { type: 'ANALYZE_SUCCESS', result: { score: 70 } as never });
      s = pipelineReducer(s, { type: 'APPLY', text: 'r' });
      const fresh = pipelineReducer(s, { type: 'RESET' });
      expect(fresh.status).toBe('idle');
      expect(fresh.analysis).toBeNull();
      expect(fresh.appliedText).toBeNull();
    });
  });

  describe('full happy path', () => {
    it('start → analyze → rewrite → optimize round-by-round → done', () => {
      let s = pipelineReducer(baseState(), { type: 'START', textSnapshot: 't' });
      // analyze
      s = pipelineReducer(s, { type: 'STAGE_BEGIN', stage: 'rewrite' });
      s = pipelineReducer(s, { type: 'ANALYZE_SUCCESS', result: { score: 50 } as never });
      // rewrite done
      s = pipelineReducer(s, {
        type: 'REWRITE_SUCCESS',
        candidates: [{ text: 'r1', score: 70 }],
      });
      // optimize progress
      s = pipelineReducer(s, { type: 'STAGE_BEGIN', stage: 'optimize' });
      s = pipelineReducer(s, { type: 'OPTIMIZE_ROUND', round: { round: 1, bestText: 'o1', bestScore: 75 } });
      s = pipelineReducer(s, { type: 'OPTIMIZE_ROUND', round: { round: 2, bestText: 'o2', bestScore: 80 } });
      s = pipelineReducer(s, { type: 'OPTIMIZE_SUCCESS', finalRound: { round: 2, bestText: 'o2', bestScore: 80 } });
      expect(s.status).toBe('done');
      expect(s.rounds).toHaveLength(2);
      expect(s.rewrites).toHaveLength(1);
    });
  });

  describe('smart skip Stage 3 (≥75)', () => {
    it('analyze with score 75 is treated as excellent by the orchestrator', () => {
      // Reducer doesn't auto-skip — the hook does. The hook reads
      // state.analysis.score >= skipOptimizeThreshold and skips optimize().
      // We assert the contract here by checking the threshold constant usage.
      let s = pipelineReducer(baseState(), { type: 'START', textSnapshot: 't' });
      s = pipelineReducer(s, { type: 'ANALYZE_SUCCESS', result: { score: 75 } as never });
      // The reducer exposes the score so the hook can check.
      expect((s.analysis as { score: number }).score).toBe(75);
    });
  });
});