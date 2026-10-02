# Loop Baseline — reach-optimizer

Recorded 2026-10-02 during loop-engineering bootstrap (Week 0). Tool:
`npx -y @cobusgreyling/loop@0.2.0` ([upstream](https://github.com/cobusgreyling/loop-engineering)).

| Run | Command | Result |
|-----|---------|--------|
| 1 | `doctor .` before artifacts | **16/100 L0 — BLOCKED** (state/LOOP/budget/run-log/gate all missing) |
| 2 | `doctor .` after artifacts | **100/100 L2 — HEALTHY** (exit 0) |
| 3 | `audit .` after artifacts | **100/100** — verifier/safety/constraints/budget skills all recognized |

Post-fix audit (`docs/safety.md` + `skills/loop-verifier` + `skills/loop-constraints` +
`skills/loop-budget` added): still 100/100; stall/no-progress rule now detected.

## Intentional deviations (do not "fix" without a human decision)

- **Operational level stays L2** even though the file-presence score reads L3 — per plan
  v2 rollout discipline (report-first loops, no auto-merge). The score measures
  artifacts, not trust. Upgrade only after real runs accumulate.
- No `patterns/registry.yaml` — single-repo deployment; LOOP.md is the registry.
- No harness-foundry / memory-tiers / fleet files — companion tooling is explicitly
  deferred until a loop has actually run (upstream's own rule).
- No harness-specific verifier agents (`.claude/agents/*.md`, `.grok/skills/…`) — we
  ship harness-neutral `skills/loop-verifier` instead; same maker/checker split.
- `doctor` note "Could not parse loop-sync JSON output" — cosmetic upstream quirk on
  macOS; tracked, not actionable.

## Next baselines to record

- After E1's first week: false-positive rate + state-prune check.
- After D2's first suggestion→PR cycle: conversion metric (see calibration-check skill).
- Re-run `audit` after contract snapshot tests land (Week 3–4).
