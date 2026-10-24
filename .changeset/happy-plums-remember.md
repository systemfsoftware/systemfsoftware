---
"@systemfsoftware/effect-e2e": minor
---

Add `makeGlobalSetup(config, options)` to `./runner`, the Vitest global setup a suite registers beside its runner. Before any worker starts it removes the previous run's report partials and merged report and hands every worker one run id; at teardown it merges the workers' partials into one run report holding each result once. Each runner instance now names its own partial and rewrites it after every finished test, so a worker that dies leaves its completed results behind and the merged report ends with run status `error`. A runner without the global setup still runs and stamps its own run id.
