---
"@systemfsoftware/effect-e2e": minor
---

A suite's runner and global setup apply `effect-e2e run`'s overrides from the composition root's `env`: `E2E_TARGET` keeps one target, `E2E_AGENT` makes the named agent the default, and `E2E_CACHE`, `E2E_TIMEOUT`, `E2E_OUTPUT` and `E2E_TRACE` replace cache mode, timeout, output and trace. An override naming no target or agent in the config, or a value outside its type, refuses the config with its key path. `RUN_OVERRIDE_ENV` names the variables. `exitCodeReporter`'s callback also receives the refused `ConfigInvalid`.
