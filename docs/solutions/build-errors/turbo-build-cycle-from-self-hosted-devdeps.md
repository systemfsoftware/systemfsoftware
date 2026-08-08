---
title: "Circular turbo build task graph from self-hosted toolchain devDependencies"
date: 2026-08-08
category: build-errors
module: build-pipeline
problem_type: build_error
component: tooling
severity: critical
symptoms:
  - "x Cyclic dependency detected: @systemfsoftware/stryker-js-mutation-run#build, @systemfsoftware/oxlint-plugin-cell-taxonomy#build, @systemfsoftware/stryker-js-typescript-checker#build"
  - "pnpm check exits 1 within seconds having run zero tasks: nothing builds, tests, or typechecks"
  - "WARNING Circular package dependency detected: @systemfsoftware/stryker-js-mutation-run, @systemfsoftware/stryker-js-typescript-checker, @systemfsoftware/oxlint-plugin-cell-taxonomy"
root_cause: config_error
resolution_type: config_change
tags: [turbo, circular-dependency, devdependencies, workspace, build-graph, toolchain, monorepo]
related_components: [oxlint-plugin-cell-taxonomy, stryker-js-mutation-run, stryker-js-typescript-checker, stryker-js-vitest-runner]
---

# Circular turbo build task graph from self-hosted toolchain devDependencies

## Problem

`pnpm check`, the repository's whole verification gate, failed within seconds without executing a single task: turbo could not construct the task graph because mutual devDependencies between the oxlint cell-taxonomy plugin and the stryker-js tooling packages produced a cyclic `build` dependency that turbo refuses to schedule.

## Symptoms

The gate aborted before any task ran, with turbo's hard task-graph error:

```text
WARNING  Circular package dependency detected: @systemfsoftware/stryker-js-mutation-run, @systemfsoftware/stryker-js-typescript-checker, @systemfsoftware/oxlint-plugin-cell-taxonomy
  x Cyclic dependency detected:
  | 	@systemfsoftware/stryker-js-mutation-run#build, @systemfsoftware/oxlint-plugin-cell-taxonomy#build, @systemfsoftware/stryker-js-typescript-checker#build
  |
  | The cycle can be broken by removing any of these sets of dependencies:
  | 	cell-taxonomy#build -> typescript-checker#build, mutation-run#build -> cell-taxonomy#build
  | 	mutation-run#build -> cell-taxonomy#build, typescript-checker#build -> cell-taxonomy#build
  | 	cell-taxonomy#build -> mutation-run#build, cell-taxonomy#build -> typescript-checker#build
  | 	cell-taxonomy#build -> mutation-run#build, typescript-checker#build -> cell-taxonomy#build
[ELIFECYCLE] Command failed with exit code 1.
```

Package names are abbreviated in the four removal sets above; turbo prints them fully qualified and hard-wrapped to terminal width. The four sets matter — they are the fix menu, and turbo computed it for you.

Zero tasks ran. The entire verification gate was blocked on a task-graph construction error, not on any code failure — no package built, tested, or typechecked.

## What Didn't Work

Three candidate fixes were considered and rejected — rejected by reasoning about what each would break, not by trial:

- **Delete the plugin devDependency from the two stryker packages.** Removing `@systemfsoftware/oxlint-plugin-cell-taxonomy` from `packages/stryker-js/mutation-run/package.json:140` and `packages/stryker-js/typescript-checker/package.json:38` breaks `import.meta.resolve('@systemfsoftware/oxlint-plugin-cell-taxonomy')` in `packages/stryker-js/mutation-run/oxlint.config.ts:4`, and drops the `capability-named-directory` rule (`packages/stryker-js/mutation-run/oxlint.config.ts:7`) from those packages' lint coverage. The repo's AGENTS.md forbids weakening a rule or threshold to make a change pass. Both reverse edges are load-bearing; neither could go.
- **Delete cell-taxonomy's stryker devDependencies.** Removing the mutation runner, typescript-checker, and vitest-runner devDeps (`packages/oxlint-plugins/cell-taxonomy/package.json:58-60`) breaks the plugin's own mutation testing: its `mutation` script runs `stryker run` (`packages/oxlint-plugins/cell-taxonomy/package.json:44`), which the repo's AGENTS.md requires at 100% on changed pure core. The plugin genuinely needs the stryker packages at dev time.
- **Suppress the pnpm circular-dependency warning.** The `WARNING Circular package dependency detected` is true: the package graph genuinely is mutual — a self-hosting toolchain where the lint plugin lints the tools that mutate-test the plugin. Silencing a true warning would be dishonest, and it would hide the next real cycle behind a suppressed diagnostic.

