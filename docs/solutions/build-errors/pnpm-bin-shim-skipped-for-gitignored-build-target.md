---
title: pnpm skips a `.bin` shim whose target is gitignored build output, and never retries
date: 2026-08-11
category: build-errors
module: stryker-js-cli
problem_type: build_error
component: tooling
severity: high
symptoms:
  - "every CI mutation job reported success while the mutator never executed: `sh: 1: stryker: not found`, then `[ELIFECYCLE] Command failed.`"
  - "install logs carry `WARN Failed to create bin at .../node_modules/.bin/stryker. ENOENT ... packages/stryker-js/cli/dist/main.mjs`"
  - "the merged mutation report files the missing part as `[WARN] no report` and the job still exits 0"
  - "local trees stay green — `.bin/stryker` survives from an earlier install that happened to run while `dist/` existed"
root_cause: missing_workflow_step
resolution_type: config_change
tags: [pnpm, bin-linking, lifecycle-scripts, prepare, gitignored-dist, ci-false-green, stryker, mutation]
---

# pnpm skips a `.bin` shim whose target is gitignored build output, and never retries

## Problem

Every mutation gate in the repository reported success for weeks while the mutator never ran once in CI. Two independent defects were needed to produce that: the CLI package pointed `bin.stryker` at `dist/main.mjs`, which does not exist when pnpm links bins on a fresh clone, and the mutation workflow's advisory `continue-on-error` swallowed the resulting `stryker: not found`.

## Symptoms

- The `Mutation` step's log ends with:
  ```
  $ stryker run
  sh: 1: stryker: not found
  [ELIFECYCLE] Command failed.
  ```
  and the job is green.
- Earlier in the same log, the install step warns once per bin-shipping package whose target is absent:
  ```
  [WARN] Failed to create bin at /home/runner/work/.../node_modules/.bin/stryker.
  ENOENT: no such file or directory, open '.../packages/stryker-js/cli/dist/main.mjs'
  ```
- `scripts/merge-mutation-reports.mjs` files a part with no `reports/mutation-report.json` under a `⚠️` verdict with the score `no report` (`verdictOf`), which is never a failure verdict, so the merged report also reads clean.
- No local reproduction. A developer tree keeps a working `.bin/stryker` created by some earlier install that ran while `dist/` was present, and every workspace command re-links it.

## What Didn't Work

| Attempt                                                                                            | Result                                                                                                                                                                                                  |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile` again on the broken tree                                          | `Already up to date` — pnpm short-circuits a repeat install from `node_modules/.pnpm-workspace-state-v1.json`, so neither link pass runs and the shim is not created.                                   |
| `pnpm install --force`                                                                             | Same short-circuit. `--force` re-resolves; it does not revisit an importer pnpm considers already linked.                                                                                               |
| `pnpm rebuild @systemfsoftware/stryker-js-cli`                                                     | No shim. `rebuild` runs build scripts, it does not re-link bins for an already-linked importer.                                                                                                         |
| Deleting `node_modules/.modules.yaml`, then re-installing                                          | Same. Install-time bin linking is not a self-healing pass; the only reliable repair is a fresh install into a tree with the target present.                                                             |
| `rm node_modules/.bin/stryker` locally, then run the CI command                                    | The shim came back. The local modules state still says "linked", and the turbo run re-created it — deleting the artifact does not reproduce CI, whose state is "link failed, never retried".            |
| Committing `bin/stryker.mjs` that does `await import('../dist/main.mjs')` — the sibling `attw` fix | Rejected by this package's own published lint rule. `entrypoint-not-imported` forbids importing `main.ts`'s built artifact from anything but the process: an entrypoint is interpreted, never consumed. |
| Committing a `spawn`-based `bin/stryker.mjs` instead                                               | Untyped `.mjs` inside the type-aware program: seven `typescript/no-unsafe-*` violations. Adding the file to the tsconfig program silenced those, but the shim still had to exist at all.                |
| A scoped `overrides` entry disabling the rule for `bin/`                                           | Blocked by design. The repo's oxlint config-guard rejects any rule-disabling override (`agent-plugins/oxlint-guard/src/guard-config.ts`), and the rule is deliberately ungated.                         |

Only after the shim path was closed by doctrine did the real question surface: why does the package need a committed launcher at all when the build takes 60 ms?

## Solution

Two commits, kept separate because the workflow is an Evaluator surface and must not land with the work it judges. Both on branch `mutation-debg`, unpushed as of this writing.

**`fa617cf5d35` — `ci(repo): fail mutation red when a part writes no report`** (the evaluator, committed first, observed red before and green after):

```yaml
# Advisory: a mutation score below threshold never fails this job — the
# merged report in the `report` job carries that verdict. A run that never
# produced a report is not a score outcome, so the step below fails red:
# a missing binary, a crashed run or a timeout must never read green.
- name: Mutation
  id: mutation
  continue-on-error: true
  run: corepack pnpm turbo mutation --filter=./${{ matrix.package }}

- name: Require a mutation report
  if: ${{ !cancelled() }}
  run: |
    report='${{ matrix.package }}/reports/mutation-report.json'
    if [ ! -f "$report" ]; then
      echo "::error title=Mutation produced no report::..."
      exit 1
    fi
