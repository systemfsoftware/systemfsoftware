---
title: A turbo cache that is never warm has its causes in the key, not the storage
date: "2026-08-08"
category: performance-issues
module: systemfsoftware
problem_type: performance_issue
component: tooling
symptoms:
  - "`pnpm check` reports `Cached: 0 cached, 89 total` on two back-to-back runs with no edits between them"
  - "The full gate costs roughly 3m40s to 12min on every invocation, warm tree or not"
  - "The same task hashes differently depending on whether an agent, a human, or CI invoked it"
  - "Running one shared package's lint changes an unrelated package's lint hash with no source edit"
root_cause: config_error
resolution_type: config_change
severity: high
related_components:
  - turbo.json
  - package.json
  - .gitignore
  - packages/oxlint-config
  - packages/tsconfig
tags:
  - turbo
  - build-cache
  - cache-invalidation
  - input-hash
  - monorepo
  - pnpm
  - dprint
---

# A turbo cache that is never warm has its causes in the key, not the storage

## Problem

The repo's single verification gate, `pnpm check`, reported `Cached: 0 cached, 89 total` on **every** run — including two consecutive runs with zero edits between them — and cost roughly 12 minutes each time. A healthy turbo monorepo hits cache on the second run. This one was permanently cold, and not from one bug: **three independent causes** were stacked in the lint and typecheck cache keys, with a fourth that briefly looked like a cause and was not.

## Symptoms

- `pnpm check` printed `Cached: 0 cached, 89 total` with zero hits on identical consecutive runs.
- Wall time per run: roughly 3m40s to 12min.
- The tell that this was not merely a slow build: zero hits across 89 tasks on an unchanged tree. A slow build still writes cache entries and warms. `0 cached` every run means every task's **key** moved between runs — turbo was re-running 89 tasks it had just run rather than restoring their verdicts.
- Task hashes differed by entry point: an agent run, a human run, and a CI run of the same command produced three different hashes.

## What Didn't Work

Three dead ends, all worth recording — because one of them _appeared to falsify the correct hypothesis_.

1. **"The cache directory is missing."** `node_modules/.cache/turbo` did not exist, which looked like the answer. It was not: turbo 2.x writes to `.turbo/cache`, which held 65,745 entries at 3.5 GB. The cache was healthy. Every task was missing its _key_, not its storage.

2. **"Something is rewriting the config files between runs."** A 30-second persistence probe — write a marker, `stat` the file every 5s — showed the shared config files stable, with no watcher running. The reverts observed earlier came from concurrent subagents editing the tree, not from a daemon. Ruling this out mattered: it forced the investigation onto turbo's own key composition.

3. **A double-run experiment appeared to falsify the input-invalidation hypothesis.** Runs B and C came back `FULL TURBO` (4.6s against 4m53s), which looked like proof that the inputs were not self-invalidating. The experiment was **invalid**. It ran with `--filter @systemfsoftware/effect-memfs`, which pruned the task graph to that package and its dependencies — and the pruning excluded `oxlint-config`'s own `lint` task, the very task whose run rewrites the volatile files that every dependent's lint key hashes. The filtered run never ran the invalidating task, so nothing rewrote the state, so the dependents' keys stayed still and the next run hit. Re-running unfiltered reproduced the miss immediately.

   **The reusable lesson:** a `--filter`-narrowed experiment cannot falsify a _cross-package_ invalidation hypothesis, because the filter removes the task that does the invalidating. To test whether task A's state invalidates tasks B through N, the run must include A. Scoping A out makes the mechanism unobservable and the negative result meaningless.

## Solution

Three fixes, landed together in `f3c9982155`, each removing one independent source of key churn. "Before" excerpts come from the commit diff; "after" excerpts are the live tree. That commit sits on the unmerged branch `feat/oxlint-plugin-tree-lint-baseline`, so the SHA may be rewritten by a squash or rebase merge — search the subject line rather than the hash if it does not resolve.

### Fix 1 — stop the key from varying by entry point

turbo's task hash includes the task's CLI args and the values of env vars declared in the task's `env` list. The root `lint` script passed `AGENT`-dependent oxlint args, and `AGENT` was declared in the lint task's `env`, so identical work hashed three ways:

