---
name: loop-constraints
description: Runtime loader for loop-constraints.md. Every loop run starts here; violations escalate rather than get "fixed".
---

# Loop Constraints (enforcer)

1. Read `loop-constraints.md` at the start of EVERY loop run, before any other action.
2. Check the run's intended actions against each rule (C1–C11).
3. On any hit: **escalate** — write it into STATE.md High Priority and stop. Constraints
   are never worked around silently.
4. Confirm in the run-log entry: `"constraints_checked": true`.
