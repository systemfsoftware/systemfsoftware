---
title: Changeset gate demands intents for the transitive build-hash closure, and only sees committed state
date: 2026-08-29
last_updated: 2026-09-11
category: build-errors
module: changeset-gate
problem_type: build_error
component: tooling
symptoms:
  - "Changeset Check fails with: This PR changes the turbo build hash of N publishable package(s) that no changeset in it names"
  - "The named package's sources are untouched by the diff"
  - "The gate keeps reporting the same missing intents after the intent files are written to .changeset/ and uncommitted"
root_cause: missing_workflow_step
resolution_type: documentation_update
severity: medium
tags: [changeset, turbo, build-hash, transitive-closure, intent-set, committed-state, ci-gate]
---

# Changeset gate demands intents for the transitive build-hash closure, and only sees committed state

## Problem

The changeset gate (`check-changeset.ts`, REPO-R2) fails a PR whose changed packages lack intent files, where "changed" means the per-package turbo `#build` task hash differs between the pinned base commit and HEAD. Two boundary conditions produce failures that look false:

1. A dependent package whose own sources are untouched is still demanded, because its `#build` hash folds the hashes of its dependency tasks.
2. An intent file that exists only in the working tree never reaches the verdict: the gate computes its evidence from git (a throwaway worktree of the head commit), so writing `.changeset/*.md` without committing changes nothing about the verdict.

## Mechanism

1. **Hash closure.** Turbo's `dependsOn: ["^build"]` graph makes each task's hash a function of its inputs _and_ its dependency tasks' hashes. For the re-hash relation $R$ over packages, the gate's demand set is $\text{closure}(D) = D \cup \{p \mid p \xrightarrow{deps^*} d,\ d \in D\}$ — every publishable package transitively downstream of an edited package $D$. A devDependency is still a workspace dependency for `^build`, so a mutation-enrolled package (it dev-depends on the mutation CLI and plugins) re-hashes when the CLI's hash moves, even with zero source change.
2. **Committed-state verdict.** The gate materializes the head commit into a temporary worktree, runs turbo there, and diffs the two hash maps. Its inputs are `$BASE` and `HEAD` — never the index and never the working tree. Evidence written to disk but not committed is invisible; the verdict is a pure function of committed state.

## Architectural Invariants

**Intent-Set Closure:** the intent set of a change is the transitive closure of publishable packages whose build hashes moved — not the set of edited packages. A package in the closure whose sources are untouched earns `none` (it releases nothing); a package with a consumer-observable change earns its real bump.

**Committed-State Verdict:** a gate that computes over git state observes only git state. Any artifact a gate must see is committed _before_ the gate runs; verify-then-commit is the anti-order.

```yaml
# one intent naming the full closure; bumps follow the observable surface
---
"@systemfsoftware/stryker-js": major          # edited, observable surface moved
"@systemfsoftware/stryker-js-cli": major      # edited
"@systemfsoftware/effect-daemon-spec": none   # closure only: dev-depends on the CLI
"@systemfsoftware/hex-schema": none           # closure only
---
```

**Anti-pattern code smell:** running a repo gate against uncommitted artifacts —

```bash
write .changeset/intent.md   # on disk only
run gate                     # stale verdict: reads HEAD, not the working tree
git commit                   # too late to trust the earlier run
```

Grep for the ordering, not the files: any script that writes gate inputs and runs the gate in the same uncommitted turn.

## Verification & Prevention

- Run the gate locally with the pinned base SHA, after committing:

```bash
deno run --allow-run=git,"$PWD/node_modules/.bin/turbo" --allow-read --allow-write=/tmp \
  scripts/guards/check-changeset.ts <base-sha>
```

- The failing verdict names the exact missing packages — treat that list as the closure, not a suggestion.
- The gate's own contract (`verdict`, `livenessViolations` in `check-changeset.ts`) also fails any pending intent naming a package that has left the workspace — sweep dead package names from pending intents in the same change that deletes the package.

## Related Issues

- PR #307 (first recorded occurrence of the closure half).
- `docs/solutions/build-errors/turbo-build-cycle-from-self-hosted-devdeps.md` — the build-graph semantics behind hash propagation.
