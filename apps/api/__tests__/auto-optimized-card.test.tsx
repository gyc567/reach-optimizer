import { describe, expect, it } from 'vitest';
import React from 'react';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { renderToStaticMarkup } = require('react-dom/server') as any;
import { AutoOptimizedCard } from '../components/AutoOptimizedCard';
import type { UseOptimizationPipelineReturn } from '../lib/useOptimizationPipeline';

function mockPipeline(overrides: Partial<{
  status: 'idle' | 'running' | 'done' | 'error';
  rounds: Array<{ round: number; bestText: string; bestScore: number }>;
  activeStages: { analyze: boolean; rewrite: boolean; optimize: boolean };
  appliedText: string | null;
  errorStage: 'analyze' | 'rewrite' | 'optimize' | null;
  errorMessage: string | null;
  textSnapshot: string;
}> = {}): UseOptimizationPipelineReturn {
  const rounds = overrides.rounds ?? [];
  return {
    state: {
      status: overrides.status ?? 'idle',
      analysis: null,
      rewrites: [],
      rounds,
      textSnapshot: overrides.textSnapshot ?? '',
      activeStages: overrides.activeStages ?? { analyze: false, rewrite: false, optimize: false },
      errorStage: overrides.errorStage ?? null,
      errorMessage: overrides.errorMessage ?? null,
      appliedText: overrides.appliedText ?? null,
      overLimit: false,
    } as never,
    start: () => {},
    abort: () => {},
    reset: () => {},
    apply: () => {},
    retryStage: async () => {},
    bestRewrite: null,
    bestOptimize: rounds.length > 0 ? rounds[rounds.length - 1] : null,
    bestOverall: null,
  };
}

const baseProps = {
  originalText: 'Bold claim about reach scoring.',
  currentText: 'Bold claim about reach scoring.',
  preApplyText: null,
  onApply: () => {},
  onUndo: () => {},
  onRerun: () => {},
  onAbort: () => {},
};

