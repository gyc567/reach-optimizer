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
const readApi = (rel: string) => readFileSync(resolve(REPO, 'apps/api', rel), 'utf8');
const readPkg = (pkg: string, rel: string) => readFileSync(resolve(REPO, 'packages', pkg, rel), 'utf8');

import { deriveButtonState, getRunningRound } from '@lib/pipeline-button';
import { PIPELINE_INITIAL_STATE } from '@lib/useOptimizationPipeline';
import type { PipelineState } from '@lib/useOptimizationPipeline';

function stateWith(overrides: Partial<PipelineState>): PipelineState {
  return { ...PIPELINE_INITIAL_STATE, ...overrides };
}

describe('deriveButtonState — v11 state machine', () => {
  it('returns "idle" when state is idle (initial)', () => {
    expect(deriveButtonState(PIPELINE_INITIAL_STATE)).toBe('idle');
  });

  it('returns "running" when status is running', () => {
    expect(
      deriveButtonState(
        stateWith({ status: 'running', activeStages: { analyze: true, optimize: false } }),
      ),
    ).toBe('running');
  });

  it('returns "running" during optimize (rounds > 0)', () => {
    expect(
      deriveButtonState(
        stateWith({
          status: 'running',
          activeStages: { analyze: false, optimize: true },
          rounds: [{ round: 1, bestText: 'a', bestScore: 50 }],
        }),
      ),
    ).toBe('running');
  });

  it('returns "error" when status is error (regardless of stage)', () => {
    expect(
      deriveButtonState(
        stateWith({ status: 'error', errorStage: 'analyze' }),
      ),
    ).toBe('error');
  });

  it('returns "error" for optimize stage error too', () => {
    expect(
      deriveButtonState(
        stateWith({ status: 'error', errorStage: 'optimize' }),
      ),
    ).    toBe('error');
  });

  it('returns "result-ready" when done with rounds.length > 0', () => {
    // This is the bug fix — old logic kept button in "thinking" state forever
    expect(
      deriveButtonState(
        stateWith({
          status: 'done',
          rounds: [{ round: 1, bestText: 'a', bestScore: 50 }],
        }),
      ),
    ).toBe('result-ready');
  });

  it('returns "idle" when done with 0 rounds (skipped — score was high)', () => {
    expect(
      deriveButtonState(stateWith({ status: 'done', rounds: [] })),
    ).toBe('idle');
  });

  it('"running" takes precedence over "error" if both set (defensive)', () => {
    expect(
      deriveButtonState(
        stateWith({
          status: 'running',
          errorStage: 'analyze',
          activeStages: { analyze: true, optimize: false },
        }),
      ),
    ).toBe('running');
  });

  it('"error" takes precedence over "result-ready" if both set (defensive)', () => {
    expect(
      deriveButtonState(
        stateWith({
          status: 'error',
          rounds: [{ round: 1, bestText: 'a', bestScore: 50 }],
        }),
      ),
    ).toBe('error');
  });
});

describe('getRunningRound — round counter for button label', () => {
  it('returns null when status is idle', () => {
    expect(getRunningRound(PIPELINE_INITIAL_STATE)).toBeNull();
  });

  it('returns null when status is done (button not running anymore)', () => {
    expect(
      getRunningRound(
        stateWith({
          status: 'done',
          rounds: [{ round: 1, bestText: 'a', bestScore: 50 }],
        }),
      ),
    ).toBeNull();
  });

  it('returns null when status is error', () => {
    expect(getRunningRound(stateWith({ status: 'error' }))).toBeNull();
  });

  it('returns null during analyze stage (no rounds yet)', () => {
    expect(
      getRunningRound(
        stateWith({
          status: 'running',
          activeStages: { analyze: true, optimize: false },
        }),
      ),
    ).toBeNull();
  });

  it('returns null during optimize with 0 rounds', () => {
    expect(
      getRunningRound(
        stateWith({
          status: 'running',
          activeStages: { analyze: false, optimize: true },
          rounds: [],
        }),
      ),
    ).toBeNull();
  });

  it('returns {current, total} during optimize with ≥ 1 round', () => {
    expect(
      getRunningRound(
        stateWith({
          status: 'running',
          activeStages: { analyze: false, optimize: true },
          rounds: [
            { round: 1, bestText: 'a', bestScore: 50 },
            { round: 2, bestText: 'b', bestScore: 55 },
          ],
          optimizeMaxRounds: 5,
        }),
      ),
    ).toEqual({ current: 2, total: 5 });
  });

  it('respects optimizeMaxRounds for total', () => {
    expect(
      getRunningRound(
        stateWith({
          status: 'running',
          activeStages: { analyze: false, optimize: true },
          rounds: [{ round: 1, bestText: 'a', bestScore: 50 }],
          optimizeMaxRounds: 3,
        }),
      ),
    ).toEqual({ current: 1, total: 3 });
  });
});

describe('v11 source contracts — bug fix verification', () => {
  it('app/page.tsx does NOT check appliedText === null (dead branch removed)', async () => {
    const text = readApi("app/page.tsx");
    expect(text).not.toMatch(/appliedText\s*===\s*null/);
  });

  it('app/page.tsx uses deriveButtonState from pipeline-button module', async () => {
    const text = readApi("app/page.tsx");
    expect(text).toMatch(/import\s*\{[^}]*deriveButtonState[^}]*\}\s*from\s*['"]@lib\/pipeline-button['"]/);
    expect(text).toMatch(/deriveButtonState\(pipeline\.state\)/);
  });

  it('app/page.tsx uses getRunningRound for running counter', async () => {
    const text = readApi("app/page.tsx");
    expect(text).toMatch(/getRunningRound\(pipeline\.state\)/);
  });

  it('TweetComposer no longer uses aiPending prop name', async () => {
    const text = readApi("components/TweetComposer.tsx");
    // Allow the comment that mentions it historically, but no prop destructuring
    expect(text).not.toMatch(/aiPending\??:\s*boolean/);
    expect(text).not.toMatch(/^\s*aiPending,?\s*$/m);
  });

  it('TweetComposer exposes aiButtonState prop', async () => {
    const text = readApi("components/TweetComposer.tsx");
    expect(text).toMatch(/aiButtonState\??:\s*AIButtonState/);
    expect(text).toMatch(/runningRound\??:\s*\{/);
  });

  it('TweetComposer renders data-button-state attribute on the AI button', async () => {
    const text = readApi("components/TweetComposer.tsx");
    expect(text).toMatch(/data-button-state=\{aiButtonState\}/);
  });

  it('TweetComposer sets aria-disabled alongside disabled', async () => {
    const text = readApi("components/TweetComposer.tsx");
    expect(text).toMatch(/aria-disabled=\{isDisabled\}/);
  });

  it('i18n en.json has v11 new keys', async () => {
    const text = readApi("messages/en.json");
    expect(text).toMatch(/"common\.thinking_with_progress"/);
    expect(text).toMatch(/"common\.rerun_short"/);
    expect(text).toMatch(/"common\.retry_short"/);
  });

  it('i18n zh.json has v11 new keys', async () => {
    const text = readApi("messages/zh.json");
    expect(text).toMatch(/"common\.thinking_with_progress"/);
    expect(text).toMatch(/"common\.rerun_short"/);
    expect(text).toMatch(/"common\.retry_short"/);
  });
});
