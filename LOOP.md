# LOOP.md — ReachOS Loop Registry

This repo is operated with [loop-engineering](https://github.com/cobusgreyling/loop-engineering)
patterns: loops discover work, hand it to agents, verify results, and persist state —
instead of a human typing the next prompt. Levels: **L1 report → L2 assisted → L3 unattended**
(with `loop-constraints.md` + `gate.yaml` + human gates always on). See `AGENTS.md` and
`docs/reachos-web-plan.md` (product plan) for context.

## Active loops

| Loop | Level | Cadence | Verifier | Stage (2026-10-02) |
|------|-------|---------|----------|--------------------|
| E0 minimal-ci | — | push/PR | self | ✅ landed (this bootstrap) |
| E1 daily-triage | L1 | 1d weekdays 00:17 UTC | — (script-only, no LLM) | ✅ landed — `scripts/triage.mjs` + `daily-triage.yml` |
| E2 ci-sweeper | L2 | CI-failure event + 1d | `pnpm typecheck && pnpm test && pnpm build` in worktree | not started |
| E3 dependency-sweeper | L2 | weekly (dependabot rhythm) | patch-only + full verify in worktree | not started (dependabot.yml landed) |
| E4 pr-babysitter | L2 | PR open/sync + 15m | review comment + worktree fix suggestion; **never merges** | not started |
| E5 changelog-drafter | L1 | on tag / release prep | human approves before publish | not started |
| D1 plan-executor | L2 | 1×/day or manual | verify chain + **API contract snapshots** + plan-v2 acceptance | in flight (Web plan v2 Phase 0–3 code exists — converging to PR) |
| D2 rule-autoresearch | L1 | 1d or manual | ① corpus.test ② unit ③ offline replay (MAPE not worse) ④ human sign-off on weights.json PR | not started — converts learn-weights' dead-end global suggestions into governed PRs |
| D3 weights-learning governance | observe | Vercel cron 04:00 UTC | suggestion-history table; alert on oscillation | not started — **observe only, never re-host this cron in Actions** |
| D4 forecast-calibration governance | observe | Vercel cron 05:00 UTC | calibration history + drift alert + one-click rollback | not started — observe only |

Priorities when loops collide (single code-change guard in `STATE.md → lock:`):
**E2 > E4 > D1 > E3 > E5 > E1**. D3/D4 run on the Vercel plane and only *observe* —
they never hold the code-change lock.

## Worktrees

Any unattended code-change attempt runs in an isolated git worktree, one per attempt,
discarded on verifier REJECT or human escalation. Never let two agents edit the same
checkout.

## Connectors

GitHub only (via `gh` / Actions token): read issues/PRs/checks; write comments/labels.
No merge. No Slack — escalations land as GitHub issue comments and in
`STATE.md → High Priority`. Secrets: `**/.env*` is denylisted and must never appear
in STATE.md, logs, or prompts.

MCP connectors: **not required** for current patterns — the GitHub API covers every
loop need. Revisit only if a future loop must drive external ticket/chat systems
(tracked here so the audit doesn't treat it as an accidental gap).

## Budget & observability

- Budget caps + kill switch: `loop-budget.md` (dual-unit: Actions minutes + agent sessions)
- Run history: `loop-run-log.md` (append-only, one JSON line per run)
- Loop Ready baseline: `docs/loop-baseline.md` (`@cobusgreyling/loop doctor|audit`)
- Kill switch: apply the `loop-pause-all` label to any issue, or set `paused: true` in STATE.md.

## Safety & gates (this repo)

- `gate.yaml` — deny/near-deny/additive-only/contract-frozen zones + `maxFiles: 10`
- `loop-constraints.md` — every loop run reads this first; violations escalate, never "fix"
- Human gates (always): weights.json, prisma migrations, extension/store surfaces, dependency majors, 3rd failed attempt on one item, budget raises
- No-progress rule: same item failing 3 automated attempts → automatic escalation with
  full context (C10). A stuck loop must never repeat the same failing action.
- Auto-merge: **disabled, empty allowlist** — do not enable without a docs/ spelling-only list + human decision

## How to run locally

```bash
npx -y @cobusgreyling/loop doctor .        # health check (exit 2 = blocked)
npx -y @cobusgreyling/loop audit . --suggest  # readiness score + suggestions
pnpm typecheck && pnpm test && pnpm build  # the E2 verifier chain
```

## Evolution / next automation candidates

1. API contract snapshot tests (`apps/api/__tests__/contract/`) — becomes D1/E4 verifier gate
2. D2 first L1 report: diff `learn-weights` global suggestions vs current weights.json
3. Calibration-history storage for D4 (schema addition → human gate)
4. E2 ci-sweeper workflow reacting to failed `ci` runs (diagnosis comment only)

Changes to this file go through normal PR review. *This file is both documentation and
the seed for the loops that maintain the repo.*
