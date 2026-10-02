---
name: loop-budget
description: Runtime budget checker for ReachOS loops. Runs at the start and end of every loop run; enforces caps from loop-budget.md. Agents cannot raise caps.
---

# Loop Budget (checker)

1. Read `loop-budget.md` at the START of every loop run.
2. Check current spend against both caps (Actions minutes / month; agent runs / week).
   If a cap is exceeded or `paused: true` in STATE.md or a `loop-pause-all` label exists:
   **stop the loop immediately**, write one line to STATE.md High Priority, exit.
3. Estimate this run's cost before spawning sub-agents; refuse spawns beyond the per-run
   limit. Empty watchlist → exit immediately.
4. At the END of the run, record the spend estimate in the run-log JSON line.
5. Need more budget? Write a request as a normal issue for a human — never edit
   `loop-budget.md` yourself (budget-negotiator pattern).
