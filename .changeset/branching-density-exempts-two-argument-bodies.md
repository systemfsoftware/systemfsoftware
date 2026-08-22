---
'@systemfsoftware/oxlint-plugin': patch
---

`no-domain-branching-density` now recognises a decision body passed as the second argument to `Workflow.make`, so such a body keeps the exemption it already had when it was the only argument. Bodies written in the two-argument form previously counted against the branching limit and could report.
