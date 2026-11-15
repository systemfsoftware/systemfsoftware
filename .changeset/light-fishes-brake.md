---
"@systemfsoftware/differential-spec": patch
---

A check that declares hostBound now runs: each generated input runs once on Effect's own runtime, so a target that reaches a real file, socket or timer is compared instead of failing as Blocked or Escape. fast-check still shrinks a failing input, and the report names the host-bound reason in place of a schedule.
