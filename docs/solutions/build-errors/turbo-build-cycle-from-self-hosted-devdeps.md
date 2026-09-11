---
title: "Circular turbo build task graph from self-hosted toolchain devDependencies"
date: 2026-08-08
updated: "2026-08-10"
category: build-errors
module: build-pipeline
problem_type: build_error
component: tooling
severity: critical
symptoms:
  - "x Cyclic dependency detected: @systemfsoftware/stryker-js-mutation-run#build, @systemfsoftware/oxlint-plugin-cell-taxonomy#build, @systemfsoftware/stryker-js-typescript-checker#build"
  - "pnpm check exits 1 within seconds having run zero tasks: nothing builds, tests, or typechecks"
  - "WARNING Circular package dependency detected: @systemfsoftware/stryker-js-mutation-run, @systemfsoftware/stryker-js-typescript-checker, @systemfsoftware/oxlint-plugin-cell-taxonomy"
  - "[WARN] There are cyclic workspace dependencies: packages/oxlint-plugins/cell-taxonomy, packages/stryker-js/mutation-run"
root_cause: config_error
resolution_type: config_change
tags: [turbo, circular-dependency, devdependencies, workspace, build-graph, toolchain, monorepo]
related_components: [oxlint-plugin-cell-vocabulary, stryker-js-engine, stryker-js-typescript-checker, stryker-js-vitest-runner]
---

# Circular turbo build task graph from self-hosted toolchain devDependencies

## Problem

The oxlint cell-vocabulary plugin (then `cell-taxonomy`) and the stryker-js tooling packages formed a self-hosting toolchain cycle: the plugin dev-depends on the stryker packages to run its own mutation testing, and the stryker packages then dev-depended on the plugin to lint themselves. The package graph cycle printed on stderr of every turbo and pnpm command, and — before the fixes below — turbo could not construct its task graph at all, so `pnpm check` failed within seconds without executing a single task.

## Symptoms

Two independent detectors warn about one package-graph cycle, plus one hard task-graph error (now resolved):

- **Turbo's task-graph error (fixed 2026-08-08):** turbo refused to schedule the cyclic `build` tasks (the diagnostic names packages as they were then — `mutation-run` is today `stryker-js-engine`, `cell-taxonomy` today `oxlint-plugin-cell-vocabulary`):
  ```text
  x Cyclic dependency detected:
  | 	@systemfsoftware/stryker-js-mutation-run#build, @systemfsoftware/oxlint-plugin-cell-taxonomy#build, @systemfsoftware/stryker-js-typescript-checker#build
  | The cycle can be broken by removing any of these sets of dependencies:
  | 	cell-taxonomy#build -> typescript-checker#build, mutation-run#build -> cell-taxonomy#build
  | 	...
  ```
  Zero tasks ran; the entire gate was blocked on graph construction, masking every other failure in the tree.
- **Turbo's package-graph warning (fixed 2026-08-10):** turbo's `PackageGraph::validate()` runs on every command and printed `WARNING Circular package dependency detected: ...` on stderr whenever the workspace package graph was cyclic. This is turbo's own diagnostic, emitted by `crates/turborepo-repository/src/package_graph/mod.rs`; it is unconditional and has no suppression config. (Earlier versions of this doc misattributed it to pnpm — corrected 2026-08-10.)
- **pnpm's install warning (fixed 2026-08-10):** pnpm printed `[WARN] There are cyclic workspace dependencies: <paths>` on stderr of its install step, gated by the Boolean `ignore-workspace-cycles` setting (default `false`; pnpm 11.9.0 — note `allowCyclicDependencies` does not exist in this pnpm).

## What Didn't Work

Three candidate fixes were considered and rejected — rejected by reasoning about what each would break, not by trial:

