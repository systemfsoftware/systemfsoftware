# @systemfsoftware/effect-e2e-cli

The command line for [`@systemfsoftware/effect-e2e`](../effect-e2e).

## Install

Add it as a devDependency. It is distributed as a workspace tarball of the [systemfsoftware flake](https://github.com/systemfsoftware/systemfsoftware) (`packages.<system>.effect-e2e-cli`), which `lib.mkConsumerStore` serves to an offline pnpm install. It ships the `effect-e2e` bin and has no module entry, so nothing imports it. It requires Node `>=24` (its `engines` field).

## Usage

`effect-e2e init --dir <suite> --engine web --gateway openrouter` scaffolds a suite: `e2e.config.ts`, `vitest.config.ts`, `runner.ts`, `global-setup.ts`, a deterministic example and an agent example under `tests/`, a `test:e2e` script and a `.e2e/` ignore entry. It asks for any choice not given as a flag, refuses to replace an existing file without `--force`, and installs the suite's dependencies unless `--no-install` is given.

`effect-e2e run --dir <suite> [files...]` runs the suite under Vitest in the same process and prints one report: the one the run's global setup merged into the output directory (`.e2e/` unless the config or `--output` moves it); without `--dir` it uses the nearest directory holding `e2e.config.ts`. `--reporter` picks `list` (the default), `json`, `junit` (writes `junit.xml`) or `markdown` (writes `summary.md`). The process exits with the report's code: 0 passed, 1 failed, 3 blocked, 4 error, 130 interrupted, and 2 when nothing reached a report: a config the runner refuses, a missing suite root, conflicting flags, a `vitest.config.ts` without the effect-e2e global setup, or a Vitest load error. A refused config never reads an older report.

| Flag                                 | Effect                                                                                                                                        |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `--target <name>`, `--agent <name>`  | Run one target; make the named agent the default                                                                                              |
| `--tag <tag>`                        | Run only tests carrying the tag (the suite declares its tags)                                                                                 |
| `--no-cache`, `--strict-cache`       | Cache mode `off` or `read-only`                                                                                                               |
| `--workers <n>`                      | Vitest's `maxWorkers`; overrides the config's `workers`                                                                                       |
| `--retries <n>`                      | Retries per failed test; overrides the config's `retries`                                                                                     |
| `--timeout <ms>`                     | Whole-test deadline and session budget                                                                                                        |
| `--output <dir>`                     | Where the report and artifacts go, relative to the suite                                                                                      |
| `--trace off\|on\|retain-on-failure` | When the trace page is kept                                                                                                                   |
| `--ai-trace`                         | Write `ai-trace.json`, the masked model calls, into each failed test's result directory, whatever `--trace` says                              |
| `--last-failed`                      | Rerun what the previous report in this run's output directory did not pass or skip; a green previous run, or none, starts nothing and exits 0 |

Apache-2.0. Part of [systemfsoftware](https://github.com/systemfsoftware/systemfsoftware/tree/main/packages/runner/effect-e2e-cli#readme).
