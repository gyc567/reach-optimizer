# Loop Budget — reach-optimizer

Dual-unit budget (this repo's harness is Kimi Code + GitHub Actions, not per-token Claude
billing — keep both units honest). **Agents cannot raise these caps.** To increase a cap,
a human edits this file in a normal commit and says why (budget-negotiator pattern).

## Unit 1 — GitHub Actions compute

- Cap: **1,000 Actions minutes / month**
- Notify at: 800 min (comment on the tracking issue + STATE.md High Priority)
- On exceed: pause E1–E5 schedules; D-loops unaffected (they are human-triggered at L1/L2)
- Rough math: CI ~5 min × ~60 runs + E1 ~2 min × 22 + E2/E4 ~3 min × ~40 ≈ 500 min/mo

## Unit 2 — Agent sessions (loop-driven agent work)

- Cap: **20 loop agent runs / week** (any harness: Kimi Code cron sessions, manual agent tasks)
- Notify at: 16
- On exceed: loops degrade to report-only; humans execute the fixes

## Per-run limits

- Max 3 fix attempts per item per run → escalate (see loop-constraints.md C10)
- Max 3 sub-agent spawns per run
- Empty watchlist → exit immediately (<5k tokens equivalent)

## Kill switch

- `loop-pause-all` label on any issue → all loops stop on next run
- or set `paused: true` in STATE.md

## Separation from product AI spend

These caps govern **loop operations only**. Product AI spend (ANTHROPIC_API_KEY serving
/api/analyze etc., incl. MiniMaxi via ANTHROPIC_BASE_URL) is budgeted separately in the
product plan — loops must never borrow product quota and vice versa.
