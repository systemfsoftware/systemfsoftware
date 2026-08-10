---
title: A dead vite-tsconfig-paths plugin was most of every vitest wall clock
date: "2026-08-09"
category: performance-issues
module: systemfsoftware
problem_type: performance_issue
component: tooling
symptoms:
  - "Vitest suites cost 60-90s per package while the tests themselves executed in about one second"
  - "`Duration 42.33s (transform 615ms, setup 150.14s, import 1.52s, tests 1.08s)` — worker-summed setup dwarfs test time"
  - "`pnpm vitest --version` boots in 10.1s while the same package with its vitest.config.ts costs 65.2s"
  - "Turning on ssr.optimizer broke the run so that zero tests executed, and it still took 59.8s"
root_cause: config_error
resolution_type: config_change
severity: high
related_components:
  - vite-tsconfig-paths
  - packages/vitest-config
  - packages/effect-schema-law
  - packages/effect-gherkin-spec
  - packages/effect-daemon-spec
  - packages/arethetypeswrong
tags:
  - vitest
  - vite
  - test-performance
  - tsconfig
  - monorepo
  - dead-dependency
---

# A dead vite-tsconfig-paths plugin was most of every vitest wall clock

## Problem

Vitest suites in this monorepo took 60–90 seconds per package while the tests themselves executed in about one second. Property-based testing was the prime suspect and was not the cause. The wall clock was almost entirely config-time work: a `vite-tsconfig-paths` plugin that existed to resolve TypeScript `compilerOptions.paths` aliases, in a workspace where no tsconfig declares any. It parsed every tsconfig in the 49-package workspace on every run to resolve nothing, and charged roughly 55 seconds per package for the privilege.

## Symptoms

- `@systemfsoftware/effect-schema-law` — 65.2s wall time for **25 tests**.
- `@systemfsoftware/effect-gherkin-spec` — 64.2s for **106 tests**.
- `@systemfsoftware/effect-daemon-spec` — 90.9s for **243 tests**.

The decisive tell was vitest's own duration breakdown, which splits transform / setup / import / test time. On schema-law it reported:

```
Duration 42.33s (transform 615ms, setup 150.14s, import 1.52s, tests 1.08s)
```

The `setup` figure is **summed across workers** (which is why it exceeds the wall time); the number that matters is the last one: the tests themselves cost **1.08s**. Everything else — transform, import, and the enormous worker-summed setup — is machinery around the tests, not the tests. A suite whose tests take one second but whose process takes a minute is paying for something that happens before the first test runs.

## What Didn't Work

Five hypotheses were raised, measured, and eliminated. They are recorded because one of them (property-based testing) is the default suspect for slow suites in this repo, and the whole point of this section is that re-blame must start from the evidence, not the reputation.

1. **"Property-based testing is slow."** Per-draw cost, read from the vitest JSON report: **0.03–4.65 ms per draw**. Total property execution across the three suites: **1.1s** (schema-law), **0.7s** (gherkin-spec), **21.6s** (daemon-spec). Even daemon-spec's 21.6s — the largest — is a quarter of its 90.9s wall time and would not explain the other two at all. PBT was never the cost.

2. **"The `effect` barrel import in the shared vitest config is the cost."** Measured the import directly: **0.67s** in plain Node, **3.2s** through vite's SSR transform. Real, but not 150 seconds of setup.

3. **"The setup file is doing too much."** Emptied the setup file completely: **64.8s**. Removed `setupFiles` entirely: **67.9s**. Baseline: **65.2s**. The setup file was not the cost — the wall time did not move either way.

4. **"Dependency pre-bundling is missing or broken."** Turning on `ssr.optimizer` **broke the run — zero tests executed — and it still took 59.8s**. This is the result that redirected the investigation. A run that did no test work at all still burned ~60 seconds: the cost sits in startup, before any test, any import, any property draw. Whatever the mechanism, it had to be config-time.

