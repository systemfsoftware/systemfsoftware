---
"@systemfsoftware/effect-e2e-cli": minor
---

Add `effect-e2e run`. It runs an effect-e2e suite under Vitest in the same process, prints one report from the merged `.e2e/report.json` with `--reporter list|json|junit|markdown` (default `list`), and exits with the report's code: 0 passed, 1 failed, 3 blocked, 4 error. A config the runner refuses, a missing suite root, conflicting flags, or a run that writes no report exits 2; a refused config never reads an older report. Flags: `--dir`, `--target`, `--agent`, `--tag`, `--no-cache`, `--strict-cache`, `--workers` (Vitest maxWorkers; the config's `workers` is not consulted), `--retries`, `--timeout`, `--output`, `--trace`, `--last-failed`, and test file filters. Suites `init` generates now export `output` from `e2e.config.ts`, forward it to Vitest, and set `testTimeout` from the config's `timeout` (default 120 s) instead of Vitest's 5 s.
