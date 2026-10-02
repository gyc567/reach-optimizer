import { describe, it, expect } from 'vitest';
import {
  deriveMood,
  getRingColor,
} from '@components/CatProgressFab';
import { PIPELINE_INITIAL_STATE } from '@lib/useOptimizationPipeline';
import type { PipelineState } from '@lib/useOptimizationPipeline';
import { colors } from '@lib/styles';

function stateWith(overrides: Partial<PipelineState>): PipelineState {
  return { ...PIPELINE_INITIAL_STATE, ...overrides };
}

describe('deriveMood — pure state machine', () => {
  it('returns "analyzing" when activeStages.analyze is true', () => {
    expect(
      deriveMood(stateWith({ activeStages: { analyze: true, optimize: false } })),
    ).toBe('analyzing');
  });

  it('returns "optimizing" when activeStages.optimize is true', () => {
    expect(
      deriveMood(stateWith({ activeStages: { analyze: false, optimize: true } })),
    ).toBe('optimizing');
  });

  it('returns "done" when status is done', () => {
    expect(deriveMood(stateWith({ status: 'done' }))).toBe('done');
  });

  it('returns "error" when errorStage is analyze', () => {
    expect(
      deriveMood(stateWith({ status: 'error', errorStage: 'analyze' })),
    ).toBe('error');
  });

  it('returns "error" when errorStage is optimize', () => {
    expect(
      deriveMood(stateWith({ status: 'error', errorStage: 'optimize' })),
    ).toBe('error');
  });

  it('falls back to "analyzing" for idle state (defensive)', () => {
    expect(deriveMood(PIPELINE_INITIAL_STATE)).toBe('analyzing');
  });

  it('error takes precedence over running optimize', () => {
    expect(
      deriveMood(
        stateWith({
          status: 'error',
          errorStage: 'optimize',
          activeStages: { analyze: false, optimize: true },
        }),
      ),
    ).toBe('error');
  });

  it('done takes precedence over running', () => {
    expect(
      deriveMood(
        stateWith({
          status: 'done',
          activeStages: { analyze: true, optimize: false },
        }),
      ),
    ).toBe('done');
  });
});

describe('getRingColor — color mapping', () => {
  it('returns purple for analyzing', () => {
    expect(getRingColor('analyzing')).toBe(colors.accent.purple);
  });

  it('returns blue for optimizing', () => {
    expect(getRingColor('optimizing')).toBe(colors.accent.blue);
  });

  it('returns green for done', () => {
    expect(getRingColor('done')).toBe(colors.accent.green);
  });

  it('returns red for error', () => {
    expect(getRingColor('error')).toBe(colors.accent.red);
  });
});