5. **"Worker pool / isolation settings."** Swept `pool=threads`, `isolate=false`, and `threads` with `noIsolate`: **63–66s in every variant**. Not the pool.

The isolating experiment that closed the case: `pnpm vitest --version` — boot only, no config file loaded — took **10.1s**. The same package with its `vitest.config.ts` took **65.2s**. Roughly **55 seconds of config-time** separated them. With the test-time, import-time, and setup-file hypotheses all measured and dead, the remaining suspect was something the vitest config file itself does at load — and the only thing the configs did beyond spreading the shared config was register plugins.

## Solution

Removed the `tsconfigPaths()` plugin from the seven vitest configs and dropped the `vite-tsconfig-paths` devDependency from six of the seven packages. Landed as `a144a1d76a` — `perf(global): drop dead vite-tsconfig-paths from test configs`. At the time of writing that commit is local to `main` and not yet on `origin/main`, so the SHA may be rewritten by a rebase or squash on push — search the subject line rather than the hash if it does not resolve. Removing the plugin took effect-schema-law from **65.2s to 9.3s with the same 25 tests passing** (first measurement, per the commit message), and to **13.1s** in the recorded baseline.

Before — from the commit diff, every one of the seven configs imported and registered the plugin:

```ts
// packages/effect-schema-law/vitest.config.ts (pre-fix, per a144a1d76a diff)
import tsconfigPaths from 'vite-tsconfig-paths'
// ...
plugins: [tsconfigPaths({ ignoreConfigErrors: true })],
```

- `packages/arethetypeswrong/cli/vitest.config.ts` and `packages/arethetypeswrong/core/vitest.config.ts` used the bare form `plugins: [tsconfigPaths()]`.
- `packages/effect-cell-types`, `packages/effect-daemon-spec`, `packages/effect-gherkin-spec`, `packages/effect-schema-law`, and `packages/stryker-js/cli` used `plugins: [tsconfigPaths({ ignoreConfigErrors: true })]`.
- `packages/effect-daemon-spec/vitest.config.ts` combined it with the schema test plugin: `plugins: [tsconfigPaths({ ignoreConfigErrors: true }), inlineSchemaTests()]`.

After — the current tree. None of the seven configs reference the plugin; a repo-wide grep for `tsconfigPaths|vite-tsconfig-paths` over `packages/**/vitest.config.ts`, `packages/**/package.json`, and `packages/vitest-config` returns exactly one hit, the deliberately retained devDependency at `packages/stryker-js/cli/package.json:52`. The configs are now plain spreads of the shared config, e.g. `packages/effect-schema-law/vitest.config.ts:1-11`:

```ts
import { defineConfig, sharedConfig } from '@systemfsoftware/vitest-config'

export default defineConfig({
  ...sharedConfig,
  test: {
    ...sharedConfig.test,
    include: ['src/**/*.test.ts', '__tests__/**/*.test.ts'],
    includeSource: ['src/**/*.ts'],
    setupFiles: ['./vitest.setup.ts'],
  },
})
```

`packages/effect-daemon-spec/vitest.config.ts:6` kept its genuine plugin (`plugins: [inlineSchemaTests()]`) and dropped only the path resolver. The shared config itself never contained the plugin (`packages/vitest-config/lib/base.js:19-22` — `sharedConfig` is a plain object with a `test` block, no `plugins`), so the per-package removals were complete.

### The load-bearing negative result

The plugin resolves `compilerOptions.paths` aliases; the premise of the fix is that this workspace declares none — not in any of the seven packages, not in any shared base they extend. That premise was verified against the tree, not assumed:

