---
title: A turbo task cache requires a complete input hash
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
  - A task that regenerates an artifact and compares it against a committed copy
  - A shared config package that every dependent hashes into their own task key
  - Investigating zero cache hits on back-to-back runs with no edits between them
root_cause: incomplete_setup
resolution_type: config_change
related_components:
  - turbo.json
  - scripts/tools/patch-tsgo-if-needed.mjs
  - packages/oxlint-plugin/oxlint-config
  - packages/toolchain/tsconfig
  - .gitignore
  - package.json
tags:
  - turbo
  - build-cache
  - cache-invalidation
  - input-hash
  - hermeticity
  - worktrees
  - tsgo
  - monorepo
  - performance-issue
  - cache-miss
  - cache-hit
  - volatile-files
  - toolchain-drift
  - pnpm
  - dprint
---

# A turbo task cache requires a complete input hash

## The Doctrine

A turbo task's cache key is a content address over the inputs that decide whether its verdict (pass/fail) could change. Once caching is enabled, the key becomes a correctness surface: the gate's answer comes from a stored entry rather than a fresh run. The key must move whenever the answer could change.

Three classes of incomplete or volatile keys produce different failure modes, all worse than a slow gate.

1. **Incomplete key — false green (stale pass).** The toolchain version is not part of the task key. If a task regenerates an artifact and compares it against a committed copy, a cached pass can outlive the toolchain that produced it. When tsdown moved from 0.22.9 to 0.22.14, a committed api-extractor report became stale. The `build` and `api:check` tasks were cache hits until an unrelated manifest edit moved the task key. Both re-ran under the new toolchain; the d.ts representation changed; api-extractor's byte-comparison against the stale report failed. This is the worst failure mode: the cache behaves perfectly, forever, with the wrong answer. Invisible until the key moves for an unrelated reason.

2. **Over-broad or volatile key — permanent miss.** A task key that includes generated output, volatile tool state, or environment variables that do not affect the answer moves on every run. The cache can never hit. Symptoms: zero cached tasks on back-to-back runs with zero edits, or all tasks of one kind missing while others hit. The permanent miss costs both cache hits and diagnostic clarity — the narrative of "cache is broken" hides the real cause: the key's definition is wrong.

3. **Entry-point variance in the key — misses when answer is unchanged.** If a task's executed command differs between entry points (agent run vs human run vs CI) but the key is keyed on variables that capture that, the cache is correct to miss. This is a true miss, not a false one. The distinction matters for prevention: keys should not include variables whose change does not change the answer.

## Guidance

**Enumerate everything that belongs in the task's key.** A turbo task key hashes the task definition (`inputs`, `env`, `outputs`, `dependsOn`, command), the package's files, the lockfile, root `package.json`, and `globalDependencies`. The membership rule is one sentence: anything whose change can change the task's verdict. Four classes:

1. **Files the task reads:** Source, tsconfigs, config files, and shared config packages. Without listing a shared tsconfig preset in `inputs`, a change to it would not move the key. `$TURBO_DEFAULT$` covers standard package globs; explicit entries cover everything else.

2. **Environment variables that shape the executed command:** The script string is constant — turbo hashes it as written. But if the shell expansion reads `AGENT` or `OXLINT_FORMAT`, the command actually executed differs when those variables are set. If a task's command embeds shell conditionals on environment variables, either pin those variables in `env` (the hash moves when they flip) or remove the conditional — never leave the executed command free to vary under a stable hash.

3. **Tool binaries selected by scripts:** A script may decide which compiler binary answers a task. Reach the script through `globalDependencies`, where `patch-tsgo-if-needed.mjs` can hash alongside the task that uses it.

4. **The task definition itself:** `inputs`, `env`, `outputs`, `dependsOn`, and the command are all hashed. When you edit the definition the key changes.

**Enable the cache and close its holes in the same commit.** Do not land a commit that turns the cache on with a hole you already know about. Every hit stored or restored in that window is a verdict produced under an incomplete key.

**Keep machine-local artifacts out of the outputs.** Turborepo detects git worktrees and redirects the cache to the main worktree's `.turbo/cache`, shared across every linked worktree. A `.tsbuildinfo` embeds absolute paths. Declaring it an output would let a build state from one worktree be restored into another — cross-contamination of build state.

**Prove completeness with a four-step probe that mutates uniquely every round.** Run once to populate; run again with no changes (expect HIT); edit a real source file and run (require MISS); revert and run (expect HIT). The unique-mutation requirement is load-bearing. An earlier version appended the same newline on every round, so the "edited" state had an identical input hash and matched a cache entry from an earlier round — the probe reported HIT and concluded turbo's invalidation was broken. A cache-invalidation test must mutate uniquely on every round, or it tests the cache's memory of the previous round rather than its sensitivity to source.

