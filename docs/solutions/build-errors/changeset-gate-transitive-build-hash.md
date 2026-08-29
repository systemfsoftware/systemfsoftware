---
title: Changeset check requires intent for build-hash moves that propagate to dependents
date: 2026-08-29
category: build-errors
module: changeset-gate
problem_type: build_error
component: tooling
symptoms:
  - "Changeset Check CI job fails with 'This PR changes the turbo build hash of 1 publishable package(s) that no changeset in it names: @systemfsoftware/arethetypeswrong-cli'"
  - "The changeset already names the directly-edited package (@systemfsoftware/arethetypeswrong: none) and still the gate rejects the PR"
root_cause: missing_workflow_step
resolution_type: documentation_update
severity: medium
tags: [changeset, turbo, build-hash, dependents, transitive, arethetypeswrong, ci-gate]
---

# Changeset check requires intent for build-hash moves that propagate to dependents

## Problem

The repo's changeset gate (`scripts/guards/check-changeset.ts`, REPO-R2) keys the intent requirement on each publishable package's turbo `#build` task hash, compared between the PR's pinned base and its head. A manifest edit that moves one package's hash also moves the `#build` hash of every publishable package that depends on it, because turbo folds dependency build hashes into the dependent's task hash. The gate then demands a changeset naming **every** publishable package whose hash moved — including dependents whose own sources are untouched.

PR #307 (declare `@vitest/snapshot` in the arethetypeswrong analysis package) changed `packages/testing/type-testing/arethetypeswrong/analysis/package.json` and added a changeset naming only `@systemfsoftware/arethetypeswrong`. CI's Changeset Check failed; the local gate run reported the missing intent was `@systemfsoftware/arethetypeswrong-cli` — the CLI's `#build` hash moved transitively because it depends on the analysis package.

## Symptoms

- Changeset Check CI job fails even though a changeset exists and names the directly-edited package.
- The gate's error names a package whose sources the diff never touched: "no changeset in it names: @systemfsoftware/arethetypeswrong-cli".

## What Didn't Work

- A changeset naming only the directly-edited package (`@systemfsoftware/arethetypeswrong: none`). The gate still failed: adding the CLI's intent `@systemfsoftware/arethetypeswrong-cli: none` to the same changeset is what cleared it.

## Solution

Name every publishable package whose `#build` hash moved in the changeset, with the bump class each one earns. For a devDependency-only change the directly-edited package earns `none`, and a transitively-hashed dependent whose own sources are untouched also earns `none` — it releases nothing.

```markdown
---
"@systemfsoftware/arethetypeswrong": none
"@systemfsoftware/arethetypeswrong-cli": none
---
```

Before pushing, run the gate locally to see exactly which package the verdict is missing:

```bash
deno run --allow-run=git,"$PWD/node_modules/.bin/turbo" --allow-read --allow-write=/tmp \
  scripts/guards/check-changeset.ts <base-sha>
```

## Why This Works

The gate's verdict is the turbo build-hash difference, and turbo does not hash in isolation: a dependent task's hash includes the hashes of its dependency tasks (turbo's `dependsOn ^build` graph). So the intent requirement deliberately covers the whole set of publishable packages a change re-hashes, transitive moves included. The changeset is the package-level intent list for that set; a `none` entry is the canonical class for a package whose hash moved but whose shipped sources and behavior are unchanged.

## Prevention

- After any change to a publishable package's manifest or source, run the gate locally before pushing; never assume the directly-edited package is the only one the verdict touches.
- When a change moves a dependency's build hash, expect its publishable dependents to appear in the gate's missing-intent list and add their `none` (or earned) entries preemptively.

## Related Issues

- Issue #306 (source of the change), PR #307.
- `docs/solutions/build-errors/turbo-build-cycle-from-self-hosted-devdeps.md` — the turbo build-graph semantics (dependents re-hash from dependency tasks) behind this behavior.