- `grep` for `paths` over `packages/**/tsconfig.json` — **No matches found**. This covers every package tsconfig in the workspace, including all seven.
- `grep` for `paths|baseUrl` over `packages/tsconfig/**/*.json*` — **No matches found**. This covers all ten shared bases: `effect.json`, `node.json`, `tsc/{dom,no-dom}/{app,library,library-monorepo}.json`, `bundler/{dom,no-dom}.json`.
- `grep` for `paths|baseUrl` over each of the seven packages' full tsconfig sets (`tsconfig.json` plus `tsconfig.build.json` / `tsconfig.node.json` / `tsconfig.test.json` where present) — **No matches found**.
- There is no `tsconfig.json` at the repo root for the plugin's upward traversal to find either.

The extends chains close the last hole: every one of the seven packages extends only `@systemfsoftware/tsconfig/*` bases — `packages/arethetypeswrong/cli/tsconfig.json:3`, `packages/arethetypeswrong/core/tsconfig.json:3`, `packages/effect-cell-types/tsconfig.json:3`, `packages/effect-daemon-spec/tsconfig.json:3`, `packages/effect-gherkin-spec/tsconfig.json:3`, `packages/effect-schema-law/tsconfig.json:3`, `packages/stryker-js/cli/tsconfig.json:3` — and those bases are all inside `packages/tsconfig/`, covered by the second grep. The alias map the plugin would build is empty by construction.

### Before / after

| package               | before | after |
| --------------------- | ------ | ----- |
| effect-schema-law     | 65.2s  | 13.1s |
| effect-gherkin-spec   | 64.2s  | 13.5s |
| effect-daemon-spec    | 90.9s  | 46.9s |
| arethetypeswrong/cli  | —      | 32.1s |
| arethetypeswrong/core | —      | 11.7s |
| effect-cell-types     | —      | 1.8s  |
| stryker-js/cli        | —      | 21.2s |

Total across all seven after removal: **140.5s**. The vitest boot floor alone is **10.1s** per package (the `--version` measurement above), so the plugin was the difference between "a suite that boots" and "a suite that boots, then wanders the workspace for a minute."

### The deliberate exception

The devDependency remains in `packages/stryker-js/cli` (`packages/stryker-js/cli/package.json:52`). Removing it changes that package's typecheck cache key, which re-runs typecheck and surfaces 19 pre-existing Effect language-service diagnostics in its `__tests__` directory (per the commit message). Those want their own commit; the config-side removal was safe without the dependency removal.

## Why This Works

The plugin's own source (v6.1.1, installed in this repo's pnpm store; `node_modules/.pnpm/vite-tsconfig-paths@6.1.1_*/node_modules/vite-tsconfig-paths/dist/index.js`) explains the cost exactly, and the mechanism is worth stating because the failure mode is generic:

1. **It discovers eagerly, from the workspace root.** On `configResolved`, the plugin sets `workspaceRoot = vite.searchForWorkspaceRoot(config.root)` (`index.js:594-601`). For a vitest config in any package of this monorepo, that search climbs to the repo root (which is a pnpm workspace — `pnpm-workspace.yaml` exists there), then calls `tsconfigResolvers.reset()` (`index.js:621`).
2. **Reset means find-and-parse-everything.** `resetResolvers` runs `loadEagerProjects()` (`index.js:233`), which calls `tsconfck.findAll(workspaceRoot, { configNames, skip })` (`index.js:219`) — walking the entire 49-package workspace for files named `tsconfig.json` or `jsconfig.json` (`index.js:124`) — then `parseNative`-parses each one (`index.js:132`, `index.js:225`), following `extends` chains into the ten shared bases under `packages/tsconfig/`. The `skip` directive excludes only `.git` and `node_modules` (`index.js:611-613`); sibling packages are walked.
3. **The parse is the cost; the empty result is the insult.** The alias map is derived from each parsed project's `compilerOptions.baseUrl` / `compilerOptions.paths` (`index.js:511-521`, `paths` at `index.js:518`). With zero `paths` and zero `baseUrl` declared anywhere (the negative search above), the map is empty: every `resolveId` call (`index.js:633`) walks the importer's directory chain upward (`getResolvers`, `index.js:256`) and falls through to vite's own resolution, matching nothing. The plugin's only contribution to a run is the traversal.
4. **It repeats per build.** `buildStart` re-runs `tsconfigResolvers.reset()` on every subsequent build (`index.js:626-631`), so the eager find-and-parse repeats across builds — consistent with the worker-summed `setup 150.14s` figure against the 42.33s wall time.