- **Deleting the plugin devDependency from the stryker packages.** Removing `@systemfsoftware/oxlint-plugin-cell-vocabulary` from `packages/stryker-js/stryker-js-engine/package.json` (then `mutation-run`) and `packages/stryker-js/stryker-js-typescript-checker/package.json` breaks their lint coverage of the plugin's rules — at the time the edge was what their `oxlint.config.ts` used to load the plugin through `import.meta.resolve`, applying the since-retired `capability-named-directory` rule. The repo's AGENTS.md forbids weakening a rule or threshold to make a change pass.
  - **Superseded 2026-08-10 in one precise sense:** the edge _was_ removed — by replacing the mechanism, not by deleting the check. oxlint's `jsPlugins` accepts a filesystem path with no `package.json` edge, so the three fork packages then loaded the plugin's built bundle by path (`new URL('../../oxlint-plugins/cell-taxonomy/dist/index.mjs', import.meta.url).pathname`) and the rule still applied. The rejection stands against removing the edge _without_ a replacement mechanism.
  - **Superseded again 2026-08-18:** the path form was itself replaced — the fork packages now dev-depend the `@systemfsoftware/all` umbrella preset (`import all from '@systemfsoftware/all'` in their `oxlint.config.ts`) and the plugin reaches their lint as a workspace dependency of that preset, so no fork config names a plugin path. The rejection still stands: the edge was never removed by deleting the check.
- **Deleting cell-vocabulary's stryker devDependencies.** Removing the mutation runner, typescript-checker, and vitest-runner devDeps breaks the plugin's own mutation testing (`stryker run`, required at 100% on changed pure core). The plugin genuinely needs the stryker packages at dev time — at the time they were not published on npm (verified 404), so it could not consume published artifacts instead; today its devDependencies pin the published forks through the `stryker` catalog in `pnpm-workspace.yaml`. Still immutable.
- **Suppressing the warning.** The `WARNING Circular package dependency detected` was true: the package graph genuinely was mutual — a self-hosting toolchain where the lint plugin lints the tools that mutate-test the plugin. Silencing a true warning would be dishonest and would hide the next real cycle behind a suppressed diagnostic. It would also have been ineffective: pnpm's `ignore-workspace-cycles` silences only pnpm's own install warning — turbo's `validate()` warning is independent and would remain (empirically verified with turbo 2.10.5). The durable fix removes the cycle itself.

## Solution

Two stages, both shipped:

**Stage 1 (2026-08-08): make the plugin's build a graph leaf.** A new file in the plugin package — `packages/oxlint-plugins/cell-taxonomy/turbo.json` then, `packages/oxlint-plugin/oxlint-plugin-cell-vocabulary/turbo.json` under today's layout, and deleted 2026-08-16 — overrode `build` to `dependsOn: []`. This stopped the hard task-graph error: the plugin's build no longer waits on the fork packages' builds (which it never consumed). The override was truthful at the time — the plugin's runtime `dependencies` were external only (`@oxc-project/types`, `@oxlint/plugins`), so its `build` genuinely consumed no workspace `dist` — and it stayed in place while the plugin's forward devDependencies were workspace links, where `^build` would otherwise re-create the false build-task edges. The plugin package carries no `turbo.json` today: its forward devDependencies resolve from the registry (`catalog:stryker`) rather than the workspace, and its one workspace runtime dependency (`effect-cell-types`) is a real `^build` edge.

**Stage 2 (2026-08-10): remove the back edges so the package graph is acyclic.** The three fork packages (`mutation-run`, `typescript-checker`, `mutation-report` — `mutation-run` is today `stryker-js-engine`, and `mutation-report` has since been deleted from the workspace) no longer devDepend the plugin. Their `oxlint.config.ts` entries changed from `import.meta.resolve('@systemfsoftware/oxlint-plugin-cell-taxonomy')` to a path into the plugin's built bundle (the form the `@systemfsoftware/all` preset later replaced — see below):

```ts
jsPlugins: [new URL('../../oxlint-plugins/cell-taxonomy/dist/index.mjs', import.meta.url).pathname],
```

The path had to target the **built bundle**, not `src/index.ts`: oxlint loads plugins through Node's ESM resolver, which cannot resolve the TypeScript source's `.js`-specifier internal imports (`ERR_MODULE_NOT_FOUND` on `./rules/capability-named-directory.js` — verified). The built bundle loaded and the rule fired by its configured name (verified with oxlint 1.77.0).

