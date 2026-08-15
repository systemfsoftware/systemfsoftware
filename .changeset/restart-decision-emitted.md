---
"@systemfsoftware/effect-daemon-spec": patch
---

`restart-decision.workflow.ts` has its pure decision in a new internal `restart-decision.kernel.ts` with a colocated property test. Both files are internal, so the package's public surface is unchanged and the restart behaviour is identical.
