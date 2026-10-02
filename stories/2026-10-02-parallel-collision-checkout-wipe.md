# 2026-10-02 — Parallel collision: unexplained diff wiped by `git checkout -- .`

- **Loop / level**: bootstrap session (human-directed, pre-E1) · n/a
- **Date**: 2026-10-02 ~08:34 local

## Symptom

During branch-switching after pushing PR #1/#2, `git status` on `main` showed an
unexpected modified file (`apps/extension/src/content/forecast-engine.ts`) plus a new
untracked `.omc/` directory — neither made by the session doing the git operations.
The operator reflexively ran `git checkout -- .` to "clean up" and **discarded the
foreign modification**, which was unstaged/uncommitted and is unrecoverable via git.

## Root cause

**Two agent processes shared one working directory.** A second agent tool (session
state found in `.omc/state/`, session started 2026-10-01 15:32) was editing the same
checkout concurrently. This is failure mode **Parallel Collision** from the
loop-engineering catalog — compounded by an operator error: an unexplained diff was
treated as noise instead of being escalated.

## What mitigated it (and what didn't)

- ✅ Bootstrap commits used explicit `git add -- <paths>` — no foreign content was
  swept into PR #1/#2.
- ✅ Tree was verified clean twice before/after convergence, so PR contents are
  unaffected (the lost edit happened after both PRs were pushed).
- ❌ No pre-check for "unexplained changes before destructive git ops" — `git checkout -- .`
  was executed on sight. Unstaged work from the other process was lost.
- ❌ No worktree isolation: the other agent was editing `main`'s checkout directly.

## Rules that now exist because of this

Already encoded in `loop-constraints.md` / `skills/`, reinforced here with a concrete case:

1. **An unexplained diff is an escalation, never noise.** Before any destructive git
   op (`checkout --`, `reset`, branch switch with dirty tree), list the dirty files;
   if anything is not yours → stop and ask, or move the work to a worktree.
2. **One agent per checkout.** Parallel agents use `git worktree` (see `LOOP.md`).
   The `STATE.md → lock:` guard governs *loops*; humans/agents need the same discipline.
3. **Never run `git checkout -- .` / `git clean` as a cleanup reflex.** Cleanup is
   `git status` → understand → then act.

## Recovery

The lost edit existed only in the other agent's working memory; `.omc` state files
contain no file content. If the change matters, the owning session must redo it
(the shim version of `forecast-engine.ts` already exists on branch
`feat/web-scorer-phase0-3` if that was the intent).
