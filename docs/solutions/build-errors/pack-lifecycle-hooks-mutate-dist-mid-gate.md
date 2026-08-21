---
title: pack-time lifecycle hooks delete build output mid-gate — analysis packing must be read-only
date: 2026-08-20
category: build-errors
module: arethetypeswrong-cli
problem_type: build_error
component: ci-gate
severity: high
symptoms:
  - "release gate fails non-deterministically on a fresh (cold-cache) tree; 2 of 3 identical runs failed, 1 passed"
  - "the CLI contract lane needs a built package: .../arethetypeswrong/cli/dist/main.mjs is missing - run `pnpm build` first"
  - "a dependent typecheck dies with TS2307: Cannot find module '@systemfsoftware/arethetypeswrong-core' — a dependency's dist vanished seconds after its build task completed"
  - "the package's own build task shows `✔ Build complete` earlier in the same run — the gate failure contradicts the build log"
  - "one `npm pack` in a package dir runs `prepack`, `prepare`, a workspace-wide prepare sweep, and the root prepare — visible as `Scope: all 42 workspace projects` noise from an analyzer task"
root_cause: concurrent_mutation
resolution_type: config_change
tags: [npm-pack, pnpm-pack, lifecycle-scripts, prepack, prepare, tsdown-clean, turbo-task-graph, race, contract-lane, release-gate]
---

# pack-time lifecycle hooks delete build output mid-gate — analysis packing must be read-only

## Problem

The post-merge release gate failed on a version-bumped tree, skipping `publish` (`needs: [gate]`), so a merged release PR shipped nothing to the registry. The gate's only failing task alternated between two signatures — the contract lane's built-package precondition, and a dependent package's `tsc` unable to resolve a workspace dependency — both meaning the same thing: gitignored `dist/` output ceased to exist between the build task that produced it and the concurrent task that read it. The same tree passed on a third run: the failure is a scheduling race, not a deterministic defect.

## Mechanism

`npm pack` and `pnpm pack` execute the target package's lifecycle hooks (`prepack`, then `prepare`). Three packages in this workspace carry hooks that invoke `tsdown`, and `tsdown` **cleans its output directory before writing** — `ℹ Cleaning 5 files` is the deletion event. A pack therefore opens a window:

```
W = (clean_begin, rebuild_end)   // dist contents absent or partial
```

Any concurrent reader that lands in `W` fails:

- a dependent package's `typecheck` resolving the dependency's `dist/*.d.ts` through its workspace link → TS2307 "Cannot find module", cascading `no-unsafe-*` lint errors;
- the contract lane's `GlobalSetup.setup` `access(distEntry)` precondition → "needs a built package".

With `k` packs and `r` concurrent readers under `--concurrency=100%`, expected hits scale as `Σ Wₖ · r / T_gate` — small but nonzero, hence 2-of-3. Observed writers during one gate run: the `attw` task's analyzer pack (`PackRunner.pack` spawning `npm pack`), the lane's own tarball packs (`pnpm --filter <pkg> exec pnpm pack`), and — worst — a single pack whose `prepack` invoked `pnpm build`, which pnpm escalated into a workspace-wide `prepare` sweep, rebuilding other packages' `dist` and running the root `prepare` while unrelated tasks were mid-flight.

The task graph cannot save you here: turbo ordered everything correctly (`test:contract` waits on own and `^build`; the build completed). The hooks are **writers invisible to the task graph** — no `dependsOn` can order them.

## Solution

