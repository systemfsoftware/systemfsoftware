# @systemfsoftware/effect-e2e-cli

The command line for [`@systemfsoftware/effect-e2e`](../effect-e2e). `effect-e2e init --dir <suite> --engine web --gateway openrouter` scaffolds a suite: `e2e.config.ts`, `vitest.config.ts`, `runner.ts`, `global-setup.ts`, a deterministic example and an agent example under `tests/`, a `test:e2e` script and a `.e2e/` ignore entry. It asks for any choice not given as a flag, refuses to replace an existing file without `--force`, and installs the suite's dependencies unless `--no-install` is given. The package has a bin and no module entry.

Apache-2.0. Part of [systemfsoftware](https://github.com/systemfsoftware/systemfsoftware/tree/main/packages/runner/effect-e2e-cli#readme).
