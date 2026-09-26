---
"@systemfsoftware/discern": patch
---

A refused model call, procedure invocation or policy run is now recorded as a completed run. A spent budget or a missing recording records `result_class=failure`, and an uncertain match or a route with no eligible or no certain procedure records `success`; before, all of them recorded `infrastructure`. The errors that `Model.budgeted`, `Model.caching`, `Model.replaying`, `Procedure.invoke`, `Procedure.invokeWithRoute` and `Policy` runs fail with are unchanged.
