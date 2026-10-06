import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Resolve repo root by walking up from this test file until we find
// pnpm-workspace.yaml. Works regardless of which directory vitest was
// invoked from, in both local dev and CI. (Tests previously hardcoded
// `/Users/jie/...` paths which only worked on the author's machine.)
function findRepoRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  while (dir !== '/') {
    if (existsSync(resolve(dir, 'pnpm-workspace.yaml'))) return dir;
    dir = resolve(dir, '..');
  }
  throw new Error('pnpm-workspace.yaml not found above this test file');
}
const REPO = findRepoRoot();
const FAB_SOURCE = resolve(REPO, 'apps/api/components/CatProgressFab.tsx');
const readFab = () => readFileSync(FAB_SOURCE, 'utf8');

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
    const text = readFab();
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
    const text = readFab();
    // No emoji in source (cross-platform consistency)
    expect(text).not.toMatch(/💤|🦋|😺|😾/);
    // But SVG path elements exist
    expect(text).toMatch(/<path[\s\S]*?\/>/);
  });

  it('uses role="group" for FAB (NOT role="status" — to avoid a11y interruption)', async () => {
    const text = readFab();
    expect(text).toMatch(/role="group"/);
    expect(text).not.toMatch(/role="status"/);
  });

  it('puts role="progressbar" inside tooltip, not on FAB', async () => {
    const text = readFab();
    expect(text).toMatch(/role="progressbar"/);
    expect(text).toMatch(/aria-valuemin=\{0\}/);
    expect(text).toMatch(/aria-valuemax=\{100\}/);
    expect(text).toMatch(/aria-valuenow=/);
  });

  it('has aria-live="polite" on tooltip for screen reader announcements', async () => {
    const text = readFab();
    expect(text).toMatch(/aria-live="polite"/);
  });

  it('uses position: fixed (modal layer)', async () => {
    const text = readFab();
    expect(text).toMatch(/position:\s*['"]fixed['"]/);
  });

  it('centers with top: 50% / left: 50% / translate(-50%, -50%)', async () => {
    const text = readFab();
    expect(text).toMatch(/top:\s*['"]50%['"]/);
    expect(text).toMatch(/left:\s*['"]50%['"]/);
    expect(text).toMatch(/translate\(-50%, -50%\)/);
  });

  it('uses z-index 1000 (modal layer, above backdrop at 999)', async () => {
    const text = readFab();
    // Accept either literal or named constant — both forms are valid.
    expect(text).toMatch(/zIndex:\s*(?:1000|FAB_Z)/);
    expect(text).toMatch(/BACKDROP_Z\s*=\s*999|FAB_Z\s*=\s*1000/);
    expect(text).toMatch(/zIndex:\s*(?:999|BACKDROP_Z)/);
  });

  it('renders backdrop element with click-to-abort', async () => {
    const text = readFab();
    expect(text).toMatch(/data-testid="cat-progress-backdrop"/);
    expect(text).toMatch(/rgba\(0, 0, 0, 0\.5\)/);
    expect(text).toMatch(/onClick=\{onAbort\}/);
  });

  it('updates FAB_SIZE constant to 96', async () => {
    const text = readFab();
    expect(text).toMatch(/FAB_SIZE\s*=\s*96/);
  });

  it('auto-focuses FAB on mount via requestAnimationFrame', async () => {
    const text = readFab();
    // Either ref name is fine — what matters is "FAB is focused via rAF".
    expect(text).toMatch(/requestAnimationFrame/);
    expect(text).toMatch(/(?:fabRef|circleRef)\.current\?\.focus\(\)/);
  });

  it('restores focus on unmount to previously-focused element', async () => {
    const text = readFab();
    expect(text).toMatch(/previousFocusRef/);
    expect(text).toMatch(/document\.activeElement/);
  });

  it('handles Escape key to abort', async () => {
    const text = readFab();
    expect(text).toMatch(/['"]Escape['"]/);
    expect(text).toMatch(/onAbort\(\)/);
  });

  it('traps focus inside FAB + abort button via Tab key', async () => {
    const text = readFab();
    // The trap is anchored on the inner circle (where focus actually lands),
    // not the outer container — so the order array contains circleRef, not fabRef.
    expect(text).toMatch(/abortButtonRef/);
    expect(text).toMatch(/['"]Tab['"]/);
    expect(text).toMatch(/window\.addEventListener\(['"]keydown['"]/);
    expect(text).toMatch(/\[circleRef\.current, abortButtonRef\.current\]/);
  });

  it('auto-dismisses error FAB after 8s by calling onAbort()', async () => {
    const text = readFab();
    // The 8s timeout must actually invoke onAbort() — not be a no-op —
    // so the FAB unmounts when the pipeline errors and the user doesn't
    // manually cancel.
    expect(text).toMatch(/window\.setTimeout/);
    expect(text).toMatch(/8000/);
    expect(text).toMatch(/onAbort\(\)/);
  });

  it('uses :focus (not :focus-visible) so the ring shows on auto-focus', async () => {
    const text = readFab();
    // :focus-visible would skip programmatic focus from a click gesture;
    // :focus shows the ring any time the element is focused.
    expect(text).toMatch(/\.cat-progress-circle-focusable:focus\s*\{/);
    expect(text).not.toMatch(/\.cat-progress-circle-focusable:focus-visible\s*\{/);
  });

  it('uses entrance animation (catFadeIn + catBackdropFade)', async () => {
    const text = readFab();
    expect(text).toMatch(/@keyframes catFadeIn/);
    expect(text).toMatch(/@keyframes catBackdropFade/);
    expect(text).toMatch(/scale\(0\.85/);
  });

  it('unmounts when status !== running (defensive)', async () => {
    const text = readFab();
    expect(text).toMatch(/if \(state\.status !== 'running'\) return null/);
  });

  it('unmounts when mood is done', async () => {
    const text = readFab();
    expect(text).toMatch(/if \(mood === 'done'\) return null/);
  });

  it('uses SVG ring with stroke-dasharray for progress', async () => {
    const text = readFab();
    expect(text).toMatch(/strokeDasharray=/);
    expect(text).toMatch(/strokeDashoffset=/);
  });

  it('has 4 distinct cat face moods (analyzing/optimizing/error/done)', async () => {
    const text = readFab();
    expect(text).toMatch(/mood === 'analyzing'/);
    expect(text).toMatch(/mood === 'optimizing'/);
    expect(text).toMatch(/mood === 'error'/);
    expect(text).toMatch(/mood === 'done'/);
  });
});
