---
title: Enabling a turbo task cache requires a complete input hash
date: "2026-08-08"
category: tooling-decisions
module: systemfsoftware
problem_type: tooling_decision
component: tooling
severity: high
applies_when:
  - Flipping a turbo task from uncached to cached
  - A task command whose executed form depends on an environment variable
  - An install or prepare script that can swap a tool binary at a fixed version
  - Declaring outputs for a cached task in a repo with linked git worktrees
  - Writing a probe to prove a cache invalidates on a source change
root_cause: incomplete_setup
resolution_type: config_change
related_components:
  - turbo.json
  - scripts/patch-tsgo-if-needed.mjs
  - packages/oxlint-config
  - packages/tsconfig
tags:
  - turbo
  - build-cache
  - cache-invalidation
  - input-hash
  - hermeticity
  - worktrees
  - tsgo
  - monorepo
---

# Enabling a turbo task cache requires a complete input hash

## Context

This monorepo is a pnpm + Turborepo workspace of Effect-TS libraries: 46 packages as `turbo ls` counts them, typechecked with `@effect/tsgo`, linted with oxlint, tested with Vitest. For the life of the repo, `turbo.json` carried `"typecheck": { "cache": false }` (present since the initial commit, with no recorded reason), so all 45 typecheck tasks rebuilt on every gate run. On a warm tree with zero changes, `turbo typecheck` took 44.7s — every second spent recomputing an answer the run had already produced.

The first candidate fix was `--incremental`. A `.tsbuildinfo` file removes work _inside_ one `tsc` process; it never removes the process itself. Measured on `packages/hex-schema` with a fully warm buildinfo and zero changes, `tsc` still spent 4.0s on startup, tsconfig reads, and program construction before it could consume the incremental data (two runs: 4.17s and 4.05s). Multiplied across 45 packages, 44 of them pay roughly that 4s fixed cost per run just to conclude nothing changed. That per-process fixed cost is exactly what a task cache removes and what a buildinfo cannot. Every timing in this document was measured once, on one developer machine, on a warm tree; the ratios and the direction are the transferable part, not the absolute seconds. The real fix was turbo's task cache — and enabling it turned out to be the beginning of the work, not the end.

