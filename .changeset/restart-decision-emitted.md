---
"@systemfsoftware/effect-daemon-spec": patch
---

`restart-decision.workflow.ts` is now emitted from `restart-decision.workflow.decl.json`, and its pure decision moved to a new internal `restart-decision.kernel.ts` with a colocated property test. Both files are internal, so the package's public surface is unchanged and the restart behaviour is identical; edit the declaration rather than the cell, which `check:cell-authorship` enforces.
