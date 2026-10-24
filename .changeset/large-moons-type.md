---
"@systemfsoftware/effect-e2e": minor
---

The `./runner` entry exports `e2eRunShape(config, options)`. It decodes the config as the runner and the global setup do and returns `{ retry, maxWorkers }` from the config's `retries` and `workers`, or from the CI run shape (one retry, one worker) when neither is written. Spread it into the `test` block of the suite's Vitest config; a config the runner refuses yields an empty object. The runner documents one precedence rule: CLI flag > config > Vitest default, with a test's own `retries` option above every run-level value and `VITEST_MAX_WORKERS` above flag and config for the worker pool.
