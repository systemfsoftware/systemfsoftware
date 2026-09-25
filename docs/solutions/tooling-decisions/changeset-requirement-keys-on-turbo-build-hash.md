---
title: Changeset requirement keys on the turbo build hash
date: "2026-08-16"
module: systemfsoftware
problem_type: tooling_decision
component: tooling
severity: high
applies_when:
  - Monorepo release gate deciding which packages need a changeset intent per PR
  - File-touch or manifest-field heuristics approximating "does this reach a consumer"
  - A build graph engine (turbo) already computes per-package cache identities
  - Changeset Check CI job fails naming a package whose sources the diff never touched
  - A changeset already names the directly-edited package but the gate rejects the PR
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
  - build-hash
  - transitive-dependents
---

# Changeset requirement keys on the turbo build hash

## The Doctrine

The gate that decides whether a PR must carry a `.changeset/` intent should key on exactly what the build engine uses to decide "this artifact would rebuild": the per-package turbo `#build` task hash. Two dry-run plans — one over the PR's pinned base commit, one over the head — answer the release question:

> A publishable package (head manifest not private) whose hash differs demands an intent; unchanged demands nothing.

The turbo build hash is a content-addressed identity over exactly the inputs that decide whether shipped artifacts rebuild: input files, the package manifest, the task definition, auto-included configs, and — via dependency-task folding — the hashes of every `^build` dependency. The gate therefore consumes fixture hash matrices, not file globs or hand-rolled heuristics.

## Why This Works

**Totality over reach:** anything that plausibly reaches the artifact — a source edit, a manifest byte, a build-command edit, an upstream dependency's own re-hash — changes the hash. Things that do not reach it — a README, a lockfile-only resolution change, a root-manifest or workspace-config edit that no task input reads — leave it untouched.

**Transitive intent requirement:** turbo folds dependency build hashes into the dependent's task hash. A manifest edit that moves one package's hash also moves the `#build` hash of every publishable package that depends on it. The gate therefore demands a changeset naming **every** publishable package whose hash moved — including dependents whose own sources are untouched. For a devDependency-only change the directly-edited package earns `none`, and a transitively-hashed dependent whose own sources are untouched also earns `none` — it releases nothing.

**Releasability is the head manifest's private bit, nothing else.** A package whose head manifest declares `private: true` is hashed like every other task but can never demand an intent — the private bit is the boundary between workspace-internal tooling and the published surface.

**Determinism:** identical trees produce identical per-task hashes, regardless of checkout path, temp extraction, or environment. Pass-through env values fold into the global cache-inputs block, never into a per-task hash.

## Failure Prevention

Three failure modes prevented by keying on the build hash instead of file globs or manifest heuristics:

1. **Heuristic falsification:** glob and blind-field models silently diverging from the engine's input set (observed: auto-included configs, manifest bytes).
2. **Fixture false positives:** nested test-workspace manifests demanding intents under their own names (membership now comes from the engine's enumeration).
3. **Base drift:** a verdict measuring base-branch motion between event and check instead of the PR (base pinned to the event's commit).

## Verification Patterns

- **Turbo-free selftest:** the verdict function consumes fixture hash matrices; the mechanism rows pin parser behavior (non-JSON fails, hashless task fails) and the pin assertion (mismatched install fails, matching passes). No subprocess, no write.
- **Red/green matrix on a disposable worktree:** per-case reset to a baked baseline, one edit per case, expected exit recorded — including the deliberate flips (manifest-only edits now demand; fixture-edit and shared-config sweeps demand workspace-wide).
- **Pin red case:** tamper the installed engine manifest's version in a copy; the selftest must fail with the install instruction.
- Judge the gate's own PR first: a change touching only gate, docs, and CI wiring must hash-clean and demand nothing.

## Observed Hash Semantics (turbo 2.10.5, 40-package workspace)

| Change class                                                               | Hash consequence                                             | Intent demand                                                                                                                 |
| -------------------------------------------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| package with `private: true` in its head manifest                          | hashed like any task, filtered before any demand             | never — the private bit is the releasability boundary                                                                         |
| package un-privated in the PR                                              | manifest edit re-hashes; releasable at head                  | yes — its first release record                                                                                                |
| source file under a package                                                | own hash + every dependent re-hashes                         | one intent per re-hashed package                                                                                              |
| any manifest byte (devDeps, scripts, descriptions)                         | own hash changes                                             | yes                                                                                                                           |
| build script removed                                                       | task persists (`NONEXISTENT` command), manifest re-hashes    | yes                                                                                                                           |
| new package                                                                | absent at base → counts as changed                           | yes                                                                                                                           |
| deleted package                                                            | absent at head → skipped                                     | no (removal is a source-control decision)                                                                                     |
| README / non-input file                                                    | unchanged                                                    | no                                                                                                                            |
| lockfile-only, root manifest, workspace-config (incl. catalog value flips) | zero tasks re-hash                                           | no — catalog resolutions are reviewed in the release pass                                                                     |
| shared config package member edit                                          | all 40 re-hash (every package's build folds the shared task) | workspace-wide sweep                                                                                                          |
| configured global dependency script, or the engine's own task config       | all 40 re-hash                                               | workspace-wide sweep                                                                                                          |
| file inside a nested-workspace fixture (a test-resources package tree)     | all 40 re-hash via the internal-dependency global input      | workspace-wide sweep — fixtures are not members and never demand under their own names, but their trees feed the global input |

## Gate Entry Point

The gate's verdict executor is itself pinned: the lockfile-resolved build binary, verified before any run against the lockfile's declared version, the installed manifest, and the engine's own dry-run self-report. A gate that fetches its own engine from a registry at verdict time has a supply chain its verdict cannot see.

The verdict is:

```
releaseOwed(pkg, base, head) := publishable(pkg, head) ∧ buildHash(pkg, base) ≠ buildHash(pkg, head)
```

Run the gate locally before pushing to see exactly which package the verdict is missing:

```bash
pnpm install --frozen-lockfile
deno run --allow-read scripts/guards/check-changeset.ts --selftest
deno run --allow-run=git,"$PWD/node_modules/.bin/turbo" --allow-read --allow-write=/tmp \
  scripts/guards/check-changeset.ts <base-sha>
```

## Prevention

- After any change to a publishable package's manifest or source, run the gate locally before pushing; never assume the directly-edited package is the only one the verdict touches.
- When a change moves a dependency's build hash, expect its publishable dependents to appear in the gate's missing-intent list and add their `none` (or earned) entries preemptively.

## Related

- [Changeset requirement and ledger governance](pnpm-owns-the-changeset-ledger.md)
- [Release notes and published-surface verification](../conventions/a-release-note-claims-the-published-surface.md)