```

**`cf47fa1f21e` — `build(stryker-js-cli): create the bin target during install`** — one line in `packages/stryker-js/cli/package.json`:

```json
"scripts": {
  "build": "tsdown",
  "prepare": "tsdown",
```

`bin` still points at `./dist/main.mjs`, and `tsdown.config.ts` still generates that field from `exports.bin` on every build (REPO-S4). No shim file, no `files` change, no tsconfig change — the revert of the shim attempt left only the added script.

## Why This Works

pnpm links workspace bins **twice per install**, once before lifecycle scripts and once after, and the second pass exists for exactly this case. Upstream in the `pnpm/pnpm` repository (not this one), `pnpm11/exec/lifecycle/src/runLifecycleHooksConcurrently.ts` re-runs `linkBins` immediately before each importer's lifecycle stages, with the comment _"We are linking the bin files, in case they were created by lifecycle scripts of other workspace packages."_ The behavior was added deliberately — pnpm's own changelog entry `dddb8ad71` (a SHA in that repository, not here), _"Local workspace bin files that should be compiled first are linked to dependent projects after compilation"_ (pnpm issue #1801).

So the install timeline on a fresh clone is:

| Phase             | Effect                                                             |
| ----------------- | ------------------------------------------------------------------ |
| Link pass 1       | `dist/main.mjs` absent → `WARN Failed to create bin`, shim skipped |
| `prepare: tsdown` | builds `dist/main.mjs` (~60 ms — transpile only, `dts: false`)     |
| Link pass 2       | target now exists → `.bin/stryker` created                         |

Verified by probe: a workspace package with `prepare` and `postinstall` markers shows both link warnings, one on each side of the script output. The `WARN` from pass 1 survives and is harmless.

The failure was therefore never "pnpm cannot link a built bin" — it was a missing lifecycle step, which is why no amount of re-installing repaired it. The committed-shim pattern `packages/arethetypeswrong/cli` had carried since the identical bug hit it solves the same problem by taking the build off the critical path instead; it works, but it costs a tracked launcher and a second convention. That package was converted to `prepare` in the same session as this fix, so the repository now has one pattern.

The second defect is a category error in the gate: `continue-on-error: true` was meant to keep a _low mutation score_ advisory, and it also made _never having run_ advisory. Score outcomes and infrastructure outcomes are different verdicts and now have different steps.

## Prevention

- **Any workspace package whose `bin` points under gitignored build output needs a `prepare` script that builds that target.** Measure the build before adopting it — `prepare` runs on every install of every clone. The stryker CLI is transpile-only with `dts: false` and costs ~60 ms; `packages/arethetypeswrong/cli` emits `.d.ts` and measured 336 ms on an unbuilt clone, still cheap.
- **Do not dodge the ordering with a committed shim in this repo.** `entrypoint-not-imported` closes the import path and the config-guard closes the exemption path, both intentionally. The one package that carried a committed shim was converted to `prepare` alongside this fix; a new one would be a third convention for a solved problem.
- **Pair every advisory CI step with an artifact assertion.** `continue-on-error` on a step makes _every_ failure of that step advisory, including the ones that mean the tool never ran. Assert that the run produced its output artifact in a separate, non-advisory step.
- **Reproduce install-order bugs only in a fresh clone.** `git clone --no-hardlinks` plus `pnpm install --frozen-lockfile` is the only faithful reproduction; a local `rm` of the shim is repaired by the next workspace command and proves nothing.
- **Verification that closed this:** fresh clone + frozen install creates `.bin/stryker` (absent before the fix); fresh clone + build + `turbo mutation --filter=./packages/arethetypeswrong/cli` → 140 killed, 0 survived, score 100, 27/27 tasks, exit 0. Root `pnpm check` exits 0 at 266/266 + 2/2 tasks.

## Related Issues

- [attw CLI entrypoints: flags dropped and empty-array override](../logic-errors/attw-cli-entrypoints-flags-dropped-and-empty-array-override.md) — the same doctrine from the other side: a green-but-unrun gate is non-evidence. Different mechanism, same class of false green.
- [turbo cache requires a complete input hash](../tooling-decisions/turbo-cache-requires-complete-input-hash.md) — every hole in a gate's key is a way for it to pass without running; also names `prepare` as a binary-swapping surface.
- [comment-checker hook silently bypasses on patch-mode edit](../integration-issues/comment-checker-hook-silently-bypasses-on-patch-mode-edit.md) — a skip indistinguishable from a pass, the shape the advisory mutation step had.
- [tsdown private dependency bare import in dist](./tsdown-private-dependency-bare-import-dist.md) — adjacent family: a manifest field pointing into build output that only resolves where the build already ran.
- Prior art in this repo: commit `90636017115`, `fix(arethetypeswrong): link attw through a committed bin shim` — the identical bug in `packages/arethetypeswrong/cli`, fixed there with the committed-shim pattern. That shim has since been deleted and the package moved to `prepare`.
- [a lifecycle build that runs during install must resolve its compiler by module resolution, never through PATH](./install-time-tool-resolution-must-not-use-path.md) — the tool-_location_ axis of the same lifecycle window this doc opens: `prepare` must exist, and what it runs must not be found through `PATH`.
