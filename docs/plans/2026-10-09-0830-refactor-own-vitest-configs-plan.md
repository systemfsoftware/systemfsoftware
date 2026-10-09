---
title: Own Vitest Configs - Plan
type: refactor
date: 2026-10-09
topic: own-vitest-configs
artifact_contract: ce-unified-plan/v1
supersedes: docs/plans/2026-10-09-0745-refactor-own-vitest-configs-plan.md
product_contract_source: ce-brainstorm
execution: code
---

# Own Vitest Configs - Plan

## Goal Capsule

- **Objective:** each package's test setup can be read and changed in that package alone. A change to one package's Vitest behaviour touches only that package's files, and no package's test run changes because a different package changed.
- **Means:** delete the private `@systemfsoftware/vitest-config` package (`packages/toolchain/vitest-config`), write every consumer's `vitest.config.ts` out with Vitest's own `defineConfig` and `test.projects`, and move the inputs only the fork's runtime reads into a Vitest plugin published by `@systemfsoftware/vitest` (Key Decisions, KTD4).
- **Authority:** Ryan's ruling of 2026-10-09 ("Stop being stupid about sharing vitest configs that obviously doesn't work"; the oxlint config packages and `@systemfsoftware/tsconfig` stay shared). Doctrine: `CONSTITUTION.md` `CONST-E9`, `CONST-S4`, `CONST-W3`; the operator's removal rule (removals are total) and stacked-PR rule.
- **Stop conditions:** stop and ask if an equivalence difference outside KTD6's list appears, if a lint or gritlint rule fires on an inline config and passing would need a rule edit, or if the plugin would need to set a Vitest option.
- **Execution profile:** the plugin (U2) is written inline. The config migration (U3, U4) is mechanical against the U1 baseline and fans out to coders by package family; the parent runs every verification.
- **Ships as:** a two-PR stack on `main`. Layer 1 carries this plan and the plugin, layer 2 the migration and deletion (KTD1).

---

## Product Contract

### Summary

The shared Vitest config package goes away. Every package that imported it gets a `vitest.config.ts` that states its own include sets, projects, PR-lane rule, resolve conditions and guard setup file. What only the fork's runtime reads (the provided context) and the runtime half of the fork's published `effect/TestClock` compat path come from a plugin in `@systemfsoftware/vitest`, which works through Vitest and Vite plugin hooks and sets no test option.

### Problem Frame

`@systemfsoftware/vitest-config` exports `defineConfig`, `sharedConfig`, `sourceResolveConditions` and `isCI` (`lib/base.d.ts`). Thirty-nine packages import it from 42 config files. Its `defineConfig` reads the package's disk at config load: it looks up the guard, scans for conformance files, reads `package.json`, and rewrites the package's projects. None of that is visible in the package's own config. The repository's history records where this failed:

