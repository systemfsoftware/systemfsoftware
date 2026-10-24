---
"@systemfsoftware/effect-e2e-cli": minor
---

`effect-e2e run --ai-trace` writes `ai-trace.json`, the masked model calls, into each failed test's result directory, whatever `--trace` says. Without the flag the suite's own `aiTrace` setting applies.