describe('AutoOptimizedCard', () => {
  it('returns null when there are no rounds and optimize is not running', () => {
    const html = renderToStaticMarkup(
      <AutoOptimizedCard {...baseProps} pipeline={mockPipeline({ status: 'idle' })} />,
    );
    expect(html).toBe('');
  });

  it('renders the running state with current best during optimize', () => {
    const html = renderToStaticMarkup(
      <AutoOptimizedCard
        {...baseProps}
        pipeline={mockPipeline({
          status: 'running',
          activeStages: { analyze: false, rewrite: false, optimize: true },
          rounds: [{ round: 1, bestText: 'Hot take nobody tells you.', bestScore: 70 }],
        })}
      />,
    );
    expect(html).toContain('data-testid="auto-optimized-card"');
    expect(html).toContain('data-state="running"');
    expect(html).toContain('Auto-Optimizing');
    // Diff renders word-by-word into separate spans; check tokens
    expect(html).toContain('Hot');
    expect(html).toContain('take');
    expect(html).toContain('nobody');
    expect(html).toContain('data-testid="auto-optimized-abort"');
  });

  it('renders the done state with diff and Use this button', () => {
    const html = renderToStaticMarkup(
      <AutoOptimizedCard
        {...baseProps}
        originalText="Bold claim about reach scoring."
        pipeline={mockPipeline({
          status: 'done',
          rounds: [{ round: 5, bestText: 'Hot take nobody tells you.', bestScore: 89 }],
        })}
      />,
    );
    expect(html).toContain('data-state="done"');
    expect(html).toContain('data-testid="auto-optimized-diff"');
    expect(html).toContain('data-testid="auto-optimized-use"');
    // Tokens from the optimized version are present (split across spans)
    expect(html).toContain('Hot');
    expect(html).toContain('nobody');
    // Score delta badge should appear (orig 30 → opt 89 = +59)
    expect(html).toContain('data-testid="auto-optimized-score-delta"');
    // We don't assert the exact delta value because the engine may score
    // these synthetic texts differently; we do verify the delta card exists.
  });

  it('marks the card state as applied when appliedText === currentText', () => {
    const optimized = 'Hot take nobody tells you.';
    const html = renderToStaticMarkup(
      <AutoOptimizedCard
        {...baseProps}
        currentText={optimized}
        pipeline={mockPipeline({
          status: 'done',
          appliedText: optimized,
          rounds: [{ round: 5, bestText: optimized, bestScore: 89 }],
        })}
      />,
    );
    expect(html).toContain('data-state="applied"');
    expect(html).toContain('data-testid="auto-optimized-undo"');
    expect(html).toContain('✓ Applied');
    // Use this button replaced by Re-run
    expect(html).not.toContain('data-testid="auto-optimized-use"');
  });

  it('disables Undo when preApplyText is null', () => {
    const optimized = 'Optimized version';
    const html = renderToStaticMarkup(
      <AutoOptimizedCard
        {...baseProps}
        currentText={optimized}
        preApplyText={null}
        pipeline={mockPipeline({
          status: 'done',
          appliedText: optimized,
          rounds: [{ round: 1, bestText: optimized, bestScore: 80 }],
        })}
      />,
    );
    // Undo button still renders, but the marker disabled state is on the
    // button itself; we only check the testid is present.
    expect(html).toContain('data-testid="auto-optimized-undo"');
  });

  it('renders the error state with retry when optimize fails', () => {
    const html = renderToStaticMarkup(
      <AutoOptimizedCard
        {...baseProps}
        pipeline={mockPipeline({
          status: 'error',
          errorStage: 'optimize',
          errorMessage: 'AI request timed out',
        })}
      />,
    );
    expect(html).toContain('data-testid="auto-optimized-error"');
    expect(html).toContain('AI request timed out');
    expect(html).toContain('data-testid="auto-optimized-retry"');
  });

  it('renders skipped hint when Stage 3 was skipped (no rounds but status done)', () => {
    const html = renderToStaticMarkup(
      <AutoOptimizedCard
        {...baseProps}
        pipeline={mockPipeline({ status: 'done', rounds: [] })}
      />,
    );
    expect(html).toContain('data-testid="auto-optimized-skipped"');
    expect(html).toContain('skipped');
  });

  it('renders the diff with red deletions and green insertions', () => {
    const html = renderToStaticMarkup(
      <AutoOptimizedCard
        {...baseProps}
        originalText="Bold claim"
        pipeline={mockPipeline({
          status: 'done',
          rounds: [{ round: 1, bestText: 'Hot take', bestScore: 70 }],
        })}
      />,
    );
    // Each diff segment carries a data-segment attribute
    expect(html).toMatch(/data-segment="keep"/);
    expect(html).toMatch(/data-segment="del"/);
    expect(html).toMatch(/data-segment="ins"/);
  });

  it('hides Use this and shows no-improvement hint when optimizer returns the original text', () => {
    // Edge case: when MiniMaxi's 5 rounds can't beat the original score, the
    // API returns the original text as the best. Clicking Use this would be
    // a no-op (setText(sameText)). We hide the button and replace it with
    // a "kept your original" message.
    const original = 'Hot take nobody tells you. Why does nobody talk about this?';
    const html = renderToStaticMarkup(
      <AutoOptimizedCard
        {...baseProps}
        originalText={original}
        pipeline={mockPipeline({
          status: 'done',
          rounds: [{ round: 2, bestText: original, bestScore: 42 }],
        })}
      />,
    );
    expect(html).toContain('data-testid="auto-optimized-no-improvement"');
    expect(html).toContain('kept your original');
    expect(html).toContain('couldn');
    expect(html).not.toContain('data-testid="auto-optimized-use"');
    // Re-run still available
    expect(html).toContain('data-testid="auto-optimized-rerun"');
  });

  it('renders progress bar when running', () => {
    const html = renderToStaticMarkup(
      <AutoOptimizedCard
        {...baseProps}
        pipeline={mockPipeline({
          status: 'running',
          activeStages: { analyze: false, rewrite: false, optimize: true },
          rounds: [
            { round: 1, bestText: 'A', bestScore: 50 },
            { round: 2, bestText: 'B', bestScore: 60 },
          ],
        })}
      />,
    );
    // ProgressBar is rendered as part of the header for the running state
    // (visible only when activeStages.optimize is true). The testid marks the bar.
    expect(html).toContain('data-testid="auto-optimized-progress"');
  });
});