| Invocation                             | Task hash          |
| -------------------------------------- | ------------------ |
| `pnpm lint` (`AGENT` set)              | `acae4b2d37410ba0` |
| `pnpm lint` (`AGENT` unset)            | different          |
| `pnpm check:ci` (`-- --format=github`) | `e5a3cef10baff315` |

Agent runs, human runs, and CI could never share an entry.

Before — root `lint` script:

```json
"lint": "pnpm format:check && turbo --concurrency=${TURBO_CONCURRENCY:-50%} lint ${AGENT:+-- --format=unix}",
```

After — `package.json:10`:

```json
"lint": "pnpm format:check && turbo --concurrency=${TURBO_CONCURRENCY:-50%} lint",
```

Before — lint `env` in `turbo.json`: `["NODE_ENV", "AGENT", "GITHUB_ACTIONS"]`. After — `turbo.json:123-126`, with `AGENT` removed:

```json
"env": [
  "NODE_ENV",
  "GITHUB_ACTIONS"
],
```

Proof: after the fix, `AGENT=1` and `AGENT` unset both yield lint hash `42bfc1139ca51517`, verified with `turbo lint --filter <pkg> --dry=json` under both env states.

Two qualifications, both verified against the tree. First, `lint` and `lint:ci` still differ — `lint:ci` passes `-- --format=github` (`package.json:11`) — so the human-versus-CI partition survives deliberately, keyed on `GITHUB_ACTIONS` (`turbo.json:125`). Only the agent-versus-human partition, the one poisoning the cache, is gone. Second, individual package lint scripts still branch on `AGENT`, for example `packages/effect-cell-types/package.json:43`:

```json
"lint": "oxlint . ${AGENT:+--format=unix --quiet}",
```

Dropping `AGENT` from the key despite that branch is safe, because `--format=unix --quiet` changes output presentation only, never the pass/fail verdict. The `AGENT`-dependent command form cannot produce a different cached answer, so pinning it into the key bought nothing and cost every hit.

### Fix 2 — negate volatile tool state out of shared-config input globs

`turbo.json` listed `$TURBO_ROOT$/packages/oxlint-config/**` and `$TURBO_ROOT$/packages/tsconfig/**` as `inputs` for every package's `lint` and `typecheck`. Those globs are unfiltered, so they swept in turbo's own per-task logs (`packages/oxlint-config/.turbo/turbo-lint.log`) and tsc's incremental state (`tsconfig.tsbuildinfo`, `tsconfig.node.tsbuildinfo`). Running `oxlint-config`'s own lint rewrote those files, invalidating the lint key of all 48 dependents. Every full run rewrote them, so the next run always missed.

After — `turbo.json:111-116`:

```json
"$TURBO_ROOT$/packages/oxlint-config/**",
"!$TURBO_ROOT$/packages/oxlint-config/.turbo/**",
"!$TURBO_ROOT$/packages/oxlint-config/**/*.tsbuildinfo",
"$TURBO_ROOT$/packages/tsconfig/**",
"!$TURBO_ROOT$/packages/tsconfig/.turbo/**",
"!$TURBO_ROOT$/packages/tsconfig/**/*.tsbuildinfo"
```

The same negations went onto `typecheck` (`turbo.json:33-35`).

Proof: running only `oxlint-config`'s own lint flipped `effect-memfs#lint` from `f8072d86ba85f654` to `9264090e4456eb30` with no source edit in between.

### Fix 3 — a failing gate chained in front of turbo caches nothing

An untracked `research/` scratch tree held unformatted files, so `pnpm format:check` (`dprint check`, `package.json:14`) failed on every run. The root script chains it ahead of lint — `"lint": "pnpm format:check && turbo ... lint"` (`package.json:10`) — so lint never reached turbo, and turbo does not cache a failed run. Adding `research` to `.gitignore:22` (matching the `wiki` entry already at `.gitignore:21`) fixed it, because dprint respects gitignore.

## Why This Works

