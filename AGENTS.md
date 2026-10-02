# AGENTS.md

Guidance for any coding agent (Kimi Code, Claude Code, Codex, opencode, …) working in this repository. This file is the canonical copy — `CLAUDE.md` is a pointer here.

## What this is

**TopDiggX** (user-facing brand — Chrome Web Store, in-product chrome, README title). System / platform name is **ReachOS** (repo path `reach-optimizer`, package names `@reach/*`, JWT cookie `reachos_token`, internal docs, commits). When writing user-visible strings, use **TopDiggX**; in code/commits use **ReachOS** consistently.

TopDiggX scores tweets in real time against the **22-signal taxonomy** published in [`xai-org/x-algorithm`](https://github.com/xai-org/x-algorithm) (May 2026 Phoenix release), extended by v4.1 coverage work (ad disclosure, video-first, post frequency, microniche) to **25 predictors in code** (`SIGNAL_NAMES` in `packages/shared-types/src/rules.ts`). When marketing says "22 signals" it refers to the taxonomy; the implementation count is 25 — keep both statements accurate in docs.

BYOK (Bring Your Own Keys), self-hostable, MIT licensed.

The hard requirement that drives most of the architecture: **scoring must update on every keystroke in the X.com composer, with zero server round-trip.** All signal predictors run client-side (extension and web app). The server (Next.js on Vercel) only contributes an *AI delta* — slop detection, hook quality, trending alignment — that merges into the existing client score.

## Commands

```bash
# Install (pnpm 10.23, workspaces enabled)
pnpm install

# Dev (turbo runs everything in parallel; API on :3100, extension on vite dev)
pnpm dev

# Build / typecheck / test (all use turbo, so they hit every package)
pnpm build
pnpm typecheck
pnpm test

# Single package — most useful during iteration
pnpm --filter @reach/rules-engine test          # signal/rule + forecast tests
pnpm --filter @reach/rules-engine test:watch
pnpm --filter @reach/ai-checks   test           # slop + analyzer + anthropic-fetch tests
pnpm --filter @reach/api         test           # web app unit tests (vitest)
pnpm --filter @reach/extension   dev            # hot-reload extension
pnpm --filter @reach/extension   build          # produces apps/extension/dist/

# Database (API only)
cd apps/api
npx prisma db push        # apply schema.prisma to DATABASE_URL
npx prisma studio         # browse data

# Deploy (vercel — turbo prunes to ./out, runs prisma generate, then vercel deploy)
pnpm deploy                # prod
pnpm deploy:preview        # preview
```

The Vercel project root is `apps/api`; the extension is a separate artifact built with `pnpm --filter @reach/extension build` and loaded via `chrome://extensions` → "Load unpacked" → `apps/extension/dist/`.

## Repository layout

```
apps/
  api/                Next.js 15 — @reach/api
    app/api/           route groups (analyze, suggest, tweets/*, cron/*, auth/*, …)
    app/page.tsx       Tweet scorer (web plan v2 core page)
    app/welcome/       Landing page (moved here from /)
    app/analyze/       Account analysis page
    app/dashboard/     Web dashboard (JWT-gated)
    app/components/    Shared scorer UI (TweetComposer, ScoreGauge, …)
    lib/               auth (jose/JWT), db (Prisma), env, trending, weight-learner,
                       calibration, i18n*, useOptimizationPipeline, word-diff, styles
    prisma/schema.prisma   User, Analysis, TrackedTweet, TweetMetric
  extension/          Chrome MV3 — @reach/extension
    src/content/       index.tsx (React root in Shadow DOM), ScoreOverlay, xray-mode,
                       composer-detector, post-tracker, reply-coach
                       forecast-engine.ts  → thin re-export of @reach/rules-engine/forecast
    src/popup/         Popup.tsx — auth, settings, tracked-tweet list
    src/background/    service-worker.ts — message router, Anthropic direct-call proxy
packages/
  rules-engine/       @reach/rules-engine — ScoreEngine + 25 signal predictors + forecast
    src/signals/       One file per signal. Names mirror xai-org/x-algorithm 1:1
    src/forecast.ts    computeForecast — shared by extension and web app
    src/config/weights.json    Single source of truth for signal weights and tiers
    src/__tests__/     engine.test, corpus.test (200-post calibration), forecast.test
  ai-checks/          @reach/ai-checks — Claude integration (slop, hook, suggestions)
    src/anthropic-fetch.ts     Single Anthropic-compatible HTTP site (ANTHROPIC_BASE_URL)
    src/safe-parse-json.ts     Resilient JSON extraction from model responses
    src/analyzer.ts    AIAnalyzer — heuristic + Claude merge
    src/prompts/       slop-analysis, hook-quality, hook-suggestions
  shared-types/       @reach/shared-types — TweetInput, AnalysisResult, SignalName, etc.
```

The API `next.config.ts` has `transpilePackages: ['@reach/shared-types', '@reach/rules-engine', '@reach/ai-checks']` because workspace packages ship as `.ts` source. The extension builds them via vite the same way.

## Scoring model (read this before touching the engine)

`packages/rules-engine/src/config/weights.json` is the single source of truth.

- `baseScore`: 30
- Each signal contributes either `maxPoints` (positive) or `maxPenalty` (negative)
- Positive Σ capped at +65 (30 + 65 = 95 max); negative Σ capped at −50 (floor)
- Final: clamp `[0, 100]`, then `assignTier(score)` picks critical / below_average / excellent / perfect / good
- `applicable: false` (conditional signals with unmet precondition) contribute **0, not negative** — never penalise for missing media

The extension inlines a `tierForScore()` helper in `apps/extension/src/content/index.tsx` that **must** mirror `weights.json` tier boundaries; if you change one, change the other.

**Server merges by delta, not replacement.** `mergeServerResult()` in `apps/extension/src/content/index.tsx` adds the server's points only to (not replaces) the client score, then recomputes the tier from the new total so colour/label stay coherent across tier boundaries. Client score is always source of truth for `hasMedia` / `isQuoteTweet` / `hasExternalLink`.

## Conventions that will bite you if you ignore them

- **Signal names are contract.** `SignalName` in `packages/shared-types/src/rules.ts` lists the exact strings (`favorite`, `reply`, `click`, `share_via_dm`, …). Do not rename, do not localise, do not add unsignalled bonuses — they won't survive `corpus.test.ts`.
- **Calibration corpus.** `packages/rules-engine/src/__tests__/corpus.test.ts` ships 200 posts bucketed (dead / average / strong / viral / spam) and asserts the engine's output bucket within 20% noise. If you tweak weights or add a predictor, re-run it; if it fails, either revert or update the corpus deliberately and document why.
- **Regex `.test()` flag.** Never `/g` with `.test()` — `lastIndex` advances and you get non-deterministic matches. Use `/g` only with `.match()` / `.replace()`. (Enforced by review; see CONTRIBUTING.md.)
- **Heuristic-first, LLM-confirm.** `AIAnalyzer.analyzeSlop()` runs the 28-pattern heuristic first; only if the heuristic score > 30 does it call Claude to confirm and average. Keeps cost/latency down.
- **One Anthropic call site.** `packages/ai-checks/src/anthropic-fetch.ts` is the single HTTP wrapper for `/v1/messages` (reads `ANTHROPIC_BASE_URL` for Anthropic-compatible endpoints such as MiniMaxi, model constant `ANTHROPIC_MODEL`). Do not add new raw `fetch('https://api.anthropic.com/...')` call sites — route them through this wrapper.
- **API contracts are frozen.** The Chrome extension (published, CORS `*`) consumes `/api/analyze`, `/api/suggest`, `/api/tweets/auto-optimize`, `/api/timing`, `/api/trending`. Response shapes may only grow additively (new optional fields) — never rename/remove/change types. See `loop-constraints.md`.
- **BYOK Anthropic.** The extension can call `https://api.anthropic.com` itself (`host_permissions` in `manifest.json`). Service worker handles `DIRECT_ANTHROPIC` messages with the user's stored key. `API_REQUEST` routes to the deployed Vercel API.
- **Cron endpoints** (Vercel cron, schedules in `vercel.json` — hosted on Vercel, do NOT re-host them in GitHub Actions):
  - `/api/cron/fetch-metrics` every 15 min
  - `/api/cron/auto-optimize-pending` 03:00 UTC
  - `/api/cron/learn-weights` 04:00 UTC — computes weight adjustment *suggestions* (global suggestions are advisory only; per-user weights persist to `User.personalizedWeights`)
  - `/api/cron/calibrate-forecast` 05:00 UTC — per-user forecast calibration into `User.forecastCalibration`
  All gated by `CRON_SECRET` via `lib/cron-auth.ts`.

## Adding a new scoring signal

1. Create `packages/rules-engine/src/signals/<signal-name>.ts` — export `predict<SignalName>(ctx): SignalScore` (see `favorite.ts` / `reply.ts` for the minimal shape).
2. Register the signal in `packages/rules-engine/src/signals/index.ts` (`runAllSignals` / `signalPredictors`).
3. Add an entry to `weights.json` with `maxPoints` or `maxPenalty`, `type`, `bucket`, and `conditional` if it requires media/quote/etc.
5. Add the name to `SIGNAL_NAMES` in `packages/shared-types/src/rules.ts`.
6. Add corpus entries in `corpus.test.ts` covering at least one triggering and one non-triggering example.

## Testing patterns

- `vitest run` per package, orchestrated by `turbo run test` from root.
- `packages/rules-engine` has the densest coverage — extend there for any signal change.
- Engine tests live next to source as `*.test.ts`; corpus test is `corpus.test.ts`.
- `apps/api` has component/unit tests under `__tests__/` and `lib/__tests__/` (vitest). API-contract snapshot tests are planned (web plan v2 §Week 3–4) — until they exist, treat response shapes as frozen by convention.
- No end-to-end browser tests in repo — manual via `pnpm --filter @reach/extension dev` and reloading the extension on `x.com`.

## Environment

Copy `.env.example` to `apps/api/.env.local`. Required: `DATABASE_URL` (Postgres, free tier on Neon works), `JWT_SECRET` (`openssl rand -hex 32`), `X_CLIENT_ID`/`X_CLIENT_SECRET` for the OAuth callback. Optional, degrades gracefully: `ANTHROPIC_API_KEY` (AI delta), `ANTHROPIC_BASE_URL` (Anthropic-compatible endpoint, e.g. MiniMaxi — read by `anthropic-fetch.ts` and the SDK client), `TWITTER_API_IO_KEY` (trending + post-mortem metrics), `CRON_SECRET` (cron gate), `APP_URL`, `OPS_DATABASE_URL`.

## Loop engineering (how this repo is operated)

This repo is operated with [loop-engineering](https://github.com/cobusgreyling/loop-engineering) patterns. Before doing loop-related work, read:

- `LOOP.md` — loop registry (E0–E5 engineering loops, D1–D4 domain loops), levels, cadence, handoffs
- `loop-constraints.md` — machine-readable constraints every loop run enforces first
- `gate.yaml` — path denylist / near-denylist / additive-only / contract-frozen zones (+ `maxFiles: 10`)
- `STATE.md` — live loop state (high priority / watch / noise + lock)
- `loop-budget.md` — spend caps and the kill switch (agent cannot self-raise caps)
- `skills/` — harness-neutral loop skills (triage, minimal-fix, verify-build, calibration-check)

Standing rules: new loops start at **L1 report-only**; no auto-merge (no allowlist entries yet); `weights.json` changes only via the D2 governance path with human sign-off; every loop run appends to `loop-run-log.md`.

## Further reading

- `README.md` — user-facing overview, feature list, scoring weights table, deploy instructions.
- `docs/reachos-web-plan.md` — Web 版方案 v2（审计修订版）：评分器/AI 面板/账号分析/Reach 预测的产品需求与契约。
- `CONTRIBUTING.md` — the canonical "how to add a rule" guide (v3-shaped, but the rule-format block is still accurate).
- `CHANGELOG.md` — v4.0 is the breaking release that introduced the current architecture. Worth skimming before any API or signal-shape work.
- `docs/superpowers/specs/2026-05-15-reachos-v4-x-algorithm-alignment-design.md` — design rationale for the v4 realignment to `xai-org/x-algorithm`.
