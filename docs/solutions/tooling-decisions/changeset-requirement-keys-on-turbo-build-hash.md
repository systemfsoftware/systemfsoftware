---
title: Changeset Requirement Keys on the Turbo Build Hash
date: "2026-08-16"
module: systemfsoftware
problem_type: tooling_decision
component: tooling
severity: high
applies_when:
  - Monorepo release gate deciding which packages need a changeset intent per PR
  - File-touch or manifest-field heuristics approximating "does this reach a consumer"
  - A build graph engine (turbo) already computes per-package cache identities
root_cause: design_gap
resolution_type: design_change
related_components:
  - changeset gate (check-changeset)
  - turbo build graph
  - pnpm-native release planning
tags:
  - turbo
  - changesets
  - release-gate
  - determinism
  - monorepo
---

# Changeset Requirement Keys on the Turbo Build Hash

## Problem

The gate that decides whether a PR must carry a `.changeset/` intent approximated consumer reach with three hand-rolled mechanisms: a private glob engine over the build task's declared input globs, a manifest-field consumer-reach contract with a blind-field allowlist, and a `git ls-files` membership heuristic. Each was a re-implementation of a verdict the build engine already computes exactly: the per-package build-task hash. The approximations were provably wrong — the engine hashes auto-included config files no input glob names, hashes any manifest byte the blind-field list exempts, and enumerates members by workspace globs the ls-files heuristic cannot see, so nested-workspace test fixtures counted as releasable packages while genuinely re-hashed dependents went unnamed.

The deeper defect is structural: a release gate that re-derives reach from file paths owns a second, driftier copy of the build system's input model. Every input-model change in the engine silently falsifies the gate.

## Mechanism

Turbo's `build` task hash, read from a dry-run plan, is a content-addressed identity over exactly the inputs that decide whether the shipped `dist/` rebuilds: input files, the package manifest, the task definition, auto-included configs, and — via dependency-task folding — the hashes of every `^build` dependency. Two properties make it the correct release predicate:

- **Determinism**: identical trees produce identical per-task hashes, regardless of checkout path, temp extraction, or environment (pass-through env values fold into the global cache-inputs block, never into a per-task hash — measured by varying the cache-home variable across runs: the global fingerprint moved, zero task hashes moved).
- **Totality over reach**: anything that plausibly reaches the artifact — a source edit, a manifest byte, a build-command edit, an upstream dependency's own re-hash — changes the hash. Things that do not reach it — a README, a lockfile-only resolution change, a root-manifest or workspace-config edit that no task input reads — leave it untouched.

The gate therefore compares two dry-run plans: one over the PR's pinned base commit (materialized as a throwaway worktree, removed unconditionally), one over the head. A publishable package (head manifest not private) whose hash differs demands an intent; unchanged demands nothing. A `none` intent is the explicit decline for a hash change that ships nothing — devDependency-only and script-only bumps are its canonical class.

The executor that computes the verdict is itself pinned: the lockfile-resolved build binary, verified before any run against the lockfile's declared version and the installed manifest (`assertTurboPin`). A gate that fetches its own engine from a registry at verdict time has a supply chain its verdict cannot see.

## Architectural Invariants

**The release predicate is the cache predicate.** Whatever identity the build engine uses to decide "this artifact would rebuild" is the same identity the release gate must use to decide "this release record is owed." Two predicates over the same question drift; one predicate cannot.

```
releaseOwed(pkg, base, head) := publishable(pkg, head) ∧ buildHash(pkg, base) ≠ buildHash(pkg, head)
```

**Releasability is the head manifest's private bit, nothing else.** A package whose head manifest declares `private: true` is hashed like every other task but can never demand an intent — the private bit is the boundary between workspace-internal tooling and the published surface, and it is read from the head manifest so the PR's own publishing decisions govern. The corollary is deliberate: un-privating a package is itself a manifest edit that re-hashes it, so the newly publishable package demands its first intent on the PR that publishes it.

**Never re-implement an engine's input model.** Where an engine computes a total, content-addressed verdict (cache keys, type identities, plan hashes), a gate that approximates it from file lists is a defect in waiting: the approximation is right only until the engine's model changes, and nothing observes the divergence.

