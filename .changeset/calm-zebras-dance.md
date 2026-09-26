---
"@systemfsoftware/conformance-spec": major
---

`Conformance.released` is removed; use `Conformance.stopped(specification)`. A `StopSpecification` names the `unit`, a `world` effect building the outside parties, the `program` and `restart` run against it, a `rule` that fails with `RuleBroken` when the world shows the unit broke what it owes, and `stopWithin`, the unit's declared stop time limit. The check runs the program uncut, then stops it at every kernel step three ways (root told to stop; the last fiber that ran stopped, when it runs in the unit's own scope; the run killed with no finalizers), runs the restart on the same world, and judges the rule, that nothing is left running, that no waiter is left waiting, and that the stop met its limit. A failure names the cut and step: `told to stop at step 12: stop never finished`. New exports: `StopSpecification`, `StopCut`, `StopProblem`, `RuleBroken`, `runFailureText`.