The lost `^build` ordering — the fork packages' lint needs the plugin's dist built first — was compensated by an explicit lint task edge in each fork package's `turbo.json` (the sibling plan's U3 instrument; turbo's `extends` replaces `dependsOn`, so root's `["^build", "build"]` is re-declared). The named plugin edge in the snippet below is historical: the plugin is `oxlint-plugin-cell-vocabulary` today, and with the `@systemfsoftware/all` preset a workspace devDependency of the fork packages, their `lint` task's plain `^build` already orders the plugin's build. The four surviving fork `turbo.json` files (engine, html-reporter, instrumenter, typescript-checker) re-declare `["^build", "build"]`, and the re-declare hazard stands — turbo's `extends` replaces `dependsOn`, so a fork that drops its own copy silently loses the ordering (its lint then races the plugin's build); keep the copies in sync. The 2026-08-10 form:

```json
{
  "$schema": "https://v2-10-1.turborepo.dev/schema.json",
  "extends": ["//"],
  "tasks": { "lint": { "dependsOn": ["^build", "build", "@systemfsoftware/oxlint-plugin-cell-taxonomy#build"] } }
}
```

Verified 2026-08-10: `pnpm turbo ls` and `pnpm install --frozen-lockfile` print no cyclic-workspace warning (both detectors); all three fork packages lint clean with the rule applied; each fork `lint` task depended on `cell-taxonomy#build` (dry-run task graph); the plugin's mutation task resolved the fork packages from the workspace at the time.

**Verifying the rule is live (the 2026-08-10 probe, since retired).** A bare "lint exits 0" does not prove an indirectly loaded plugin registered its rules. The recipe was: (1) create `packages/stryker-js/stryker-js-engine/src/utils/__verify-rule.ts` (then `packages/stryker-js/mutation-run/`) with one line of code — the `utils/` segment was banned by `capability-named-directory`; (2) run `pnpm --filter @systemfsoftware/stryker-js-engine lint` and confirm the diagnostic named `@systemfsoftware/cell-taxonomy(capability-named-directory)` and reported `utils is forbidden`; (3) delete the fixture and re-run lint, which exited 0 again. The rule it planted against has since been retired, but the lesson survives: a plugin loaded through an indirect mechanism — a config-level path then, the `@systemfsoftware/all` preset now — is proven live only by a planted violation, never by a green lint.

## Why This Works

Two distinct mechanisms were needed because the cycle operated at two levels:

- **The task-graph error** came from turbo deriving `^build` edges from the pnpm workspace graph, which in this repo provably includes devDependencies. The override on the plugin's `build` dropped the plugin's two false outgoing build edges. A lint plugin is not a build input for the tools that load it — they resolve it at lint time, not at build time; a mutation runner is not a build input for the plugin — its `dist` never imports the runner.
- **The package-graph warnings** (turbo's `validate()` + pnpm's install check) came from the package graph being cyclic. The cycle was closed by removing the two back edges that closed the SCC (`mutation-run`, today `stryker-js-engine`, → plugin and `typescript-checker` → plugin, forced by `import.meta.resolve` in their `oxlint.config.ts` files); `mutation-report`'s edge was one-way and was removed for uniformity, not to close the SCC. Path-based loading removed the edges while keeping the check; today the fork packages load the plugin through the `@systemfsoftware/all` umbrella preset instead, and the plugin's own devDependencies resolve from the registry (`catalog:stryker`) rather than the workspace. The workspace graph therefore holds only one-way edges — fork package → `@systemfsoftware/all` → plugin — and is acyclic. An acyclic package graph is silent under both detectors.

The override did not survive: the plugin's forward devDependencies resolve from the registry today (`catalog:stryker`), so they carry no `^build` edge to suppress, and the plugin package carries no `turbo.json`. The forward-edge class the sibling plan (`docs/plans/2026-08-08-003-refactor-path-resolved-stryker-base-plan.md`) owned is closed for the same reason — a plain range reached through a catalog is not a workspace link.

## Prevention