Once a cache can answer for a task, the gate's verdict may come from a stored entry instead of a fresh run. That makes the cache key a correctness surface: the key must move whenever the answer could change. Most of the effort went into proving that, and one attempt at the proof was actively wrong. The first version of the invalidation probe appended the same newline on every round, so the "edited" state had an identical input hash each time and matched a cache entry an earlier round had already written. The probe reported a HIT where a MISS was required, and the conclusion drawn from it was that turbo's invalidation was broken — a non-bug that came within one step of being "fixed". A wrong intermediate hypothesis formed in the same stretch (the turbo daemon plus unreliable fsnotify on this repo's virtiofs mount) and was falsified: the daemon was not running at all, and `--no-daemon` changed nothing.

Two real holes surfaced alongside the probe, both on the input side of the key. First, `scripts/patch-tsgo-if-needed.mjs` decides which compiler binary answers `typecheck`, and nothing hashed it. Second, the `lint` task's command embeds a shell conditional on the `AGENT` environment variable, so flipping `AGENT` changed the command actually executed while the task hash stayed still. Both had to be closed in the same change that turned the cache on.

## Guidance

Enabling a cache is a correctness change. Do it in this order.

**Enumerate everything that belongs in the task's key.** A turbo task key is a hash of the task definition (its `inputs`, `env`, `outputs`, `dependsOn`, and command) plus the package's files, the lockfile, the root `package.json`, and the `globalDependencies` entries. The membership rule is one sentence: anything whose change can change the task's verdict. Four classes, each of which produced a real hole here:

1. **Files the task reads.** Source, tsconfigs, config files, and shared config packages. `typecheck` and `lint` both extend presets from `packages/tsconfig`, so both tasks list `"$TURBO_ROOT$/packages/tsconfig/**"` in `inputs` (turbo.json:33, turbo.json:91) — without it, a change to a shared preset would not move the key. `lint` additionally lists `oxlint.config.ts` and `"$TURBO_ROOT$/packages/oxlint-config/**"` (turbo.json:87, turbo.json:90). `$TURBO_DEFAULT$` covers the standard package globs; the explicit entries are for everything else.

2. **Environment variables that shape the executed command.** The package `lint` scripts read `"lint": "oxlint . ${AGENT:+--format=unix --quiet}"` (e.g. packages/effect-cell-types/package.json:43). The script _string_ is constant — turbo hashes it as written — but the command actually executed differs when `AGENT` is set: the shell expansion is invisible to the hash. Flipping `AGENT` changed what ran while the key stayed still. The fix was to pin the variable into the key: `AGENT` and `GITHUB_ACTIONS` are listed in the `lint` task's `env` (turbo.json:98-102), so the hash moves when either flips. Any environment variable your command's shell expansion reads belongs in `env`.

3. **Tool binaries selected by scripts.** `scripts/patch-tsgo-if-needed.mjs` is wired into `prepare` (`"prepare": "concurrently \"husky\" \"node scripts/patch-tsgo-if-needed.mjs\""`, package.json:19), so it runs on every install. It resolves the native tsc path the same way the installed `typescript` package's own exe-path helper does, which its header comment states as the reason it tracks the compiler the toolchain actually runs (lines 9-11, 25-31), compares a sha256 of the binary there against the path `tsgo get-exe-path` reports (lines 33-36), and runs `tsgo patch` when they differ (line 39) — and `tsgo patch`, per the script's own header (lines 2-7), renames whatever sits at the native path into the next free `tsc.original.N` slot and copies its own binary in. So this script decides which compiler binary answers `typecheck`. Turbo's global hash already includes the lockfile (verified via `turbo typecheck --dry=json`: `globalCacheInputs.hashOfExternalDependencies` populated, `rootPackageJsonHash` present), so a TypeScript version bump invalidates; a binary swap at the same version did not. The fix is `"globalDependencies": ["scripts/patch-tsgo-if-needed.mjs"]` (turbo.json:3-5), which puts the script's content into every task's global hash. A script that selects a tool is an input to every task that uses that tool.

4. **The task definition itself.** `inputs`, `env`, `outputs`, `dependsOn`, and the command are all hashed; when you edit the definition the key changes. That is the mechanism the fixes above rely on — the task definition is the only place some inputs can be declared.

**Enable the cache and close its holes in the same commit.** The script went into `globalDependencies` in the same commit that set `"cache": true` on `typecheck` (PR #77). Do not land a commit that turns the cache on with a hole you already know about: every hit stored or restored in that window is a verdict produced under an incomplete key, and the whole point of the change is that cached verdicts be trustworthy.

**Keep machine-local artifacts out of the outputs.** `typecheck` declares `"outputs": []` deliberately (turbo.json:35). Turborepo's configuration reference documents that turbo detects git worktrees and redirects the cache to the main worktree's `.turbo/cache`, shared across every linked worktree, disabled only by setting an explicit `cacheDir`. This repo has 22 linked worktrees and no `cacheDir` key, so that sharing is active. Turbo restores cached artifacts by writing the bytes back without rewriting their contents. A `.tsbuildinfo` embeds absolute paths, so declaring it an output would let a build state describing one worktree be restored into another — paths from one machine layout consumed as another's build input. The cache stores the pass/fail verdict and the logs; the buildinfo stays machine-local. Bazel's hermeticity documentation names absolute paths as a canonical source of non-hermeticity — the same rule from the other direction.

**Prove completeness with a four-step probe that mutates uniquely every round.**

1. Run once to populate the cache.
2. Run again with no changes — expect a HIT.
3. Edit a real source file and run — require a MISS.
4. Revert and run — expect a HIT again.

The unique-mutation requirement is the load-bearing part. The first version of this probe appended the same newline on every round, so the "edited" state had an identical input hash each round and matched a cache entry an earlier round had already written: step 3 reported a HIT, and the probe concluded turbo's invalidation was broken. Once each round mutated uniquely, turbo's reported input hash for the task moved from `7ee037da8b9badb8` to `ed78caf7668741bd` — turbo input hashes, not commit SHAs — and the MISS appeared on cue. A cache-invalidation test must mutate uniquely on every round, or it tests the cache's memory of the previous round rather than its sensitivity to source. The same discipline applies to the check itself: run `turbo typecheck --dry=json` and inspect the task hash and its inputs before trusting any conclusion about what the key covers.

**Be honest about the scope of the win.** This repo has no remote cache — no `TURBO_TOKEN`, no `TURBO_TEAM`, no `remoteCache` key — so CI gets a fresh container every run and this is a local-development win. As part of the same change, the three stryker packages that still ran a plain `tsc --noEmit` were switched to `--incremental` like the other 42, so the buildinfo story is uniform. After the changes, `pnpm check` exits 0 with 246 of 246 tasks successful.

## Why This Matters

The failure mode of an incomplete cache key is a false-green gate, not slowness. Without a cache, an incomplete understanding costs time: the worst a stale conclusion can do is force a rebuild. With a cache, the same incompleteness costs correctness: a stale verdict is _restored_ as the gate's answer. Every hole in the key is a way for the gate to pass without ever having run the thing it was built to run. A false green is strictly worse than slow: a slow gate still fails when the code is wrong; a false-green gate passes silently, and the error ships past the one checkpoint designed to catch it.

The direction matters because it inverts the risk calculus of the change. "Turn on the cache" reads as a performance improvement, and performance improvements are reversible — if one misbehaves, you turn it off. A cache whose key has a hole does not misbehave; it behaves perfectly, forever, with the wrong answer. The 44.7s-to-2.7s win (79/79 FULL TURBO on the warm run) is the reward for closing the holes; the holes themselves are the reason the win had to be earned before it was taken.

The worktree sharing makes the output side a correctness issue too. Twenty-two linked worktrees share one cache. A `.tsbuildinfo` declared as an output would not merely be non-hermetic in the abstract — restored bytes containing one worktree's absolute paths would be consumed as another worktree's build state. That is cross-contamination of build state, not slowness.

And the broken probe shows the failure mode at one remove: a verification instrument less discriminating than the system under test converts correct behavior into an apparent defect. The probe reported a bug that was not there, and the "fix" would have been a regression. Conclusions about cache invalidation are only as trustworthy as the probe's mutations are unique.

## When to Apply

Turn on a task cache when the task is expensive, deterministic, its inputs are enumerable, and its outputs are either absent or machine-independent. The `typecheck` and `lint` tasks here are the shape that fits: pure checkers, no artifacts, and a small, explicit input list.

Do not widen a key with:

- **Values that change every run and change no answer.** Those belong in `globalPassThroughEnv` — passed through to the task but deliberately excluded from the hash. If a variable varies without affecting the verdict, hashing it buys nothing but cache misses.
- **Files the task never reads.** Every added input makes the hash more expensive to compute and invalidates the task on edits that cannot matter.
- **Tasks cheaper to run than to hash and restore.** Hashing walks file contents and restoring writes bytes; below a threshold the cache costs more than the run. Small, fast tasks are better off uncached.

Two corollaries. First, if a task's command embeds shell conditionals on environment variables, either pin those variables in `env` or remove the conditional — never leave the executed command free to vary under a stable hash. Second, keep `outputs` empty unless you can declare machine-independent artifacts; a `.tsbuildinfo` or any path-bearing artifact belongs nowhere near a cache that linked worktrees share.

## Examples

Before PR #77, `typecheck` was uncached and its key did not include the shared tsconfig presets:

```json
"typecheck": {
  "outputLogs": "errors-only",
  "inputs": [
    "$TURBO_DEFAULT$",
    "tsconfig.json",
    "tsconfig.*.json"
  ],
  "outputs": [],
  "dependsOn": [
    "^build"
  ],
  "cache": false
}
```

After PR #77, the cache is on, the shared presets are in the key, and the compiler-selecting script is a global dependency:

```json
"globalDependencies": [
  "scripts/patch-tsgo-if-needed.mjs"
],
"tasks": {
  "typecheck": {
    "outputLogs": "errors-only",
    "inputs": [
      "$TURBO_DEFAULT$",
      "tsconfig.json",
      "tsconfig.*.json",
      "$TURBO_ROOT$/packages/tsconfig/**"
    ],
    "outputs": [],
    "dependsOn": [
      "^build"
    ],
    "cache": true
  }
}
```

The `lint` task's `env` gained the variables its command's shell expansion reads. Before, only `NODE_ENV` was pinned; after, `AGENT` and `GITHUB_ACTIONS` are in the key, and `oxlint.config.ts` plus the shared tsconfig presets joined `inputs`:

```json
"lint": {
  "inputs": [
    "$TURBO_DEFAULT$",
    "oxlint.config.ts",
    "tsconfig.json",
    "tsconfig.*.json",
    "$TURBO_ROOT$/packages/oxlint-config/**",
    "$TURBO_ROOT$/packages/tsconfig/**"
  ],
  "outputs": [],
  "dependsOn": [
    "^build",
    "build"
  ],
  "env": [
    "NODE_ENV",
    "AGENT",
    "GITHUB_ACTIONS"
  ],
  "cache": true
}
```

The package command that made the `env` addition necessary — a constant script string whose executed form depends on `AGENT`:

```json
"lint": "oxlint . ${AGENT:+--format=unix --quiet}"
```

And the probe, as a runnable sequence:

```bash
# 1. run once to populate the cache
turbo typecheck

# 2. run again with no changes — expect a HIT (FULL TURBO)
turbo typecheck

# 3. edit a real source file with a UNIQUE mutation, then run — require a MISS.
#    Each round must mutate differently: appending the same newline every round
#    reproduces the previous round's input hash, and the cache answers HIT.
printf '\n// mutation-round-3\n' >> packages/hex-schema/src/mod.ts
turbo typecheck

# 4. revert the edit and run — expect a HIT
git restore packages/hex-schema/src/mod.ts
turbo typecheck
```

## Related

- [arethetypeswrong core runs the typescript 6 JS bridge, not typescript 7](arethetypeswrong-core-requires-js-typescript-api.md) — the sibling decision about which compiler binary answers `typecheck`. This learning's `globalDependencies` fix guards that same surface against a swap the lockfile cannot see. Overlap scored Low (1/5 dimensions: referenced files only; problem, root cause, solution, and prevention all differ).
- [Centralized Dependency Management with pnpm Catalogs](pnpm-catalogs-for-monorepo-dependency-management.md) — the pnpm monorepo context the cached `typecheck` runs inside. Context only, no overlap.
- PR #77 — the change that landed this decision, in two commits: the shared-config loosening and the turbo cache work.
- Turborepo configuration reference, "Git Worktree Cache Sharing" — the documented behavior behind the empty `outputs` list: <https://turborepo.dev/docs/reference/configuration>
- Bazel, "Hermeticity" — absolute paths and host tooling as canonical sources of non-hermeticity, and the null-sequential-build check: <https://bazel.build/basics/hermeticity>
