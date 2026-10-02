# Safety & Guardrails — ReachOS loops

Loops amplify judgment — good and bad. These are the minimum guardrails for loops that
touch code or external systems. Machine enforcement lives in `gate.yaml`; runtime rules
live in `loop-constraints.md`; this document is the human-readable policy.

## Path denylist (never auto-edit without human approval)

```
**/.env  **/.env.*                     # secrets
apps/api/prisma/migrations/**          # schema migrations (human gate)
vercel.json                            # cron + build config
packages/rules-engine/src/config/weights.json   # C5: D2 governance only
apps/extension/**                      # near-deny: published product surface (docs/*.md only)
packages/shared-types/**               # additive-only (new optional fields)
apps/api/app/api/**                    # frozen response contracts (C4)
```

Enforcement: `gate.yaml` at PR/loop level (exit 2 = escalate); contract snapshot tests
planned as the CI-level second layer (web plan v2 Week 3–4). Until then, the
`loop-verifier` skill walks response shapes manually.

## Auto-merge policy

**Default: disabled.** `gate.yaml → autoMerge.allowlist` is empty and stays empty until a
human explicitly enables a trivial-only list (docs spelling / test-file lint is the
ceiling of what may ever be allowed).

## Connector least privilege

| Connector | Read | Write |
|-----------|------|-------|
| GitHub (`gh` / Actions token) | issues, PRs, checks, runs | comment, label — **never merge** |
| Vercel | deploy status | none from loops |
| Database (Neon) | read-only inspection for D3/D4 | **no writes from loops** |

MCP: not required for current patterns — the GitHub API covers every loop need. Revisit
only if a future loop must drive external ticket/chat systems.

## Human gates (always)

- `weights.json` / signal shape changes (D2 path with sign-off)
- Prisma migrations
- Extension surfaces (manifest, service worker, store listing)
- Dependency major bumps and lockfile changes
- Third failed attempt on the same item (C10 no-progress rule)
- Any budget-cap increase (agents cannot self-raise; see `loop-budget.md`)

## Secrets

- Never paste keys into loop prompts, STATE.md, run logs, or PR bodies (C6)
- CI uses dummy values for lazy env getters (`.github/workflows/ci.yml`)
- `CRON_SECRET`, `JWT_SECRET`, `DATABASE_URL`, `ANTHROPIC_API_KEY`, `X_CLIENT_*` are
  denylisted paths and secrets — loops escalate on contact

## Flake & test safety

Never disable tests to green CI, never raise timeouts without a root-cause note, never
fix a flaky test by retry-looping (C7). Quarantine via human-approved ticket.

## Incident response

If a loop ships bad code:
1. Pause all loops (`paused: true` in STATE.md or `loop-pause-all` label)
2. Revert the merge
3. Record a story in `stories/`
4. Tighten the verifier or shrink scope before restart