describe('CatProgressFab source contracts', () => {
  it('exports CatProgressFab component with proper testid', async () => {
    const fs = await import('fs');
    const text = fs.readFileSync(
      '/Users/jie/code/reach-optimizer/apps/api/components/CatProgressFab.tsx',
      'utf8',
    );
    expect(text).toMatch(/data-testid="cat-progress-fab"/);
    expect(text).toMatch(/data-testid="cat-progress-circle"/);
    expect(text).toMatch(/data-testid="cat-progress-ring"/);
    expect(text).toMatch(/data-testid="cat-progress-face"/);
    expect(text).toMatch(/data-testid="cat-progress-tooltip"/);
    expect(text).toMatch(/data-testid="cat-progress-abort"/);
    expect(text).toMatch(/data-testid="cat-progress-status"/);
    expect(text).toMatch(/data-testid="cat-progress-meta"/);
  });

  it('uses SVG paths for mouth/face — NOT emojis', async () => {
    const fs = await import('fs');
    const text = fs.readFileSync(
      '/Users/jie/code/reach-optimizer/apps/api/components/CatProgressFab.tsx',
      'utf8',
    );
    // No emoji in source (cross-platform consistency)
    expect(text).not.toMatch(/💤|🦋|😺|😾/);
    // But SVG path elements exist
    expect(text).toMatch(/<path[\s\S]*?\/>/);
  });

  it('uses role="group" for FAB (NOT role="status" — to avoid a11y interruption)', async () => {
    const fs = await import('fs');
    const text = fs.readFileSync(
      '/Users/jie/code/reach-optimizer/apps/api/components/CatProgressFab.tsx',
      'utf8',
    );
    expect(text).toMatch(/role="group"/);
    expect(text).not.toMatch(/role="status"/);
  });

  it('puts role="progressbar" inside tooltip, not on FAB', async () => {
    const fs = await import('fs');
    const text = fs.readFileSync(
      '/Users/jie/code/reach-optimizer/apps/api/components/CatProgressFab.tsx',
      'utf8',
    );
    expect(text).toMatch(/role="progressbar"/);
    expect(text).toMatch(/aria-valuemin=\{0\}/);
    expect(text).toMatch(/aria-valuemax=\{100\}/);
    expect(text).toMatch(/aria-valuenow=/);
  });

  it('has aria-live="polite" on tooltip for screen reader announcements', async () => {
    const fs = await import('fs');
    const text = fs.readFileSync(
      '/Users/jie/code/reach-optimizer/apps/api/components/CatProgressFab.tsx',
      'utf8',
    );
    expect(text).toMatch(/aria-live="polite"/);
  });

  it('uses position: fixed with safe-area-inset', async () => {
    const fs = await import('fs');
    const text = fs.readFileSync(
      '/Users/jie/code/reach-optimizer/apps/api/components/CatProgressFab.tsx',
      'utf8',
    );
    expect(text).toMatch(/position:\s*['"]fixed['"]/);
    expect(text).toMatch(/safe-area-inset-bottom/);
  });

  it('uses z-index 100 (not 1000 — leaves room for modal)', async () => {
    const fs = await import('fs');
    const text = fs.readFileSync(
      '/Users/jie/code/reach-optimizer/apps/api/components/CatProgressFab.tsx',
      'utf8',
    );
    expect(text).toMatch(/zIndex:\s*100/);
    expect(text).not.toMatch(/zIndex:\s*1000/);
  });

  it('unmounts when status !== running (defensive)', async () => {
    const fs = await import('fs');
    const text = fs.readFileSync(
      '/Users/jie/code/reach-optimizer/apps/api/components/CatProgressFab.tsx',
      'utf8',
    );
    expect(text).toMatch(/if \(state\.status !== 'running'\) return null/);
  });

  it('unmounts when mood is done', async () => {
    const fs = await import('fs');
    const text = fs.readFileSync(
      '/Users/jie/code/reach-optimizer/apps/api/components/CatProgressFab.tsx',
      'utf8',
    );
    expect(text).toMatch(/if \(mood === 'done'\) return null/);
  });

  it('uses SVG ring with stroke-dasharray for progress', async () => {
    const fs = await import('fs');
    const text = fs.readFileSync(
      '/Users/jie/code/reach-optimizer/apps/api/components/CatProgressFab.tsx',
      'utf8',
    );
    expect(text).toMatch(/strokeDasharray=/);
    expect(text).toMatch(/strokeDashoffset=/);
  });

  it('has 4 distinct cat face moods (analyzing/optimizing/error/done)', async () => {
    const fs = await import('fs');
    const text = fs.readFileSync(
      '/Users/jie/code/reach-optimizer/apps/api/components/CatProgressFab.tsx',
      'utf8',
    );
    expect(text).toMatch(/mood === 'analyzing'/);
    expect(text).toMatch(/mood === 'optimizing'/);
    expect(text).toMatch(/mood === 'error'/);
    expect(text).toMatch(/mood === 'done'/);
  });

  it('uses bottom-right positioning (24px from edges)', async () => {
    const fs = await import('fs');
    const text = fs.readFileSync(
      '/Users/jie/code/reach-optimizer/apps/api/components/CatProgressFab.tsx',
      'utf8',
    );
    expect(text).toMatch(/right:\s*24/);
    expect(text).toMatch(/bottom:/);
  });
});
