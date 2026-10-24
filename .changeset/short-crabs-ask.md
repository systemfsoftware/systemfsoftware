---
"@systemfsoftware/effect-e2e-cli": minor
---

Add `effect-e2e run`. It runs an effect-e2e suite under Vitest in the same process, prints the run's merged report with `--reporter list|json|junit|markdown` (default `list`), and exits with the report's code: 0 passed, 1 failed, 3 blocked, 4 error, 130 interrupted. A refused config, a missing suite root, conflicting flags, a suite without the effect-e2e global setup, or a run that writes no report exits 2; a refused config never reads an older report. Flags: `--dir`, `--target`, `--agent`, `--tag`, `--no-cache`, `--strict-cache`, `--workers` (Vitest maxWorkers), `--retries`, `--timeout`, `--output`, `--trace`, `--last-failed` (reads the previous report where this run writes), and test file filters. Suites `init` generates now set `testTimeout` from the config's `timeout` (default 120 s) instead of Vitest's 5 s.