The cycle was also genuinely new, so there was no stale-edge excuse for deleting something "obviously wrong". Before the `core` → `mutation-run` rename, the plugin depended on the stryker packages one way only and neither depended back; a later commit wiring the `capability-named-directory` rule into those two packages added the reverse edges and closed the loop.

## Solution

The fix is a package-level turbo override that makes the plugin's `build` a graph leaf — exactly turbo's own third option from its cycle diagnostic, which listed the two edges it would accept removing (`cell-taxonomy#build -> mutation-run#build` and `-> typescript-checker#build`). New file `packages/oxlint-plugins/cell-taxonomy/turbo.json`:

```json
{
  "$schema": "https://v2-10-1.turborepo.dev/schema.json",
  "extends": [
    "//"
  ],
  "tasks": {
    "build": {
      "dependsOn": []
    }
  }
}
```

Package-level overrides already have precedent in this repo: `packages/stryker-js/vitest-runner/turbo.json` and `packages/arethetypeswrong/cli/turbo.json` both `extends: ["//"]` and override a single task's `dependsOn` (there, `test`, to add `build` before it). This fix applies the same shape to `build` on the plugin.

## Why This Works

The root `turbo.json` declares `build` with `"dependsOn": ["^build"]` (`turbo.json:23-25`) — the topological task dependency. Turbo derives `^build` edges from the pnpm workspace graph, and in this repo that graph provably includes devDependencies: the diagnostic above names the edge `cell-taxonomy#build -> mutation-run#build`, yet cell-taxonomy declares no runtime dependency on any workspace package at all (see below), so the devDependency is the only declaration that could have produced that edge. Dev-only tooling edges therefore become `build`-task edges. That mechanism is what turns a legitimate package-level cycle into an illegal task-level cycle: the plugin dev-depends on the stryker packages to run its own mutation tests, and the stryker packages dev-depend on the plugin to lint themselves.

Those edges are false at the build level. A lint plugin is not a build input for the tools that load it — they resolve it at lint time via `import.meta.resolve` (`packages/stryker-js/mutation-run/oxlint.config.ts:4`), not at build time. A mutation runner is not a build input for the plugin — the plugin's `dist` never imports it; the runner only executes the plugin's tests. Overriding only `build` (`dependsOn: []`) drops the two false outgoing edges, while `typecheck` (`turbo.json:36-37`), `test` (`turbo.json:51-52`), and `mutation` keep `^build` from the root config, so the plugin's verification tasks still get their dependencies built before they run.

The override is truthful, not a mute: cell-taxonomy's runtime `dependencies` are external only — `@oxc-project/types` and `@oxlint/plugins` (`packages/oxlint-plugins/cell-taxonomy/package.json:51-53`) — so its `build` genuinely consumes no workspace `dist`. There is no build edge being hidden; there never was one. The config simply states that fact.

Verified this session: turbo now executes the graph — a full `pnpm check` scheduled 257 tasks and completed 251 of them over 16m23s, recording cache hits and misses, where previously zero ran — and the hard `Cyclic dependency detected` error is gone. `oxlint-plugin-cell-taxonomy#build` itself ran and succeeded, which is the direct evidence that the two removed edges were never real build inputs. The pnpm `WARNING Circular package dependency detected` remains and was deliberately **not** suppressed: the package graph genuinely is mutual, as a self-hosting toolchain must be.

