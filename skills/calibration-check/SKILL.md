---
name: calibration-check
description: D3/D4 governance — inspect the self-learning crons' outputs, track drift, alert, never re-host them.
---

# Calibration Check (D3/D4)

The self-learning crons run on **Vercel** (see `vercel.json`); you observe and gate, you
do not re-run or re-host them (C9).

## Weekly checks

1. **learn-weights (04:00 UTC)** — hit `/api/cron/learn-weights` with CRON_SECRET? No:
   just read the previous run's effect in the DB (Neon): `User.personalizedWeights`
   updates, and any logged global suggestions. Build/append the **suggestion history**
   (suggested adjustment + date + whether a D2 PR adopted it). Alert if the same global
   suggestion oscillates (suggested → ignored → suggested) 3+ times — that means the
   learning signal and the engine have diverged.
2. **calibrate-forecast (05:00 UTC)** — inspect `User.forecastCalibration`
   (`correctionFactor`, `meanAbsoluteErrorPct`, `dataPoints`, `lastCalibratedAt`).
   Alert when a user's correction factor moves >25% week-over-week or MAPE worsens
   two weeks running. Note: the cron overwrites per-user state — **history storage is
   not built yet**; until the D4 history table exists, snapshot this JSON weekly into a
   dated log entry so drift can still be seen.

## Output

- One dated entry in `loop-run-log.md` (pattern: `calibration-check`).
- Escalations → GitHub issue comment + STATE.md High Priority.
- Conversion metric: of this week's global suggestions, how many became D2 PRs? Track
  the ratio — it is the north-star metric for whether self-evolution is actually closed-loop.