- W1. Since #526 the factory split any package that keeps `*.conformance.test.ts` into `unit` and `conformance` projects. trace-spec's config did not change, but its nested `startVitest` include override stopped applying and the run recursed until every scenario hit 60 s (`cb7c8eaaed`, #529, CI run 36080352408; `docs/solutions/test-failures/nested-startvitest-include-ignored-under-projects.md`).
- W2. In the same change, the shared PR lane left out effect-memfs's conformance files, so branch coverage fell to 99.18% under that package's own 100% threshold. The fix was a new test in effect-memfs (`cb7c8eaaed` body).
- W3. The base and four package configs read `CI` three different ways. Under an agent shell, property suites drew 1000 samples while coverage stayed off (`ef47ba9b06`; `docs/solutions/logic-errors/agent-outranks-ci-run-depth.md`).
- W4. The conditions hard-coded in the shared config broke every suite importing `@effect/opentelemetry`. trace-spec overrides them, and the solution doc lists "a shared test preset that hardcodes conditions and is spread by every package" as a code smell (`docs/solutions/build-errors/opentelemetry-api-module-condition-under-vitest.md`).
- W5. A fork feature (seed recording off in CI) needed a CONST-W3-declared edit to "the shared Vitest config another package owns" (`acabd8a8d7`, #578).
- W6. Exempting xstate's verbatim upstream tests from the guard meant editing the exemption table inside the shared package (`10dee0af1d`, unmerged branch).
- W7. A one-line edit to the shared config re-hashes all 40 packages (`44f4e79981`; `docs/solutions/tooling-decisions/changeset-requirement-keys-on-turbo-build-hash.md`). `turbo.json` puts `$TURBO_ROOT$/packages/toolchain/vitest-config/lib/**` into every package's test hash.
- W8. Packages adopt the shared config three ways. Most spread it whole. `oxlint-plugin-dmmf-workflow` and `storybook-gherkin` spread only the conditions. `tsdown-config` imports the conditions and bypasses `defineConfig`, so it runs with no guard and no provided context. `discern` and `rx-effect` spread `sharedConfig.test` and then replace `coverage`, which drops the shared `enabled` switch.
- W9. The PR lane keys on a project's name. Any declared project named `conformance` is emptied under `VITEST_LANE=pr` (`lib/base.js:297-324`). storybook-gherkin's `test` script runs only `--project conformance`, so that package runs no test on a pull request. The U1 baseline confirms it: 0 files in `conformance` under the PR lane.
- W10. Nothing tests the factory. `03567f9d8d` deleted its wiring tests, and its `defineConfig` JSDoc still describes a conformance coverage gate that #526 removed.

### Capability Rulings

Every capability in `lib/base.js` and `lib/files.js`, with its ruling. "Inline" means written as plain configuration in each package that needs it. "Plugin" means behaviour of `@systemfsoftware/vitest` through a Vite or Vitest plugin hook, its published setup file, or its matchers.

| ID  | Capability                                                                                                                                                                                                                                             | Ruling                                                         | Reason                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | `CONFORMANCE_GLOB`, `hasConformanceFiles`, `splitProjects`, `unitTest`, `unitInclude`, `conformanceTest`, `namedProject`, `withoutSpecs`: split a package that keeps conformance files and declares no projects into `unit` + `conformance`            | Inline                                                         | Which files form which project is the package's own configuration. Five packages already write the split by hand, and the hidden split is what broke trace-spec (W1).                                                                                                                                                                                                                                                                  |
| C2  | `isPrLane`, `laneProjects`, `projectWithoutConformance`, `isConformanceProject`: under `VITEST_LANE=pr`, drop the auto-split `conformance` project, empty a declared project named `conformance`, and strip conformance files from every other project | Inline                                                         | One `process.env['VITEST_LANE'] === 'pr'` read in each of the 14 packages that keep conformance files. The variable stays CI's trigger and stays in turbo's `test.env`.                                                                                                                                                                                                                                                                |
| C3  | `guardExemptions` table                                                                                                                                                                                                                                | Delete                                                         | An exempt package or project leaves out the guard line, with a comment beside the omission naming the runner that registers its tests. An exemption no longer needs an edit in another package (W6).                                                                                                                                                                                                                                   |
| C4  | `guardSetupFile`: find the fork under `<package>/node_modules`, prefer its `src/guard.ts`, else the built entry, refuse when undeclared                                                                                                                | Inline line, fork-provided setup file                          | `setupFiles: ['@systemfsoftware/vitest/guard']`, the fork's published setup-file export. The fork's own config uses `./src/guard.ts`. KTD2 records what changes.                                                                                                                                                                                                                                                                       |
| C5  | `withSetupFiles`, `isExemptProject`, `projectWithSetup`, `isTestProject`: thread the guard into the root or each inline project and dedupe                                                                                                             | Delete                                                         | Replaced by where each package writes C4's line.                                                                                                                                                                                                                                                                                                                                                                                       |
| C6  | `packageFacts`, `workspaceRoot`, `packageProvide`, `withProvide`: provide `@systemfsoftware/vitest:package` and `@systemfsoftware/vitest:workspace-root`                                                                                               | Plugin                                                         | Only the fork's runtime reads them (`packages/runner/vitest/src/internal/provided.ts`). Writing them inline would copy `package.json#name` and a depth-relative root path into 33 files.                                                                                                                                                                                                                                               |
| C7  | `propertyRuns`, `isMutationWorker`, `propertyCheckDefaults`: provide `@systemfsoftware/vitest:property-check` as 30 runs in a Stryker worker, 1000 in CI, 100 locally, with `record: false` in CI and Stryker                                          | Plugin                                                         | It is the fork engine's own budget input (`src/internal/property/defaults.ts:10`). Changing it needed a declared edit to a package the fork does not own (W5), and copies of the env reading drift (W3).                                                                                                                                                                                                                               |
| C8  | `isAgent`, exported `isCI`                                                                                                                                                                                                                             | Delete                                                         | The only outside consumer is rx-effect's timeout, which becomes a constant. The plugin keeps a private reading for C7.                                                                                                                                                                                                                                                                                                                 |
| C9  | `sharedTestTimeout`: 30 s in CI, 15 s under an agent, 8 s locally                                                                                                                                                                                      | Inline constant `30_000`                                       | Keeps CI's value. A package that sets its own timeout keeps it.                                                                                                                                                                                                                                                                                                                                                                        |
| C10 | `sourceCondition`, `sourceResolveConditions`: `resolve.conditions` and `ssr.resolve.conditions` with Vite's defaults spread back in                                                                                                                    | Inline                                                         | Two keys per config. Conditions are a contract each package owns (W4), and gritlint's `vitest-conditions` rule requires the `ssr` key inline once the shared import is gone.                                                                                                                                                                                                                                                           |
| C11 | `resolve.alias` from `effect/TestClock` to `@systemfsoftware/vitest/TestClock`                                                                                                                                                                         | Plugin (`resolveId`)                                           | It is the runtime half of a published fork feature: the fork ships the ambient `effect/TestClock` type (`src/compat.d.ts`, `tsdown.config.ts:42`) and its README promises the path resolves. Today it resolves only inside this repository, through the private config, so an outside consumer gets the type and a failed import. No test imports the path, so file lists do not move.                                                 |
| C12 | `globals: false`, `environment: 'node'`                                                                                                                                                                                                                | Delete                                                         | Both are Vitest's defaults.                                                                                                                                                                                                                                                                                                                                                                                                            |
| C13 | `includeSource: ['src/**/*.{js,ts}']`                                                                                                                                                                                                                  | Inline                                                         | Written in every package that inherits it today, because in-source collection shows up in `vitest list`.                                                                                                                                                                                                                                                                                                                               |
| C14 | `exclude: ['**/.stryker-tmp/**', '**/node_modules/**', '**/.repo/**']`                                                                                                                                                                                 | Inline `[...configDefaults.exclude, '**/.stryker-tmp/**']`     | `.stryker-tmp` is Stryker's sandbox inside the package (`090ff9d3d1`). No tool creates `.repo`, so it goes. `.git` returns with Vitest's default.                                                                                                                                                                                                                                                                                      |
| C15 | `passWithNoTests: true`                                                                                                                                                                                                                                | Inline                                                         | Written in every package that does not set `false`.                                                                                                                                                                                                                                                                                                                                                                                    |
| C16 | `silent: 'passed-only'` under CI or an agent                                                                                                                                                                                                           | Inline constant `'passed-only'`                                | Keeps CI and agent output. Local runs also hide passing tests' console output.                                                                                                                                                                                                                                                                                                                                                         |
| C17 | `reporters: ['agent', 'github-actions']` under CI                                                                                                                                                                                                      | Delete; `turbo.json` passes `GITHUB_ACTIONS` through to `test` | Vitest 5's default reporters are `minimal` when std-env detects an agent CLI (it reads agent markers, not this repo's `AGENT`) or `default` otherwise, plus `github-actions` when `GITHUB_ACTIONS=true` (vitest `dist/chunks/defaults.*.js:67`). Turbo's strict env drops `GITHUB_ACTIONS` from the `test` task, so it joins `passThroughEnv` (not hashed) to keep CI annotations. CI's main reporter moves from `agent` to `default`. |
| C18 | `bail: 1` under an agent                                                                                                                                                                                                                               | Delete                                                         | A run-time choice; `vitest run --bail=1` expresses it.                                                                                                                                                                                                                                                                                                                                                                                 |
| C19 | `coverage.enabled: COVERAGE === 'true'`                                                                                                                                                                                                                | Delete                                                         | No workflow or script sets `COVERAGE`; only `turbo.json` `test.env` names it. `--coverage` is Vitest's own switch.                                                                                                                                                                                                                                                                                                                     |
| C20 | `coverage.provider: 'v8'`, `coverage.reporter: ['json', 'html', 'lcov']`                                                                                                                                                                               | Inline where the package configures coverage                   | `effect-cell-types` and `effect-memfs` enable coverage with thresholds and inherit these. Elsewhere they only matter under `--coverage`, and `v8` is Vitest's default provider.                                                                                                                                                                                                                                                        |
| C21 | `defineConfig` JSDoc describing a coverage gate in the config's plugins                                                                                                                                                                                | Delete                                                         | Stale since #526 (W10).                                                                                                                                                                                                                                                                                                                                                                                                                |
| C22 | `lib/files.js`: `exists`, `firstExisting`, `readJson`                                                                                                                                                                                                  | Delete                                                         | They served C4 and C6 only.                                                                                                                                                                                                                                                                                                                                                                                                            |

