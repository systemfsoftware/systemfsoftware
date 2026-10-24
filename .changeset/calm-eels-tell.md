---
"@systemfsoftware/effect-e2e-cli": patch
---

A suite scaffolded by `effect-e2e init` now runs with its config's `retries` and `workers`, or with the CI run shape (one retry, one worker) when neither is written. `effect-e2e run --retries` and `--workers` override the config for that run. A suite scaffolded before this release ignores both keys until you update its Vitest config: import `e2eRunShape` from `@systemfsoftware/effect-e2e/runner` and the `options` the suite's runner module exports, then add `...e2eRunShape(config, options),` to the `test` block.