turbo composes a task's cache key from the task **definition** (`inputs`, `env`, `outputs`, `dependsOn`, command string), the task's **CLI args**, and the **resolved hashes** of every file matched by `inputs`, plus the lockfile, root `package.json`, and `globalDependencies`. Each fix removes one source of movement:

- **Fix 1** removed two contributors whose values varied by entry point while the answer did not. The `${AGENT:+...}` conditional made the executed command differ between agent and human runs under one task definition, and `AGENT` in `env` made the hash read a variable with no bearing on the verdict. `GITHUB_ACTIONS` stays hashed because human and CI runs _should_ be allowed to differ.
- **Fix 2** removed from the hashed file set a class of files that a normal run _rewrites_. turbo writes per-task logs into each package's `.turbo/`, and tsc writes `*.tsbuildinfo`. Leaving them inside another package's `inputs` glob makes a dependent's key depend on the shared package's own side effects — a self-poisoning key. The negations exclude tool-written state while keeping the authored config (`oxlint.config.ts`, `tsconfig.json`) in the hash, which is the part that should invalidate.
- **Fix 3** was never a key problem. turbo caches successes only, and the chain short-circuited before turbo ran at all, so part of the "cold cache" was simply that nothing ever finished long enough to be cached.

Measured:

- Before: `Cached: 0 cached, 89 total`, 3m40s to 12min.
- After Fix 2 alone: 45 of 89 cached.
- After all three: `Cached: 89 cached, 89 total`, `>>> FULL TURBO`, 3.85s.

## Prevention

- **Never glob a package directory as a turbo `input` without negating tool-written state.** Any `$TURBO_ROOT$/packages/<name>/**` input needs siblings `!.../.turbo/**`, `!.../**/*.tsbuildinfo`, and a negation for the package's build output. A package's own artifacts living inside a directory that other packages glob is a cache-poisoning pattern. _Mechanisable:_ a JSON check over `turbo.json` asserting every `packages/**` input entry carries the matching negations.
- **Keep CLI args identical across entry points that must share a cache; split entry points on an env var instead.** Args and declared `env` vars are part of the key, so varying them per entry point partitions the cache into disjoint sets. Where one entry point genuinely must differ, key it on a variable every run sets deterministically (`GITHUB_ACTIONS`), never on one that only some runs happen to have set (`AGENT`). _Mechanisable:_ assert root `lint*` scripts differ in args only where an `env`-declared variable also differs.
- **Remember that an `&&`-chained gate in front of a turbo task hides turbo entirely.** A permanently-red early step reads exactly like a permanently-cold cache. Prefer running the gate inside turbo as its own task (the repo already has `//#format:check`, `turbo.json:148`) so the failure is visible and the rest of the graph still runs.
- **Prove the cache is the problem before rebuilding anything.** Confirm the real cache location for the turbo major version in use, confirm key churn with `turbo <task> --dry=json` across two runs, and never use a scoped `--filter` to test a cross-package invalidation — the filter removes the invalidating task and hands back a false negative.

## Related Issues

- [`../tooling-decisions/turbo-cache-requires-complete-input-hash.md`](../tooling-decisions/turbo-cache-requires-complete-input-hash.md) — the same `turbo.json` cache-key surface in the **opposite failure direction**, and the direct antecedent of this bug. That doc covers an _incomplete_ key producing false-green hits while turning the `typecheck` cache on; this one covers an _over-broad and volatile_ key producing permanent misses. They are two clauses of one doctrine: the key must move exactly when the answer can change, and never otherwise. Note that its worked examples are now stale against the tree — it shows the lint `env` as `[NODE_ENV, AGENT, GITHUB_ACTIONS]` (now `[NODE_ENV, GITHUB_ACTIONS]`) and shows the `oxlint-config` and `tsconfig` input globs without the negations added here.
- [`../build-errors/turbo-build-cycle-from-self-hosted-devdeps.md`](../build-errors/turbo-build-cycle-from-self-hosted-devdeps.md) — the same root `turbo.json` surface on the graph side (a `dependsOn` cycle) rather than the key side. Reinforces that turbo task definitions are a correctness surface for the gate, not just a performance knob.
- Fix commit: `f3c9982155` — `build(global): make the lint cache actually hit`.