**Turn on a cache when:** the task is expensive, deterministic, its inputs are enumerable, and its outputs are either absent or machine-independent.

**Do not widen a key with:**

- Values that change every run and change no answer. Those belong in `globalPassThroughEnv`.
- Files the task never reads. Every added input makes hashing more expensive.
- Tasks cheaper to run than to hash and restore.

## Failure Prevention

**Never glob a package directory as a turbo `input`; list its consumable surface instead.** `$TURBO_ROOT$/packages/<name>/**` cannot be made safe by negation. An explicit glob ignores `.gitignore` — only `$TURBO_DEFAULT$` respects it. Every future `coverage/`, `dist/`, `reports/`, or `.stryker-tmp/` silently re-enters the key. The negation list has to be extended again; this repo paid twice on the same glob, two days apart. Name the surface: `src/**` plus `package.json` for a source-exporting package; the JSON config files for a config-only package.

**Use `turbo run <task> --dry=json` to audit what a task hashes.** The resolved input map is readable in one second without running the task. Worth checking before believing any negation list.

**Fix the key before symptoms hide the cause.**

- Fix 1: Remove `AGENT` from the `lint` task's `env` — it makes the hash vary without changing the answer.
- Fix 2: An explicit `inputs` glob for the oxlint-config package swept in `.turbo/` logs and `*.tsbuildinfo` files. Running oxlint-config's own lint rewrote those files, invalidating all 48 dependents. A blacklist approach failed when `coverage/` arrived two days later.
- Fix 4: Invert to an allowlist — list the consumable surface, not the whole directory.
- Fix 3: Never chain a failing gate in front of turbo with `&&`. `pnpm format:check && turbo ... lint` never reaches turbo if format fails, so nothing caches.
- Fix 5: Subtract a task before grooming its globs. A `//#format:check` task was `"cache": false` and hashed 2205 files for a command that used 1700. It was deleted; `check:ci` runs `pnpm format:check` outside turbo.
- Fix 6: Pin volatile inputs, but a pin does not make an uncacheable task cacheable. `test:contract` images are pinned to the manifest-list digest, but the container runs `npm install` with no lockfile, pulling from the live registry. Still `"cache": false` by design.

Measured effect:

- Before all fixes: `Cached: 0 cached, 89 total`, 3m40s to 12min.
- After Fix 2 alone: 45 of 89 cached.
- After Fixes 1-3: `FULL TURBO`, 3.85s.
- After Fix 4: `260 cached, 263 total`, `lint` at 45 hits / 0 misses.
- After Fixes 5-6: `260 cached, 262 total`, 207-238s per run.

## Why This Matters

The failure mode of an incomplete cache key is a false-green gate — the opposite direction from slowness. Without a cache, an incomplete understanding costs time; a stale conclusion forces a rebuild. With a cache, the same incompleteness costs correctness: a stale verdict is _restored_ as the gate's answer. Every hole in the key is a way for the gate to pass without ever having run the thing it was built to run. A false green is strictly worse than slow: a slow gate still fails when the code is wrong; a false-green gate passes silently, and the error ships past the one checkpoint designed to catch it.

The over-broad or volatile key is its inverse: the gate is slow not because work is expensive, but because the cache is permanently cold. The diagnostic signal is clear — zero hits on back-to-back runs — but the cause is wrong: the key's definition is the problem, not the cache itself.

The toolchain outside the key is the insidious failure mode: no slowness signal, no obvious failure. The diagnosis only appears when the key moves for an unrelated reason. Until then, the cache delivers the wrong answer with perfect confidence.

The direction matters because it inverts the risk calculus. "Turn on the cache" reads as a performance improvement, reversible if it misbehaves. A cache whose key has a hole does not misbehave; it behaves perfectly, forever, with the wrong answer.

## Related

- [One CI variable read two ways gave agent runs the thousand-draw forge path](../logic-errors/agent-outranks-ci-run-depth.md) — the other key-completeness lesson on the environment side.
- [Changeset requirement keys on the turbo build hash](changeset-requirement-keys-on-turbo-build-hash.md) — how turbo build hashes fold through the monorepo for release decisions.
- [Centralized Dependency Management with pnpm Catalogs](pnpm-catalogs-for-monorepo-dependency-management.md) — the pnpm context the cache runs inside.
- PR #77 — the change that landed this decision.
- Commit `f3c9982155` (`build(global): make the lint cache actually hit`) — the permanent-miss fixes.
- Turborepo configuration reference, "Git Worktree Cache Sharing": <https://turborepo.dev/docs/reference/configuration>
- Bazel, "Hermeticity": <https://bazel.build/basics/hermeticity>
