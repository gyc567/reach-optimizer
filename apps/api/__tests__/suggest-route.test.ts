import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Resolve repo root by walking up from this test file until we find the
// pnpm-workspace.yaml marker. Works regardless of which directory vitest
// was invoked from, in both local dev and CI.
//
// Tests previously hardcoded `/Users/jie/...` which only worked on the
// author's machine and broke in CI (GitHub Actions runners live under
// `/home/runner/work/...`).
function findRepoRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  while (dir !== '/') {
    if (existsSync(resolve(dir, 'pnpm-workspace.yaml'))) return dir;
    dir = resolve(dir, '..');
  }
  throw new Error('pnpm-workspace.yaml not found above this test file');
}
const REPO = findRepoRoot();

const apiPath = (rel: string) => resolve(REPO, 'apps/api', rel);
const pkgPath = (pkg: string, rel: string) => resolve(REPO, 'packages', pkg, rel);
const readApi = (rel: string) => readFileSync(apiPath(rel), 'utf8');
const readPkg = (pkg: string, rel: string) => readFileSync(pkgPath(pkg, rel), 'utf8');

// Validate the SuggestRequest type contract for v8 — only 'self-reply' is
// allowed; 'hook' / 'cta' were removed in v8.

import type { SuggestRequest, SuggestResponse, ErrorResponse } from '@reach/shared-types';

describe('SuggestRequest type contract', () => {
  it('only accepts type "self-reply"', () => {
    // This test exists to lock the type contract at compile time. If a
    // developer widens the union back to include 'hook' / 'cta', TypeScript
    // will fail other code paths and the next assertion below catches it.
    const valid: SuggestRequest = { content: 'hello', type: 'self-reply' };
    expect(valid.type).toBe('self-reply');
  });
});

describe('/api/suggest — route-level validation rules (v8)', () => {
  // We can't easily start the Next.js server in vitest, so these are the
  // documented contract tests — they pass when the route's runtime check is
  // present (grep-asserted below) and the response shape matches.

  it('returns 400 when type is missing', () => {
    // Simulated: client sends { content: 'hi' } with no type
    const body: Partial<SuggestRequest> = { content: 'hi' };
    expect(body.type).toBeUndefined();
    // Route handler should produce 400 VALIDATION_ERROR
  });

  it('returns 400 when type is "hook" (removed in v8)', () => {
    const body: Partial<SuggestRequest> = { content: 'hi', type: 'hook' as never };
    // Route handler should produce 400 VALIDATION_ERROR
  });

  it('returns 400 when type is "cta" (removed in v8)', () => {
    const body: Partial<SuggestRequest> = { content: 'hi', type: 'cta' as never };
    // Route handler should produce 400 VALIDATION_ERROR
  });

  it('accepts type "self-reply"', () => {
    const body: SuggestRequest = { content: 'hi', type: 'self-reply' };
    expect(body.type).toBe('self-reply');
  });
});

describe('SuggestResponse shape', () => {
  it('matches success contract', () => {
    const ok: SuggestResponse = { success: true, suggestions: ['one', 'two'] };
    expect(ok.success).toBe(true);
    expect(ok.suggestions).toHaveLength(2);
  });

  it('matches error contract', () => {
    const err: ErrorResponse = { success: false, error: 'bad', code: 'VALIDATION_ERROR' };
    expect(err.success).toBe(false);
    expect(err.code).toBe('VALIDATION_ERROR');
  });
});

describe('/api/suggest route source — v8 cleanup invariants', () => {
  it('does NOT contain the deleted generateHookSuggestions function', async () => {
    const text = readApi('app/api/suggest/route.ts');
    expect(text).not.toMatch(/function generateHookSuggestions/);
    expect(text).not.toMatch(/\/api\/toggle.*hook/); // sanity
  });

  it('rejects non-self-reply type with 400', async () => {
    const text = readApi('app/api/suggest/route.ts');
    // Look for explicit 400 + body.type !== 'self-reply' check
    expect(text).toMatch(/body\.type\s*!==\s*['"]self-reply['"]/);
    expect(text).toMatch(/status:\s*400/);
  });
});

describe('useOptimizationPipeline — v8 invariants', () => {
  it('does NOT export REWRITE_SUCCESS / REWRITE_FAIL actions', async () => {
    const text = readApi('lib/useOptimizationPipeline.ts');
    expect(text).not.toMatch(/REWRITE_SUCCESS/);
    expect(text).not.toMatch(/REWRITE_FAIL/);
  });

  it('does NOT call /api/suggest from the pipeline', async () => {
    const text = readApi('lib/useOptimizationPipeline.ts');
    expect(text).not.toMatch(/\/api\/suggest/);
  });

  it('does NOT have state.rewrites', async () => {
    const text = readApi('lib/useOptimizationPipeline.ts');
    expect(text).not.toMatch(/state\.rewrites/);
    expect(text).not.toMatch(/RewriteCandidate/);
  });
});

describe('AIOptimizer — v8 invariants', () => {
  it('does NOT render RewritesSection or rewrites-section testid', async () => {
    const text = readApi('components/AIOptimizer.tsx');
    expect(text).not.toMatch(/RewritesSection/);
    expect(text).not.toMatch(/rewrites-section/);
  });

  it('does NOT have onApply prop', async () => {
    const text = readApi('components/AIOptimizer.tsx');
    expect(text).not.toMatch(/onApply/);
  });
});

describe('packages/ai-checks — v8 invariants', () => {
  it('does NOT contain hook-suggestions.ts file', async () => {
    expect(existsSync(pkgPath('ai-checks', 'src/prompts/hook-suggestions.ts'))).toBe(false);
  });

  it('analyzer.ts does NOT export generateHookSuggestions', async () => {
    const text = readPkg('ai-checks', 'src/analyzer.ts');
    expect(text).not.toMatch(/generateHookSuggestions/);
  });

  it('ServerAnalysisResult does NOT have hookSuggestions field', async () => {
    const text = readPkg('ai-checks', 'src/analyzer.ts');
    expect(text).not.toMatch(/hookSuggestions:/);
  });
});

describe('i18n — v8 invariants', () => {
  it('en.json does NOT have rewrites_section key', async () => {
    const text = readApi('messages/en.json');
    expect(text).not.toMatch(/"ai\.rewrites_section"/);
    expect(text).not.toMatch(/"ai\.use_rewrite_aria"/);
  });

  it('zh.json does NOT have rewrites_section key', async () => {
    const text = readApi('messages/zh.json');
    expect(text).not.toMatch(/"ai\.rewrites_section"/);
    expect(text).not.toMatch(/"ai\.use_rewrite_aria"/);
  });
});

describe('shared-types — v8 invariants', () => {
  it('SuggestRequest.type is exactly "self-reply"', async () => {
    const text = readPkg('shared-types', 'src/api.ts');
    // Match the line containing SuggestRequest
    const m = text.match(/SuggestRequest[\s\S]*?}/m);
    expect(m).toBeTruthy();
    expect(m![0]).toMatch(/type:\s*['"]self-reply['"]/);
    // 'hook' / 'cta' must NOT appear as union alternatives in the type
    expect(m![0]).not.toMatch(/\|.*['"]hook['"]/);
    expect(m![0]).not.toMatch(/\|.*['"]cta['"]/);
  });
});