Context selection: hooks are wanted at **install** (`prepare` builds the bin target between pnpm's two shim-link passes) and at **publish** (`prepack` rebuilds `dist` from a fresh checkout), and are never wanted when packing to **read**. The fix marks exactly the analysis packs read-only:

- `PackRunner.pack` spawns `npm pack --ignore-scripts` — every `attw --pack .` in the workspace goes through this one service, so all analyzer packs are covered.
- Both contract lanes pass `npm_config_ignore_scripts: 'true'` in the pack child's environment (`execFileAsync` env spread) — `pnpm pack` accepts no `--ignore-scripts` flag; the config env var is the supported form, verified: tarball produced, `dist/` md5-identical, zero hook executions.
- `prepack`/`prepare` stay in the manifests untouched — leaf doctrine forbids removing them (bin linking; publish from a fresh checkout).

## Architectural Invariants

**Acquisition is not deployment.** A step that packs or reads a tree in order to analyze, verify, or copy it must not execute that tree's mutation hooks. Packing for analysis with hooks enabled is arbitrary-code-execution-by-analysis plus uncoordinated mutation of the analyzed tree.

**Every writer of shared build output must be a schedulable task node.** A reader's safety is `dependsOn` the writer; a writer invisible to the graph (a lifecycle hook fired inside a pack) cannot be ordered, so it must not exist in any context that runs concurrently with readers. Equivalently: after removing graph-invisible writers, every remaining writer is a build task and every reader is graph-ordered after it — the failure window is structurally empty, not merely unlikely.

```text
gate-time pack:  read-only acquisition      (ignore-scripts / config env)
install pack:    hooks ON  (prepare builds the bin target)
publish pack:    hooks ON  (prepack rebuilds dist)
```

## What Didn't Work

| Attempt                                                            | Result                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Delete `prepack`/`prepare`                                         | Forbidden by package leaf rules: pnpm never revisits a skipped bin shim, and publish from a fresh checkout packs an empty `dist`. Restoring the documented "no package carries a prepack hook" invariant is a doctrine change, not a fix. |
| Make hooks invoke the task runner (`prepack: turbo build`)         | Nested task-runner invocation from inside a lifecycle hook; imports the whole `^build` subgraph and every dependency's hooks into an install/pack context — the workspace sweep, heavier.                                                 |
| Serialize readers after packers (`test:contract` dependsOn `attw`) | Inexpressible in general: the lane's own pack of a dependency runs _inside_ the lane task, concurrent with every other package's `typecheck`. No task edge reaches inside a task.                                                         |
| `tsdown` `clean: false` (never empty the directory)                | Hides the window without removing the mutator: hooks still execute arbitrary scripts mid-analysis, and stale content-hashed chunks linger in published tarballs.                                                                          |

## Prevention

- **Any new gate-time pack consumer must pack with scripts ignored.** Grep-smell: `npm pack` / `pnpm pack` (directly or via a spawn) on the gate surface without `--ignore-scripts` or `npm_config_ignore_scripts`.
- **A package gaining `prepack`/`prepare` changes the contract for everyone that packs it.** The lanes' pack lists and the analyzer cover new packages automatically through the shared surfaces above; a _new_ pack surface must adopt the read-only form or it reintroduces the race.
- **Keep hooks minimal.** `prepare` on a bin-shipping package is a ~60 ms transpile-only build by design; a hook that grows into a workspace-wide operation turns one pack into a multi-package mutation.
- Verification that closed this: cold `attw` for the fixed package exits 0 with `dist/` md5-identical and zero hook executions in the log; `check:local` exits 0; a live graph query confirms both lanes' `test:contract` still wait on own and `^build`; CI runs both lanes in containers against the hookless tarballs.

## Related Issues

- [pnpm skips a `.bin` shim whose target is gitignored build output, and never retries](./pnpm-bin-shim-skipped-for-gitignored-build-target.md) — why `prepare` exists at all and must not be deleted; the two docs together draw the install/publish vs analysis context line.
- [first publish under OIDC trusted publishing](../tooling-decisions/first-publish-under-oidc-trusted-publishing.md) — the second, independent blocker on the same failed release: the publish preflight aborts on packages that have never existed on the registry.
- [a lifecycle build that runs during install must resolve its compiler by module resolution, never through PATH](./install-time-tool-resolution-must-not-use-path.md) — the third axis of the same lifecycle window: this doc governs when a hook may mutate output, that one governs how a hook locates the tool it runs.
