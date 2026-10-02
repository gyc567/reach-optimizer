---
name: minimal-fix
description: Small, safe, verifiable fixes inside loop worktrees for ReachOS. Enforces gate.yaml, smallest-diff, and attempt caps.
---

# Minimal Fix

For E2/E3/E4 loops when a fix is approved.

## Before touching anything

1. Read `loop-constraints.md` and `gate.yaml`.
2. Create an isolated worktree for this attempt: one branch, one purpose.
3. Re-derive the root cause. Symptom-fixing is how loops burn budget (failure mode #1).

## While fixing

- **Smallest possible diff.** No drive-by refactors, no style churn, no "while I was here".
- Respect `gate.yaml`: `deny` paths → escalate, never edit. `nearDeny` (extension) → docs-only.
  `additiveOnly` (shared-types) → new optional fields only. `contractFrozen` (api routes) →
  additive-only response shape changes, and say so explicitly in the PR body.
- >10 files touched → stop and escalate (C11).
- Never disable a test, never blanket-raise timeouts to go green (C7).

## After fixing — verify, then report

1. Run the full chain: `pnpm typecheck && pnpm test && pnpm build` (see `verify-build`).
2. Report: root cause, exact diff summary, verifier output, risk notes.
3. Attempt cap: this is attempt N of max 3 on this item (C10). At 3 → escalate with
   everything you learned; do not iterate further.
4. On REJECT: discard the worktree. On human escalation: hand off with context.
5. Append one JSON line to `loop-run-log.md`.
