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
  - "x Cyclic dependency detected: <package>#build for each member of the toolchain cycle — turbo refuses to schedule the cyclic `build` tasks"
  - "pnpm check exits 1 within seconds having run zero tasks: nothing builds, tests, or typechecks"
  - "WARNING Circular package dependency detected: <the same package set>"
  - "[WARN] There are cyclic workspace dependencies: <plugin package>, <runner package>"
root_cause: config_error
resolution_type: config_change
tags: [turbo, circular-dependency, devdependencies, workspace, build-graph, toolchain, monorepo]
related_components: [oxlint-plugin-cell-vocabulary, stryker-js-engine, stryker-js-typescript-checker, stryker-js-vitest-runner]
---

# Circular turbo build task graph from self-hosted toolchain devDependencies

## Problem

The oxlint cell-vocabulary plugin and the stryker-js tooling packages formed a self-hosting toolchain cycle: the plugin dev-depends on the stryker packages to run its own mutation testing, and the stryker packages dev-depend on the plugin to lint themselves. The package graph cycle printed on stderr of every turbo and pnpm command, and — before the fixes below — turbo could not construct its task graph at all, so `pnpm check` failed within seconds without executing a single task.

## Symptoms

Two independent detectors warn about one package-graph cycle, plus one hard task-graph error:

- **Turbo's task-graph error:** turbo refused to schedule the cyclic `build` tasks, naming each member as `<package>#build` and printing the edge sets whose removal would break the cycle. Zero tasks ran; the entire gate was blocked on graph construction, masking every other failure in the tree.
- **Turbo's package-graph warning:** turbo's `PackageGraph::validate()` runs on every command and printed `WARNING Circular package dependency detected: ...` on stderr whenever the workspace package graph was cyclic. This is turbo's own diagnostic; it is unconditional and has no suppression config.
- **pnpm's install warning:** pnpm printed `[WARN] There are cyclic workspace dependencies: <paths>` on stderr of its install step, gated by the Boolean `ignore-workspace-cycles` setting (default `false`; `allowCyclicDependencies` is not a pnpm setting).

## What Didn't Work

Three candidate fixes were considered and rejected — rejected by reasoning about what each would break, not by trial:

- **Deleting the plugin devDependency from the stryker packages.** Removing `@systemfsoftware/oxlint-plugin-cell-vocabulary` from the fork packages' `package.json` files breaks their lint coverage of the plugin's rules — the edge was what their `oxlint.config.ts` used to load the plugin. The repo's AGENTS.md forbids weakening a rule or threshold to make a change pass. The rejection stands against removing the edge _without_ a replacement mechanism: the fork packages load the plugin through the `@systemfsoftware/all` umbrella preset, which dev-depends it.
- **Deleting cell-vocabulary's stryker devDependencies.** Removing the mutation runner, typescript-checker, and vitest-runner devDeps breaks the plugin's own mutation testing (`stryker run`, required at 100% on changed pure core). The plugin genuinely needs the stryker packages at dev time, and they resolve through the `stryker` catalog in `pnpm-workspace.yaml` (the published fork ranges), not the workspace. Still immutable.
- **Suppressing the warning.** The `WARNING Circular package dependency detected` was true: the package graph genuinely was mutual — a self-hosting toolchain where the lint plugin lints the tools that mutate-test the plugin. Silencing a true warning would be dishonest and would hide the next real cycle behind a suppressed diagnostic. It would also have been ineffective: pnpm's `ignore-workspace-cycles` silences only pnpm's own install warning — turbo's `validate()` warning is independent and would remain (empirically verified with turbo 2.10.5). The durable fix removes the cycle itself.

## Solution

**Remove the back edges so the package graph is acyclic.** The fork packages no longer dev-depend the plugin. They dev-depend the `@systemfsoftware/all` umbrella preset and load it in their `oxlint.config.ts` (`import all from '@systemfsoftware/all'`), and the plugin reaches their lint as a workspace dependency of that preset, so no fork config names a plugin. The plugin's own stryker devDependencies resolve from the registry (`catalog:stryker`) rather than the workspace.

The fork packages' `lint` needs the plugin's dist built first. With the `@systemfsoftware/all` preset a workspace devDependency of the fork packages, their `lint` task's plain `^build` already orders the plugin's build. The fork `turbo.json` files (engine, html-reporter, instrumenter and typescript-checker declare it for `lint`; vitest-runner for `test` and `typecheck`) re-declare `["^build", "build"]`, and the re-declare hazard stands — turbo's `extends` replaces `dependsOn`, so a fork that drops its own copy silently loses the ordering (its lint then races the plugin's build); keep the copies in sync.

