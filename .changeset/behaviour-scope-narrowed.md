---
'@systemfsoftware/oxlint-plugin-test-placement': minor
---

`behaviour-exercises-use-case` now reports only a `*.integration.test.ts` whose every import is its test runner, the spec package, or `effect` — a file asserting over values it built itself. It previously demanded an import whose filename ended in `Executor`, `Handler`, `Adapter`, `Store` or `Middleware`, which a file satisfied by naming any module that way, however pure. Whether an imported module performs I/O cannot be read from the importing file, so the rule no longer claims to decide it: a behaviour test that reaches the package under test is accepted, and the altitude of what it reaches is left to review. Tests that named a role-suffixed module to satisfy the old form continue to pass; a test that reached nothing but its runner was accepted before and is now reported.