### Key Decisions

- **Plain configuration is written inline; only what the fork's own runtime needs goes to the plugin.** A setting that chooses files, projects, conditions, timeouts or output is the package's configuration. A value derived from disk or environment that only the fork's engine consumes (C6, C7), and the runtime half of a type the fork publishes (C11), belong to the fork. Governs R3, R6.
- **The plugin sets no Vitest option.** `configureVitest` calls `project.provide` for the keys the fork's runtime reads, and `resolveId` serves the fork's compat path. Removing the plugin from a package changes no file list, project, timeout, condition or setup file. A plugin that set test options would be the same factory under a new name. Governs R6.
- **CI behaviour is preserved and local behaviour may simplify.** Where an env-tiered value collapses to one constant, the constant is CI's (C9, C16). Governs R3.
- **Exemptions live where they apply.** Governs R4.
- **Equivalence before cleanup.** Known quirks (W9, inherited `includeSource` under `extends: true`) are reproduced, not fixed, so the before/after diff stays empty. Governs R7.

### Requirements

**Removal**

- R1. `packages/toolchain/vitest-config` is deleted, no package depends on or imports it, and no replacement shared config exists under another name or path. Outside CHANGELOG history (`.changeset/changelogs/`, `.changeset/ledger.yaml`), finished `docs/plans/` and the judgment surfaces OQ1 leaves to their owner, `git grep '@systemfsoftware/vitest-config'` matches nothing.
- R2. Every package's `vitest.config.ts` (and `vitest.node.config.ts`) calls Vitest's `defineConfig` from `vitest/config` and imports no config factory, shared base file or config-returning helper from outside its own package. A package's config may import its own sibling config (`effect-atom`'s `vitest.config.ts` imports `./vitest.node.config.js`).