**Verifying the rule is live.** A bare "lint exits 0" does not prove an indirectly loaded plugin registered its rules. Plant a violation the rule would flag, confirm the diagnostic names the rule, then delete the fixture and confirm lint exits 0 again. A plugin loaded through an indirect mechanism — the `@systemfsoftware/all` preset here — is proven live only by a planted violation, never by a green lint.

## Why This Works

Two distinct mechanisms were needed because the cycle operated at two levels:

- **The task-graph error** came from turbo deriving `^build` edges from the pnpm workspace graph, which in this repo provably includes devDependencies. A lint plugin is not a build input for the tools that load it — they resolve it at lint time, not at build time; a mutation runner is not a build input for the plugin — its `dist` never imports the runner.
- **The package-graph warnings** (turbo's `validate()` + pnpm's install check) came from the package graph being cyclic. The cycle was closed by removing the back edges that closed the SCC — each fork package → plugin, forced by the config that loaded the plugin at the time. Today the fork packages load the plugin through the `@systemfsoftware/all` umbrella preset instead, and the plugin's own devDependencies resolve from the registry (`catalog:stryker`) rather than the workspace. The workspace graph therefore holds only one-way edges — fork package → `@systemfsoftware/all` → plugin — and is acyclic. An acyclic package graph is silent under both detectors.

The plugin package carries no `turbo.json`: its forward devDependencies resolve from the registry (`catalog:stryker`), so they carry no `^build` edge to suppress.

## Prevention

- **Recognise the shape.** Two workspace packages that dev-depend on each other are a self-hosting toolchain bootstrap — the lint plugin lints the mutation tools, and the mutation tools exercise the plugin's own tests. At the package level this mutual devDependency is legitimate, even load-bearing; at the build-task level it is false, because a devDependency is not a build input.
- **Treat a task-graph cycle as a masking failure.** Because no task runs, a cycle makes an arbitrarily broken tree indistinguishable from a healthy one — here it concealed six failing tasks in three other packages. Fix a cycle before drawing any conclusion from a red gate.
- **Read the diagnostic instead of guessing.** Turbo's cyclic-dependency error prints the exact edge sets it would accept removing; apply the set whose edge is not a real build input (a devDependency is not a build input).
- **Distinguish the two warning detectors.** Turbo's `WARNING Circular package dependency detected` (package-graph validation, runs on every command, no suppression) and pnpm's `[WARN] There are cyclic workspace dependencies` (install-time, gated by `ignore-workspace-cycles`) are separate. pnpm's key cannot silence turbo's warning. The only durable silence is an acyclic package graph.
- **The cycle class returns only when both directions are workspace links at once.** A fork package's workspace edge into the plugin is harmless while the plugin's edges out resolve from the registry (`catalog:stryker`); reverting those ranges to `workspace:^` restores the mutual graph — which returns loudly but non-fatally (both detectors print stderr warnings on every turbo/pnpm command; `pnpm check` still exits 0 — the loud signal is the noise, not a gate failure).
- **The plugin's `dist` is a real artifact dependency.** The fork lint consumes the plugin's built bundle (through the `@systemfsoftware/all` preset); its cache key does not include the plugin dist — a pre-existing hole, unchanged by this fix: a cached fork lint survives a plugin rule change.
- **Check for an existing named remedy before inventing one.** The registry-consumption remedy for cycles that cannot be path-resolved already existed (`docs/solutions/tooling-decisions/registry-consumption-of-self-hosted-forks.md`); the fix reuses it.

## Related

- `docs/plans/2026-08-10-002-fix-toolchain-cycle-warning-plan.md` — the implementation plan that removed the back edges and added the explicit lint edges.
- `docs/plans/2026-08-08-003-refactor-path-resolved-stryker-base-plan.md` — the sibling plan that owned the forward-edge class (self-locating base preset); a plain range reached through a catalog is not a workspace link.
- `docs/solutions/tooling-decisions/registry-consumption-of-self-hosted-forks.md` — the registry-consumption remedy for cycles that cannot be path-resolved; a Tarjan pass (2026-08-09) measured one non-trivial SCC in the workspace graph, and removing the back edges dissolved it, leaving no non-trivial SCC.
- `docs/solutions/tooling-decisions/turbo-cache-requires-complete-input-hash.md` — the input-hash-completeness learning that owns the stale-dist cache hole surfaced in Prevention (fork lint's cache key excludes the plugin dist).
- `docs/solutions/test-failures/contract-lane-stops-at-dead-docker-socket.md` — the `test:contract` failure whose environmental label was later falsified and whose real cause was documented (the masking-failure lesson, applied again).
- `docs/solutions/build-errors/tsdown-private-dependency-bare-import-dist.md` — the `dependencies` vs `devDependencies` distinction that seeds the mutual-devDep cycle, applied in the opposite direction.
