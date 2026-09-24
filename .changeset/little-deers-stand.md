---
"@systemfsoftware/effect-spec-runtime": minor
---

Suite registrars take a scenario, `(expect) => Effect`, instead of a bare Effect, and each case registers as a generator test, so the check a case ends in comes from the test's own `expect`. Kernel-explored cases re-provide the test's check ledger through `captureRunBinding`, so every seeded replay is judged once.