**Behaviour carried**

- R3. Each capability lands as its Capability Rulings row says.
- R4. Every project the guard covers today keeps `@systemfsoftware/vitest/guard` in its setup files, and every exempt project (five oxlint plugins, storybook-gherkin's `storybook`) and the unguarded `tsdown-config` stay without it.
- R5. Each of the 14 packages that keep conformance files resolves the same project names and runs the same files in the default lane and under `VITEST_LANE=pr` as before, including a declared project the PR lane empties, which still resolves and passes through `passWithNoTests`.
- R6. `@systemfsoftware/vitest` publishes the plugin at `@systemfsoftware/vitest/plugin`. It provides C6 and C7, serves C11 with `enforce: 'pre'` (so it answers before Vite's core resolver, as the alias did), and leaves a key the package's own `test.provide` already sets alone. Resolving one config with and without the plugin differs only in provided context.

**Equivalence**

- R7. For every config file, `vitest list --filesOnly` output and the resolved project names are identical before and after, in the default lane and under `VITEST_LANE=pr`. Any difference is listed in the PR body with its justification.

**Delivery**

- R8. The work ships as at most a two-PR stack on `main`, updated only by new commits and plain pushes. CI is green on the PR head SHA, and the job logs show turbo ran the test tasks with 0 cached.
- R9. No judgment surface is edited without Ryan's ruling. That covers `packs/source-resolution/`, `gritlint.json`, `.omp/rules-corpus/`, `scripts/guards/`, `.github/workflows/` and `.github/actions/`.

### Acceptance Examples

- AE1. Covers R5. Given `effect-daemon-spec` (conformance files, no declared projects), when `vitest list --filesOnly` runs in the default lane, then it lists `[unit]` and `[conformance]` files. Under `VITEST_LANE=pr` it lists only `[unit]` files, and the `conformance` project does not resolve.
- AE2. Covers R5. Given `effect-daemon-cluster` (declares `unit` and `conformance`), when its `vitest run --project unit --project conformance` runs under `VITEST_LANE=pr`, then both projects resolve and `conformance` holds no file.
- AE3. Covers R4. Given `storybook-gherkin`, its `conformance` project loads the guard and its `storybook` project does not.
- AE4. Covers R6. Given a package whose config lists the plugin, its resolved project provides that package's npm name and the workspace root. With `CI` set and `AGENT` unset it provides `{ runs: 1000, record: false }`; with both set, `{ runs: 100 }`.

### Scope Boundaries

- The oxlint config packages, `@systemfsoftware/tsconfig`, `scripts/guards/` and the fork's guard sources (`src/guard.ts`, `src/internal/guard.ts`) are not touched.
- The gritlint pack `source-resolution`, `gritlint.json` and `.omp/rules-corpus/` are not edited in this change (OQ1).
- W9 and inherited `includeSource` are reproduced as-is. Fixing them is follow-up work for Ryan to rule on.
- `turbo.json` keeps `VITEST_LANE`, `AGENT` and `CI` in `test.env`, because the inline lane read and the plugin still consume them.
- No root `vitest.shared.ts`, workspace-level Vitest config, or new third-party dependency.
- No mutation run locally.

### Findings That Contradict the Brief

- The count is 39 packages and 42 config files. Three packages (`effect-atom`, `effect-atom-react`, `storybook-gherkin`) also keep a `vitest.node.config.ts` that Stryker runs alone.
- Two of those node configs (`effect-atom`, `storybook-gherkin`) are split into `unit` and `conformance` by the factory at load time, invisibly, because they declare no projects. Baseline: `["conformance","unit"]` by default, `["unit"]` under the PR lane.
- W9 is real. The baseline at `1f619061d0` resolves storybook-gherkin's `conformance` project with 0 files under `VITEST_LANE=pr`, and its `storybook` project gains an injected `test.include` that Storybook warns it ignores.
- `tsdown-config` never had the guard or the provided context. It is not a guarded package that lost them.
- The "real behaviour" list in the brief omits the provided context (C6, C7), which is the one part of the shared config only the fork's runtime consumes.
- The old brief's grep predicate could not hold without editing judgment surfaces, which `CONST-E9` forbids the graded change to do. The re-brief's predicate drops the grep; OQ1 records how the surfaces are handled.
- A pending changeset, `.changeset/property-failures-as-data.md`, still releases a `patch` of the deleted package. It is a release intent, not history, so U4 edits it.

### Outstanding Questions

- OQ1. Resolved: these judgment surfaces name the deleted package and are not edited (`CONST-E9`, R9). The `source-resolution` gritlint pack has a `shared-vitest-config` rule over `vitest-config/lib/base.js`, a shared-import escape in `vitest-conditions`, and an `imports-shared` fixture. `gritlint.json` and `packs/source-resolution/README.md` carry the `sharedVitestConfig` and `sharedVitestConfigFile` parameters. `.omp/rules-corpus/solution-problem-type-enum.json` holds verbatim copies of two solution docs that name the package. After the deletion the rule matches no file and the escape matches no import: no package can take the escape, because the module it names no longer resolves. The PR body hands their removal to the pack's owner. The `imports-shared` fixture is lint input, not a package, and no Vitest run loads it. Nothing under `repos/` names the package (`git grep` over `repos/` is empty).

### Challenge (CONST-W2)

Three assumptions the design rests on, each with what breaks it:

- A1. The fork's runtime inputs (C6, C7) must arrive through Vitest's provided context, so some config-side code must call `provide`. Broken if the fork could read them itself in the worker. Substitution lens: the fork's engine reads `CI`, `AGENT` and `STRYKER_MUTATOR_WORKER` from the worker's environment and its package from disk. Rejected: the fork's runtime reads no Node built-in by design (`src/internal/provided.ts:1-5`), its `ProvidedContext` keys are a published contract (`src/mod.ts:32-36`) a consumer may already fill, and moving the reads into the engine changes the fork's runtime rather than the configs. The plugin keeps the reads at the Vite plugin edge, where Node is the host.
- A2. A plugin that only provides values is not a shared config under another name. Broken if removing it from a package changed a file list, a project, a timeout, a condition, a reporter or a setup file. U5 checks it: one config resolved with and without the plugin differs only in `provide` and the `effect/TestClock` resolution.
- A3. `vitest list --filesOnly` plus the resolved fields captures "same lanes and projects". Broken if a lane were chosen outside the config, or if a config read an env variable the capture does not vary. After the change the only variable any config reads is `VITEST_LANE` (C7 moves to the plugin, C9/C16 become constants), so the default and PR captures cover every runner: turbo's `test` (PR lane in CI), Stryker's `mutation` and storybook-gherkin's browser workflow (both default lane). `package.json` scripts and CI's `VITEST_LANE=pr` are unchanged.

Prior taste: the Turborepo Vitest guide (turborepo.dev/docs/guides/tools/vitest) runs one Vitest config per package so each package's test task caches on its own inputs, the property W7 breaks. The software wiki has no entry on shared test presets.

### Test Admission

One test file is proposed (U2). It calls the published `@systemfsoftware/vitest/plugin` export in-process through `createVitest` and spawns no process, so it is a composition test of a published operation. Admitted cases: provided package name and workspace root; the three env tiers; precedence of a package's own `test.provide`; refusal of a `package.json` with no `name`; `effect/TestClock` resolution. Each pins a consumer-observable value. Refused: tests of the 42 migrated configs (U5's before/after diff is the evidence, and it is scratch), and any test of the deleted factory.

### Doc Review Dispositions (2026-10-09)

Feasibility and adversarial reviewers ran once over the superseded plan. Applied: `enforce: 'pre'` for C11 (KTD4, R6); the built-fork prerequisite (KTD2); C17's real trigger and `GITHUB_ACTIONS` pass-through; guard placement and split-root rule (KTD5); four undeclared differences (KTD6); the PR-lane wording of R5; R2's sibling-config carve-out; the broken "No factory" gate; R1/DoD agreement; the with/without-plugin discriminator check (U5). Rejected: "the plugin is the shared config renamed" (Challenge A1-A2: it sets no Vitest option, decides no file, project or lane, and U5 proves removing it moves only provided context); "capture Stryker and browser lanes separately" (A3: no config reads any variable but `VITEST_LANE` after the change); "turbo.json is a judgment surface" (it declares task inputs and env, it grades nothing); "the budget tier has two owners" (after U4 the plugin is the only one); "layer 2 needs a release bump for version skew" (configs are not published; `files` is `dist`).

---

## Planning Contract

### Key Technical Decisions

- **KTD1. Two layers, inert first.** Layer 1 (`chore/own-vitest-configs`): this plan, the plugin (U2) and its changeset. Nothing imports the plugin yet. Layer 2 (`refactor/inline-vitest-configs`, `gh stack add`): every config migration, the deletion and the reference sweep (U3, U4). The deletion and the last consumer's migration land in one commit range, so `main` never carries a package that imports a deleted module. REPO-D2 holds: only layer 1 adds a plan.
- **KTD2. The guard line is `setupFiles: ['@systemfsoftware/vitest/guard']`.** Vitest resolves `setupFiles` through Node resolution (`resolvePath` via `local-pkg`, vitest `packages/vitest/src/node/config/resolveConfig.ts:40-52,590-593`), which ignores `resolve.conditions`, so the line resolves to the fork's `dist/guard.mjs` where the factory preferred `src/guard.ts`. Turbo's `test` task already `dependsOn` `^build`, so `dist` exists for every `turbo test`. The guard keeps its state on `globalThis` under `Symbol.for` keys precisely so a `dist` setup file and `src` test imports share one window (`packages/runner/vitest/src/internal/guard.ts:24-28`). The fork itself writes `./src/guard.ts`. The factory's "refuse when undeclared" check is replaced by Vitest's failure to load a setup file that does not resolve. Prerequisite: the fork is built before any consumer's Vitest run. Turbo's `test` and `mutation` tasks guarantee it (`dependsOn: ['^build']`); a bare `pnpm --filter <pkg> test` on a fresh clone needs `pnpm build` first.
- **KTD3. Conditions are written with Vite's defaults spread back in, in the factory's order.** `resolve: { conditions: [...defaultClientConditions, '@systemfsoftware/source'] }` and `ssr: { resolve: { conditions: [...defaultServerConditions, '@systemfsoftware/source'] } }`, imported from `vite` (`lib/base.js:407-410`). `vitest/config` does not re-export them, so each migrated package lists `vite: catalog:` in `devDependencies` (already in the catalog and the lockfile; not a new dependency). trace-spec keeps its own override (W4).
- **KTD4. Plugin shape.** `src/plugin.ts` exports `vitestFork(): Plugin` (type from `vitest/config`, which re-exports Vite's `Plugin`, `packages/vitest/src/public/config.ts:23`). Three hooks:
  - `configResolved(config)`: read `<config.root>/package.json`, decode `name` with the existing `PackageName` schema (`src/internal/provided.schema.ts`), find the workspace root by the same upward `pnpm-workspace.yaml` walk (falling back to the root), and choose the C7 budget; `configureVitest({ project })` then calls `project.provide` for `packageKey`, `workspaceRootKey` and `checkDefaultsKey` (`src/internal/provided.ts:17,20`, `src/internal/property/defaults.ts:10`). A key already in `project.getProvidedContext()` is skipped, because Vitest applies `test.provide` in the project constructor before plugin hooks run (vitest `dist/chunks/index.*.js` `_provideObject(projectConfig.provide)` in the `TestProject` constructor; `configureVitest` runs in `_attachProjectServers`).
  - `resolveId(id)` with `enforce: 'pre'`: `effect/TestClock` resolves to the fork's `TestClock` entry, by `this.resolve('@systemfsoftware/vitest/TestClock', importer, { skipSelf: true })`, so the consumer's own conditions pick `src` or `dist`. `pre` keeps the alias's place ahead of other plugins; with `effect` installed beside the importer, a normal-order hook also resolved (U2 sabotage), so the order is kept for equivalence, not because the core resolver throws.
  - `configResolved(config)` reads the facts for `config.root` (async, allowed there); `configureVitest` provides them synchronously, because its hook type returns `void` and the lint preset refuses a promise there.
  - The env tiers (C7) and `isAgent` move into the plugin verbatim from `lib/base.js:380-400`. File reads run as one Effect program in `configResolved`, the plugin's edge, using `@effect/platform-node` (already a dependency). No `config` hook.
  - The entry is added in `tsdown.config.ts` (REPO-S4), never by hand in `package.json#exports`.
- **KTD5. The conformance split and the PR lane are written per package, matching what the factory produced (`lib/base.js:264-339`).** A package with no declared projects:
  ```ts
  const prLane = process.env['VITEST_LANE'] === 'pr'
  const conformance = '**/*.conformance.test.ts'
  // test.projects, with the root `test` carrying no include of its own:
  [
    { extends: true, test: { name: 'unit', include: [...specs, `!${conformance}`] } },
    ...(prLane ? [] : [{ extends: true, test: { name: 'conformance', include: [conformance], includeSource: [] } }]),
  ]
  ```
  `specs` is the package's own include, or Vitest's `defaultInclude` when it set none. A package that declares a `conformance` project keeps it under the PR lane with `include: []` and `includeSource: []`, and every other project's include gains `!${conformance}`, which is what `laneProjects` did. The exact include sets are copied from the U1 baseline's resolved `projects.json`, so names and file lists match by construction and U5's diff proves it. Guard placement follows the factory: on the root `test` when the config declares no projects; otherwise on each non-exempt project and never on the root, because `extends: true` would carry a root guard into the exempt `storybook` project. A split root carries `include: []` and `includeSource: []`, and the `unit` project keeps the package's `includeSource`.
- **KTD6. Expected differences, declared up front.** These are the only resolved-config differences U5 may accept, each listed in the PR body:
  - Guard setup file path `src/guard.ts` → `dist/guard.mjs` (KTD2).
  - Local `testTimeout` 8 s → 30 s and local `silent` `false` → `'passed-only'` (C9, C16). CI values are unchanged.
  - CI reporters `['agent', 'github-actions']` → Vitest's `default` plus `github-actions` (C17).
  - `coverage.enabled` no longer follows `COVERAGE` (C19); `turbo.json` drops `COVERAGE` from `test.env`.
  - `exclude` gains `**/.git/**` and loses `**/.repo/**` (C14).
  - `bail: 1` under an agent is gone (C18).
  - `tsdown-config` gains nothing: it stays unguarded and without the plugin.
  - The five oxlint plugins and `tsdown-config` do not depend on the fork, so they list no plugin and lose the provided keys nothing in them reads.
  - Provided-key precedence inverts: the factory merged its package and workspace-root values over a package's own `test.provide`; the plugin leaves a package's own value alone. No config in the repo sets these keys, so no resolved value moves.
  - Under `--coverage`, a package without its own coverage block reports with Vitest's default reporters (`text`, `html`, `clover`, `json`) instead of `json`, `html`, `lcov`. Nothing in CI passes `--coverage`.
  - Packages that spread only the conditions (`oxlint-plugin-dmmf-workflow`, `storybook-gherkin`) or bypassed the factory (`tsdown-config`) keep their own test settings and gain no timeout, `silent` or `passWithNoTests` they did not have.
  - Array order inside `exclude` and `setupFiles` may differ where the factory deduplicated; membership is compared, not order.
- **KTD7. Changesets.** Layer 1: `@systemfsoftware/vitest` `minor` (new `./plugin` export; README gains the plugin section and loses the "shared Vitest config's alias" sentence at `README.md:122`). Layer 2: `pnpm change --bump none` naming each publishable package whose build hash moves (devDependency edits), plus the edit to `.changeset/property-failures-as-data.md` that drops the deleted package's `patch` line and rewords "vitest-config sets `record: false`" to name the plugin.

### Assumptions

- "Don't touch the guards" means `scripts/guards/` and the fork's guard sources. Writing the `setupFiles` line in each package is configuration this unit owns (predicate 3 asks for it).
- `turbo.json` is build configuration, not a judgment surface: U4 removes the deleted package's path from `test.inputs` and `COVERAGE` from `test.env`.
- Doctrine docs (`docs/solutions/`, `docs/residual-review-findings/`, unfinished `docs/plans/`) that name the package are reworded to "the former shared Vitest config" so R1's grep holds; their findings stay.

### Risks

- The fork's lint config may refuse `node:` imports or `process.env` in `src/`. KTD4 already routes file reads through `@effect/platform-node`. Env reads have no platform alternative at a plugin edge; if a rule fires, stop per the Stop conditions rather than edit the rule.
- `ea2037dfc9` lets CI skip a package whose hash passed on any ref. Every migrated package's `vitest.config.ts` and `package.json` change, and `turbo.json` changes, so no prior pass matches; U5 checks the cached count anyway.
- Storybook's plugin warns about and ignores `test.include` in storybook-gherkin's `storybook` project. The baseline has the same warning; it is reproduced (W9 scope boundary).

---

## Implementation Units

### U1. Baseline capture (done, scratch only)

- **Goal:** the before side of R7.
- **Requirements:** R5, R7.
- **Files:** `.context/vitest-equivalence/` (gitignored, never committed).
- **Approach:** at `38b0d458` (this plan over `1f619061d0`; no config differs), `capture.sh before` runs, for each of the 42 configs, `vitest list --filesOnly --config <file>` in both lanes under `CI=true` with `AGENT` unset, and `projects.mjs`, which resolves the config through `createVitest` and prints each project's name, include, exclude, `includeSource`, setup files, provided context, conditions, timeouts, silent, reporters and coverage, in both lanes under CI and once in the default lane with no `CI`/`AGENT`.
- **Verification:** 42 configs × 2 lanes captured, every exit 0, 761 listed file lines plus storybook-gherkin's three-line `test.include` warning under the PR lane. Done.

### U2. Plugin in `@systemfsoftware/vitest` (layer 1)

- **Goal:** R6, with nothing consuming it yet.
- **Requirements:** R6, AE4; C6, C7, C11.
- **Dependencies:** none.
- **Files:** `packages/runner/vitest/src/plugin.ts`, `packages/runner/vitest/tsdown.config.ts`, `packages/runner/vitest/tests/plugin.integration.test.ts`, `packages/runner/vitest/README.md`, `.changeset/<name>.md`.
- **Approach:** KTD4.
- **Test scenarios:** one integration test file through the published name, resolving configs with `createVitest('test', { config: false, root: <fixture dir>, watch: false }, { plugins: [vitestFork()] })` and reading `project.getProvidedContext()`, never running a nested suite (W1):
  - the fixture package's npm name and the directory holding `pnpm-workspace.yaml` are provided;
  - with `CI=true` and no `AGENT`, `{ runs: 1000, record: false }`; with `AGENT` set, `{ runs: 100 }`; with `STRYKER_MUTATOR_WORKER`, `{ runs: 30, record: false }`;
  - a `test.provide` value for the property-check key survives;
  - a fixture `package.json` with no `name` fails config resolution with the decode error;
  - `effect/TestClock` resolves to the fork's `TestClock` module.
- **Verification:** `pnpm --filter @systemfsoftware/vitest build typecheck lint test`; `attw` via `pnpm --filter @systemfsoftware/vitest attw` for the new subpath.

### U3. Inline every config (layer 2)

- **Goal:** R2 to R5 for all 42 configs.
- **Requirements:** R2, R3, R4, R5; C1 to C5, C9, C10, C13 to C16, C20.
- **Dependencies:** U2.
- **Files:** each consumer's `vitest.config.ts` / `vitest.node.config.ts` and `package.json` (drop `@systemfsoftware/vitest-config`, add `vite: catalog:`; keep `@systemfsoftware/vitest`).
- **Approach:** per config, write `defineConfig` from `vitest/config` with: `plugins: [..., vitestFork()]` (not for the oxlint plugins or `tsdown-config`), KTD3 conditions, `test.includeSource`, `test.exclude`, `passWithNoTests`, `testTimeout: 30_000` unless the package sets its own, `silent: 'passed-only'`, the guard line per KTD2 and R4, and KTD5's projects where the package keeps conformance files. Values come from the U1 `projects.json`. Exempt projects carry a one-line comment naming the runner that registers their tests (C3). Fan out by family (`atom`, `daemon`, `gherkin`, `oxlint-plugin`, `schema`, `sim`, `trace`, `runner`, singletons), at most five files per worker; the parent runs U5 after every family.
- **Test scenarios:** none new; U5's diff is the test.
- **Verification:** U5 per family, then all.

### U4. Delete the package and sweep references (layer 2)

- **Goal:** R1.
- **Requirements:** R1, R8, R9; C8, C12, C17 to C19, C21, C22.
- **Dependencies:** U3; OQ1 for the grep clause.
- **Files:** `packages/toolchain/vitest-config/` (deleted), `pnpm-workspace.yaml` (catalog entry), `pnpm-lock.yaml`, `turbo.json` (`test.inputs` path, `COVERAGE`, `GITHUB_ACTIONS` in `test.passThroughEnv`), `packages/sim/effect-sim-kernel/turbo.json` and `packages/sim/effect-sim-kernel-tests/turbo.json` (`test.inputs` path), `.changeset/property-failures-as-data.md`, `packages/runner/vitest/README.md`, the doctrine docs listed by `git grep -l '@systemfsoftware/vitest-config'`.
- **Approach:** delete, `pnpm install`, reword, then `git grep -nI -e '@systemfsoftware/vitest-config' -e 'toolchain/vitest-config' -- . ':!*.lock'` must list only the R1 exemptions and OQ1's paths.
- **Verification:** the grep above; `pnpm check:local`.

### U5. Equivalence diff

- **Goal:** R7 evidence for the PR body.
- **Requirements:** R5, R7.
- **Dependencies:** U3 (per family), U4 (final).
- **Files:** `.context/vitest-equivalence/after/` (scratch).
- **Approach:** `pnpm gate:dist`, then `capture.sh after`; `diff` every `*.list.txt` pair (must be empty) and the project-name arrays from each `projects.json` pair (must be empty); `diff` the remaining resolved fields and classify each line against KTD6. For R6's discriminator, resolve one migrated config with its `vitestFork()` removed and diff against the same config with it: only `provide` may differ.
- **Verification:** list and project-name diffs empty in both lanes; every other difference maps to a KTD6 bullet.

---

## Verification Contract

| Gate            | Command                                                                                                                                               | Proves  |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| Equivalence     | U5 (`capture.sh after` + `diff`)                                                                                                                      | R5, R7  |
| Plugin contract | `pnpm --filter @systemfsoftware/vitest test`                                                                                                          | R6, AE4 |
| Removal         | `git grep -nI -e '@systemfsoftware/vitest-config' -- . ':!*.lock'`                                                                                    | R1      |
| No factory      | `git grep -nE "vitest-config\|lib/base" -- ':(glob)packages/**/vitest*.config.ts'` is empty; every config imports `defineConfig` from `vitest/config` | R2      |
| Local chain     | `pnpm check:local` after the last edit, exit 0                                                                                                        | REPO-D1 |
| CI              | `xd://github run_watch` on each layer's head SHA; the test job log shows turbo's `test` run with `0 cached`                                           | R8      |

Mutation, `pnpm mutation` and `pnpm check:ci` are not run locally.

## Definition of Done

- Both layers open as one `gh stack` on `main`, pushed with plain pushes, CI green on each head SHA with 0 cached test tasks.
- U5 diffs empty for file lists and project names in both lanes; every other difference is in KTD6 and in the PR body.
- The PR body states what each capability became (the Capability Rulings table) and why the shared config failed (W1 to W10).
- R1 holds as written, and the PR body names the OQ1 surfaces for their owner.
- No scratch file, probe or temporary config remains in the tree; `.context/` stays untracked.
