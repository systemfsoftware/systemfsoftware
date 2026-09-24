---
"@systemfsoftware/trace-spec": minor
---

`Contract.check(expect, input, options?)` takes the test's `expect` and ends in one check: a break fails it with the report as the message. `Contract.judge` returns the `{ verdict: 'Hold' | 'Break', report }` value, and `Contract.verdictCheck(contract, expect, judgment)` turns one into a check. `TraceDisparityError` is removed. `Suite` cases register as generator tests and judge each case once.
