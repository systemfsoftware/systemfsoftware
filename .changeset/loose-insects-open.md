---
"@systemfsoftware/effect-cell-types": major
---

Withdraw the four type-level law exports from the entry. `DecisionUnionSurvivesDistribution`, `InhabitedWorkflowIsCallable`, `NeverDecisionIsRejected` and `NeverErrorIsRejected` were internal proofs reachable only through forgotten exports.