**The verdict's executor is part of the verdict.** A deterministic verdict computed by an unpinned binary is deterministic only by luck. Pin the executor to the same lockfile the build uses and assert the pin from source bytes at verdict time (recompute, never trust a self-report).

**Judge against a pinned point in time.** Comparing against a moving ref (the base branch tip resolved at check time) lets unrelated merges between event and verdict change the verdict. Pin the base to the event's recorded commit; a verdict must measure the PR, not the world.

## Observed Hash Semantics (turbo 2.10.5, 40-package workspace)

| Change class                                                               | Hash consequence                                                    | Intent demand                                                                                                                                                                     |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| package with `private: true` in its head manifest                          | hashed like any task, filtered before any demand                    | never — the private bit is the releasability boundary                                                                                                                             |
| package un-privated in the PR                                              | manifest edit re-hashes; releasable at head                         | yes — its first release record                                                                                                                                                    |
| source file under a package                                                | own hash + every dependent re-hashes                                | one intent per re-hashed package                                                                                                                                                  |
| any manifest byte (devDeps, scripts, descriptions)                         | own hash changes                                                    | yes                                                                                                                                                                               |
| build script removed                                                       | task persists (`NONEXISTENT` command), manifest re-hashes           | yes                                                                                                                                                                               |
| new package                                                                | absent at base → counts as changed                                  | yes                                                                                                                                                                               |
| deleted package                                                            | absent at head → skipped                                            | no (removal is a source-control decision; the release tooling cannot consume an intent naming a package outside the workspace)                                                    |
| README / non-input file                                                    | unchanged                                                           | no                                                                                                                                                                                |
| lockfile-only, root manifest, workspace-config (incl. catalog value flips) | zero tasks re-hash                                                  | no — the known owned gap; catalog and `overrides` resolutions are reviewed in the release pass, because `catalog:` specifiers are identical bytes however the catalog value moves |
| shared config package member edit                                          | all 40 re-hash (every package's build folds the shared task)        | workspace-wide sweep                                                                                                                                                              |
| configured global dependency script, or the engine's own task config       | all 40 re-hash                                                      | workspace-wide sweep                                                                                                                                                              |
| file inside a nested-workspace fixture (a test-resources package tree)     | all 40 re-hash via the internal-dependency global input             | workspace-wide sweep — fixtures are not members and never demand under their own names, but their trees feed the global input                                                     |
| dry-run `inputs` display                                                   | not the whole hash — files outside the displayed list still move it | follow the hash, never a file list                                                                                                                                                |

## Failure Modes Prevented

1. **Heuristic falsification** — glob and blind-field models silently diverging from the engine's input set (observed: auto-included configs, manifest bytes).
2. **Fixture false positives** — nested test-workspace manifests demanding intents under their own names (membership now comes from the engine's enumeration).
3. **Base drift** — a verdict measuring base-branch motion between event and check instead of the PR (base pinned to the event's commit).
4. **Executor substitution** — an ephemeral, registry-fetched engine binary deciding releases (executor pinned to the lockfile install and asserted from its bytes).
5. **Silent pass on breakage** — any failure to compute (unresolvable base, missing install, non-JSON plan, task without a hash) exits non-zero: a gate that cannot judge must not pass.

## Verification Patterns

- **Turbo-free selftest**: the verdict function consumes fixture hash matrices; the mechanism rows pin parser behavior (non-JSON fails, hashless task fails) and the pin assertion (mismatched install fails, matching passes). No subprocess, no write.
- **Red/green matrix on a disposable worktree**: per-case reset to a baked baseline, one edit per case, expected exit recorded — including the deliberate flips (manifest-only edits now demand; fixture-edit and shared-config sweeps demand workspace-wide).
- **Pin red case**: tamper the installed engine manifest's version in a copy; the selftest must fail with the install instruction.
- Judge the gate's own PR first: a change touching only gate, docs, and CI wiring must hash-clean and demand nothing — the predicate applied to itself.

## Related

- `docs/plans/2026-08-16-002-refactor-changeset-turbo-hash-gate-plan.md`
- `docs/solutions/build-errors/turbo-verdicts-under-stale-cache-and-strict-env.md`