Nothing here claims the gate is green. The unblocked run finished red, with 6 failed tasks across three packages this fix never touched — and they do not share a cause: `omp-agent-discipline#build` and `omp-claude-compat#build` both fail on `RESOLVE_ERROR` for `@effect/cluster` subpaths reached through `@effect/platform-node`; `stryker-js-cli#typecheck` reports 19 Effect language-service diagnostics; `stryker-js-cli#test:contract` dies in the container runtime (`failed to create shim`), which is environmental rather than a code fault. Every one of those was invisible while the cycle stood. The verified claim is the narrow one: the cyclic task-graph error is gone and turbo executes tasks.

## Prevention

- **Recognise the shape.** Two workspace packages that dev-depend on each other are a self-hosting toolchain bootstrap — the lint plugin lints the mutation tools, and the mutation tools exercise the plugin's own tests. At the package level this mutual devDependency is legitimate, even load-bearing: each edge exists because the consumer's own verification requires it. At the build-task level it is false, because a devDependency is not a build input. The whole diagnosis is that distinction: package-level truth, task-level falsehood.
- **Treat a task-graph cycle as a masking failure.** It fails the gate for a reason that hides every other reason. Because no task runs, a cycle makes an arbitrarily broken tree indistinguishable from a healthy one — here it concealed six failing tasks in three other packages, arising from three unrelated causes. Fix a cycle before drawing any conclusion from a red gate, and re-read the gate afterward rather than assuming the cycle was the only fault.
- **Prefer the override on the plugin side.** Plugin←consumer edges multiply as lint coverage spreads: every new package that dev-depends on the plugin to run its rules adds an incoming edge, while the plugin side stays bounded at its fixed set of verification tooling. Overriding the plugin's `build` closes the loop at its single choke point; overriding each consumer instead is the accretion trap — a per-consumer override pile that grows with every lint adoption.
- **Read the diagnostic instead of guessing.** Turbo's cyclic-dependency error prints the exact edge sets it would accept removing — four of them here, quoted in full under Symptoms. The fix chosen is the third set: drop both of the plugin's outgoing build edges, which is precisely what `"build": { "dependsOn": [] }` on the plugin does. When turbo names the edges, drop exactly those, and only the ones that are false at the build level.
- **Check for an existing named remedy before inventing one.** This repo had already named the failure class: `scripts/check-lint-coverage.mjs:26` exempts the lint-rule packages from a config-dependency check with the comment "declaring oxlint-config would close a CO4 dependency cycle", repeated as the machine-readable exemption reason at `scripts/check-lint-coverage.mjs:52`. A gate that already documents a cycle-shaped carve-out for a package is a signpost: look for the same carve-out before proposing a new mechanism.

Deliberately out of scope: `mutation-run#build -> cell-taxonomy#build` and `typescript-checker#build -> cell-taxonomy#build` are also false edges, but they create no cycle — only serial ordering — so they were left alone. Fixing them would require an override in every consumer, which is precisely the accretion trap named above.

## Related Issues

- `docs/solutions/tooling-decisions/turbo-cache-requires-complete-input-hash.md` — same root `turbo.json` `dependsOn: ["^build"]` surface, complementary mechanism: cache-key completeness rather than graph construction.
- `docs/solutions/build-errors/exports-types-rollup-drift.md` — same `build_error` / `config_error` / `config_change` shape in the build pipeline.
- `docs/solutions/build-errors/tsdown-private-dependency-bare-import-dist.md` — the `dependencies` vs `devDependencies` distinction that seeds the mutual-devDep cycle, applied in the opposite direction.
- No related GitHub issue: searches for `turbo cyclic dependency`, `turbo circular devDependencies`, `cell-taxonomy stryker`, and `turbo.json dependsOn` returned no matches.