Removing the plugin removes the traversal. The tests were always ~1s; the ~55s of config-time is what the plugin bought with an empty alias set. The 10.1s boot floor that remains is vitest itself, and it is the floor, not the tax.

## Prevention

- **Check that the aliases exist before adding a path-resolution plugin — the plugin itself will tell you.** Run a boot with its debug logging in any package:

  ```bash
  DEBUG=vite-tsconfig-paths pnpm vitest --version
  ```

  The plugin prints `Eagerly parsing these projects:` followed by every tsconfig it will parse (`index.js:224`). If that list is long and none of those files declares aliases, the plugin resolves nothing while parsing everything.

- **Grep for the plugin's input set across the whole extends chain.** From the repo root:

  ```bash
  grep -rn '"paths"\|"baseUrl"' --include='tsconfig*.json' packages/ | grep -v node_modules
  grep -rn '"paths"\|"baseUrl"' packages/tsconfig/   # shared bases are named *.json, not tsconfig*.json
  ```

  Empty output on both = no aliases exist = a path resolver is dead weight. This is the exact search that cleared these seven packages; it also catches the shared bases, which is where aliases hide in a monorepo.

- **The general form: a resolver plugin whose input set is empty still pays full traversal cost.** Discovery is eager and exhaustive — the plugin cannot know the alias set is empty without parsing every candidate tsconfig first, and it redoes that per build. "It resolves nothing" is not a cheap no-op; it is the full walk with zero payoff. Cost of a resolver plugin is roughly the cost of discovering its inputs, regardless of what it finds.

- **This repo's convention makes the whole plugin class unnecessary.** No tsconfig here declares `paths` or `baseUrl`; cross-package imports resolve through workspace specifiers and `customConditions` like `@systemfsoftware/source` (e.g. `packages/effect-schema-law/tsconfig.json:4-6`). Any future alias mechanism should be added deliberately — aliases first, resolver second — never a resolver on spec.

## Related

- [A turbo cache that is never warm has its causes in the key, not the storage](../performance-issues/turbo-cache-never-warm.md) — closest sibling. Same repo, same shape (verification wall time dwarfs the actual work on every run), same measure-before-theorize discipline. Different mechanism: cache-key churn that prevents a hit, against a dependency doing expensive work for zero benefit.
- [Enabling a turbo cache requires a complete input hash](../tooling-decisions/turbo-cache-requires-complete-input-hash.md) — antecedent doctrine, opposite failure direction. Its rule against widening a key with values that change every run and change no answer is the same principle this learning applied by deletion: keep cost-without-effect out of a tool's config surface.
- [Timeout kills credited to nobody](../logic-errors/timeout-kills-credited-to-nobody.md) — shares the "property tests wrongly blamed" narrative and touches the same `effect-daemon-spec` package. Its rule to measure the report before theorizing about the mechanism is exactly the move that exonerated PBT here.
- [pnpm catalogs for monorepo dependency management](../tooling-decisions/pnpm-catalogs-for-monorepo-dependency-management.md) — **made stale by this learning.** Its worked example still shows `vite-tsconfig-paths` in `effect-gherkin-spec`'s devDependencies. The catalog entry itself correctly survives, because `packages/stryker-js/cli` still declares the dependency.
- GitHub issue #72 (open) — `attw` CLI snapshot suite serializes 30 subprocesses, costing 173s per run. A sibling performance issue in `arethetypeswrong/cli`, one of the seven packages this learning sped up. Evidence that test wall time in that package has more than one non-test cost to attack.
