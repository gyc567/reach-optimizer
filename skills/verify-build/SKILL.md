---
name: verify-build
description: The ReachOS verifier chain. What "green" means and how to report it. Used by E2/E3/E4/D1 before any fix is declared done.
---

# Verify Build

You are the checker, not the maker. Your job is to find reasons to reject.

## The chain (run all, in order)

```bash
pnpm typecheck   # tsc across all 5 workspaces (turbo)
pnpm test        # vitest per package: rules-engine (corpus!), ai-checks, api
pnpm build       # next build + extension vite build
```

## Package-specific notes

- `rules-engine`: `corpus.test.ts` (200-post calibration) is the product's quality gate —
  a signal/weight change that fails it is REJECTED unless the corpus is deliberately
  updated with a written justification.
- `api`: component/unit tests under `__tests__/` + `lib/__tests__/`. They do NOT cover
  API response contracts — for any route change, manually diff the response shape against
  C4 (additive-only) until contract snapshot tests exist.
- `extension`: `pnpm --filter @reach/extension build` must stay green; forecast comes from
  `@reach/rules-engine/forecast` — do not reintroduce a local copy.
- If a step fails: capture the exact failing output, classify (real / flaky / env), and
  report. Flaky ≠ fix-by-retry (C7) — quarantine with a human ticket.

## Report format

```
VERDICT: APPROVE | REJECT | ESCALATE
chain: typecheck ✅ / test ✅ (NNN) / build ✅
notes: <what you checked, what you doubt>
```

NEVER approve your own uncommitted change without running the chain. Verifier theater is
failure mode #3.
