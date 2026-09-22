---
'@systemfsoftware/effect-spec-runtime': minor
---

New package: the registration core behind Effect spec suites.

Exports the `Suite` and `TaskRef` namespaces. `Suite.open`, `Suite.openShared`, `Suite.openCase`, and `Suite.openSharedCase` register a suite with no layer, a shared suite layer, a per-case layer, or both — a shared layer is acquired once per suite, a per-case layer is finalized around every case. Each entry takes a register mode (`run`, `skip`, `only`), a describe collector (`describe`, `skip`, `only`), and a live-clock flag that selects between the test-clock and live-clock case runners. The error and case-body types are parameters of the suite, so a consumer declares its own error union and case shape.

`TaskRef.RawVitestTaskRef` hands the running test's context to the case body in whatever form the test runner passes it, including a callable context; `TaskRef.VitestTaskRef` carries it only when it is a plain object.
