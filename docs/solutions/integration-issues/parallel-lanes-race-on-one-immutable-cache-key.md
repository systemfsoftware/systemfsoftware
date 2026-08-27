---
title: Parallel CI lanes sharing one immutable cache key race and the faster lane's partial save wins forever
date: "2026-08-27"
category: integration-issues
problem_type: integration_issue
component: ci
symptoms:
  - "Every lint, lint:tsgo, and test task misses on every CI run while every build task hits with hashes identical to main's hits"
  - "The gate runs ~14 minutes cold on a tree whose task set ran ~17 seconds warm on main the same hour"
  - "The gate job's cache post step never saves; the log shows a sibling lane saved the same key minutes earlier"
  - "turbo query affectedTasks(base, head) between the cold run's base and head returns zero tasks"
root_cause: race_condition
resolution_type: config_change
severity: high
related_components:
  - .github/workflows/reusable-checks.yml
  - .github/workflows/reusable-contract.yml
tags:
  - actions-cache
  - turbo
  - ci
  - cache-key
  - lost-write
---

# Parallel CI lanes sharing one immutable cache key race and the faster lane's partial save wins forever

## Problem

Splitting CI into two parallel lanes that run different task subsets broke the turbo cache in a way that looks like a turbo hashing bug and is not. After PR #270 split the gate into a container-free checks lane and a contract lane, every non-build task missed on every run while all builds hit. Task hashes were provably stable: the same hash hit on main and missed on the branch in the same hour, and affected graph queries between base and head returned zero tasks. The loss was on the save side.

## Mechanism

1. **actions/cache keys are write-once.** The first `Cache saved with key` under a key wins; every later save under the same key is silently skipped, not merged.
2. **The two lanes saved the same primary key.** Both lanes restored `.turbo/cache` and wrote it back under `turbo-<os>-<sha>` — one key per commit, shared by both lanes.
3. **The lanes have disjoint runtimes and non-equivalent write sets.** The contract lane (~4 min, only build dependencies because `test:contract` is `cache: false`) finished ~10 minutes before the checks lane (~14 min, all lint/test/typecheck entries). The fast lane claimed the shared key; the slow lane's save was skipped.
4. **The restore chain then reproduces the partial snapshot.** Prefix restore returns the newest entry, which is always the contract lane's builds-only save. Lint/test entries the gate produced never entered any cache entry — cold on every run, forever, while builds stayed warm.

$$P(\text{gate's save survives}) = 0 \quad \text{when} \quad T_{\text{contract}} < T_{\text{gate}} \ \text{always}$$

The gate's wall time degraded from ~17 s (warm replay) to ~14 min (every lint and test re-executed, plus a masked 600 s test timeout surfacing — see below).

## Architectural Invariants

**One immutable cache key ↔ one equivalence class of write sets.** Concurrent writers may share a key only when every writer's artifact set is restorable as a full substitute for every other's (identical task sets, identical inputs). Writers with different task subsets must own disjoint key namespaces.

```
# wrong: two lanes, one key — the faster partial write defines the cache
lane A (subset S_A): key = K
lane B (subset S_B ⊃ S_A): key = K        # B's save silently dropped

# right: one key namespace per equivalence class of write sets
lane A: key = prefix-A-<commit>
lane B: key = prefix-B-<commit>
# cross-warming only through ordered prefix restore, never through shared primaries
```

A restored-but-smaller artifact set is never *poison* — turbo entries are hash-keyed, so a partial snapshot yields hits for what it contains and misses for the rest. The harm is exclusively the dropped save, so fallback restore chains across lane prefixes are safe and desirable.

## Verification

The fix is observable in the next CI run's logs, all four lines required:

- checks lane: `Cache saved with key: turbo-<os>-checks-<sha>`
- contract lane: `Cache saved with key: turbo-<os>-contract-<sha>` (two distinct saves in one run — pre-fix only one could ever succeed)
- second push of the same branch: `Cache hit occurred on the primary key` on each lane's own prefix
- lint tasks report cache hits on the second push of an unchanged tree

## Prevention

Code smells that reproduce this class:

- Two `actions/cache` steps with identical `key:` anywhere in one workflow's job graph — grep every reusable workflow for duplicated key templates before adding a lane.
- A cache-path directory written by jobs whose task sets differ, keyed only by commit identity (sha, lockfile hash) with no lane dimension.
- Treating "first save wins" as benign because saves are "the same data" — equivalence must hold of the write *sets*, not the intent.

## Secondary lesson: a permanently warm cache masks hanging tests

The cold run surfaced `omp-claude-compat`'s generated schema-refutations suite timing out at the runner's 600 s test deadline — a defect that had been hidden on main because the test's cache entry replayed green indefinitely. Cache warmth extends the life of latent hangs; when a cold run appears, audit every task that executed for the first time in a while, not just the cache mechanics. (PR #271 deletes that suite.)

## Sibling failure modes

This is the save-side complement of the hash-side family: turbo-cache-never-warm (keys unstable between runs — env variance, ignore-file leaks) and turbo-cache-requires-complete-input-hash (hash completeness). Diagnosis order for a cold turbo gate: first prove hash stability (dry-run hash diff between base and head; affected graph query), then audit the save side (whose `Cache saved with key` line actually appears).
