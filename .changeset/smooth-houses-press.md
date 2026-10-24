---
"@systemfsoftware/effect-e2e": minor
---

A suite's runner and global setup apply `effect-e2e run`'s overrides from the composition root's `env`: `E2E_TARGET` keeps one target, `E2E_AGENT` makes the named agent the default, and `E2E_CACHE`, `E2E_TIMEOUT`, `E2E_OUTPUT` and `E2E_TRACE` replace cache mode, timeout, output and trace. An override naming no target or agent in the config, or a value outside its type, refuses the config with its key path. `RUN_OVERRIDE_ENV` names the variables. The global setup provides the run's output directory under `RUN_OUTPUT_KEY` and, for a refused config, the refusal under `RUN_REFUSAL_KEY` (both exported from `./runner`), so a host that runs Vitest in its own process can tell which report belongs to the run.