- **Recognise the shape.** Two workspace packages that dev-depend on each other are a self-hosting toolchain bootstrap — the lint plugin lints the mutation tools, and the mutation tools exercise the plugin's own tests. At the package level this mutual devDependency is legitimate, even load-bearing; at the build-task level it is false, because a devDependency is not a build input.
- **Treat a task-graph cycle as a masking failure.** Because no task runs, a cycle makes an arbitrarily broken tree indistinguishable from a healthy one — here it concealed six failing tasks in three other packages. Fix a cycle before drawing any conclusion from a red gate.
- **Read the diagnostic instead of guessing.** Turbo's cyclic-dependency error prints the exact edge sets it would accept removing. The override applied the third set (drop the plugin's outgoing build edges).
- **Distinguish the two warning detectors.** Turbo's `WARNING Circular package dependency detected` (package-graph validation, runs on every command, no suppression) and pnpm's `[WARN] There are cyclic workspace dependencies` (install-time, gated by `ignore-workspace-cycles`) are separate. pnpm's key cannot silence turbo's warning. The only durable silence is an acyclic package graph.
- **The override was the right first move, not the right end state.** The plugin-side override was the single choke point — preferable to per-consumer overrides, which are the accretion trap (an override pile that grows with every lint adoption). But the durable fix removed the back edges at the package level: the fork packages load the plugin through the `@systemfsoftware/all` preset (the 2026-08-10 config-level path was the first replacement), and the plugin's own stryker devDependencies resolve from the registry (`catalog:stryker`) rather than the workspace. The cycle class returns only when both directions are workspace links at once: a fork package's workspace edge into the plugin is harmless while the plugin's edges out are registry ranges, and reverting those ranges to `workspace:^` would restore the mutual graph — which returns loudly but non-fatally (both detectors print stderr warnings on every turbo/pnpm command; `pnpm check` still exits 0 — the loud signal is the noise, not a gate failure).
- **The plugin's `dist` is a real artifact dependency.** The fork lint consumes the plugin's built bundle (through the `@systemfsoftware/all` preset today, through a config-level path before it); its cache key does not include the plugin dist (a pre-existing hole — a cached fork lint survives a plugin rule change; unchanged by this fix, documented in the fix plan's risks).
- **Check for an existing named remedy before inventing one.** This repo had named the cycle class (`scripts/check-lint-coverage.mjs`'s cycle carve-outs — the script no longer exists, though `turbo.json` still declares the `//#check:lint-coverage` task that names it) and the registry-consumption remedy (`docs/solutions/tooling-decisions/registry-consumption-of-self-hosted-forks.md`); the sibling plan had designated ownership of this exact SCC. The fix here follows the sibling plan's Q4 alternative.

## Related

- `docs/plans/2026-08-10-002-fix-toolchain-cycle-warning-plan.md` — the implementation plan for the 2026-08-10 stage (back-edge removal, explicit lint edges, doc corrections).
- `docs/plans/2026-08-08-003-refactor-path-resolved-stryker-base-plan.md` — the sibling plan that owned the forward-edge class (self-locating base preset); its U4 owned the override's deletion (since done) and its U5 rewrites this doc — its executor must reconcile with plan `2026-08-10-002`'s Risks (which adopted this plan's Q4 alternative) and preserve this doc's detector correction.
- `docs/solutions/tooling-decisions/registry-consumption-of-self-hosted-forks.md` — the registry-consumption remedy for cycles that cannot be path-resolved; a Tarjan pass (2026-08-09) measured this triple as the only non-trivial SCC in the workspace graph — the 2026-08-10 back-edge removal dissolved it, leaving no non-trivial SCC.
- `docs/solutions/tooling-decisions/turbo-cache-requires-complete-input-hash.md` — the input-hash-completeness learning that owns the stale-dist cache hole surfaced in Prevention (fork lint's cache key excludes the plugin dist).
- `docs/solutions/test-failures/contract-lane-stops-at-dead-docker-socket.md` — the `test:contract` failure recorded under the unblocked gate; its environmental label was later falsified and the lane's real cause documented (the masking-failure lesson, applied again).
- `docs/solutions/build-errors/tsdown-private-dependency-bare-import-dist.md` — the `dependencies` vs `devDependencies` distinction that seeds the mutual-devDep cycle, applied in the opposite direction.
