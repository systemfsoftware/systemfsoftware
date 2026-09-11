# AGENTS.md — `packages/stryker-js/`

The mutation-testing engine subtree. Owned outright (REPO-O1): we publish and change these packages; the originating `@stryker-mutator` project is history, never governance. Sub-package leaves carry per-package deltas. The subtree is eight packages; the former engine, instrumenter and html-reporter packages were folded into `stryker-js-cli/` and no longer exist.

## Packages

| Package                          | Role                                                                                                                                                                               |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `stryker-js/`                    | The plugin ABI: one module per abstraction, zero dependencies, no platform.                                                                                                        |
| `stryker-js-cli/`                | The whole host and the `stryker` bin: run orchestration, the instrumenter core, the builtin and html reporters, the Node binding, the workers; publishes the preset at `./config`. |
| `stryker-js-vitest-runner/`      | TestRunner adapter (peer: `vitest`).                                                                                                                                               |
| `stryker-js-typescript-checker/` | Checker adapter (peer: `typescript`).                                                                                                                                              |
| `stryker-js-html-parser/`        | Parser adapter for HTML (`angular-html-parser`).                                                                                                                                   |
| `stryker-js-svelte-parser/`      | Parser adapter resolving `svelte` from the consumer's project.                                                                                                                     |
| `stryker-plugins/`               | Ignorers.                                                                                                                                                                          |
| `stryker-test-contribution/`     | The evaluator gate, contributed as `contribution-gate`.                                                                                                                            |

## Rules

| ID        | Rule                                                                                                                                                                                                                 | Gate                                                                                                         |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **SJ-R1** | Rebuild (`pnpm build`) after any source change in a package consumed via built `dist/` — an unbuilt edit tests the previous version.                                                                                 | `review`                                                                                                     |
| **SJ-R2** | Only `stryker-js-cli/` carries a `stryker.config.json` in this subtree; every other package is an adapter or holds no mutation-enrolled decision — never enroll one.                                                 | `git ls-files 'packages/stryker-js/**/stryker.config.json'` prints exactly one path, under `stryker-js-cli/` |
| **SJ-R3** | Plugins load only from the explicit `plugins` config list as module strings; every adapter — first-party or third-party — is reached the same way, with no org-directory discovery and no built-in adapter registry. | `review`                                                                                                     |
| **SJ-R4** | A listed plugin that cannot be resolved is a configuration error, never a warning: the run exits with the `ConfigError` class.                                                                                       | `review`                                                                                                     |
| **SJ-R5** | No package in this subtree declares `effect` in `dependencies` or `peerDependencies`; `effect` is a devDependency compiled into each package's `dist`.                                                               | `review`                                                                                                     |
