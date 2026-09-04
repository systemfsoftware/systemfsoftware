---
title: "Mutation budgets split rule packages into private cells under a re-key aggregate"
date: "2026-09-04"
category: architecture-patterns
module: oxlint-plugin
problem_type: architecture_pattern
component: testing_framework
severity: high
applies_when:
  - "A mutation job exceeds its wall-clock budget because one package concentrates too many mutants"
  - "A public package must keep its exported ids stable while its implementation moves into private workspace packages"
  - "A build invariant must be gated without becoming a tautology"
related_components:
  - stryker-js-vitest-runner
  - oxlint-config
tags: [mutation-testing, stryker, re-key-aggregate, private-leaf-packages, artifact-gates, tsdown-bundling]
---

# Mutation budgets split rule packages into private cells under a re-key aggregate

## Context

One lint-rule package concentrated ~2,075 mutants into a single Stryker cell: one serial CI job, one timeout, no incremental progress on failure. A mutation score for the whole package cannot be observed in reasonable wall-clock time, so the mutation gate degrades into a ritual that either times out or gets exempted. Splitting the package naively faces the opposite constraint: consumers pin rule ids in configs and disable comments, so any namespace migration silently invalidates every suppression.

## Guidance

Split the rule set along its natural domains into **private leaf packages** (`private: true`, never published), and convert the public package into a **re-key aggregate**: it imports the leaves as devDependencies, spreads their rules under its own plugin name, and derives its recommended set from each leaf's own recommendation. The consumer-facing namespace never changes, so no config, disable comment, or import migrates.

The contract that makes this safe is mechanical, three-deep:

1. The aggregate test asserts the exported rule count and id set against a pre-split literal.
2. The base-preset test asserts the wired error set equals the union of the leaves' recommended sets re-keyed — both sides read live plugin objects, so neither can drift alone.
3. A drift test pins byte-identical mirrors of shared kernel modules between the packages that must co-vary.

Each leaf owns its own Stryker config and enters the mutation matrix as an independent parallel cell; the discovery predicate that enumerates cells (workspace importers owning a Stryker config) picks them up with no per-cell CI wiring. The aggregate, owning no rules, leaves the matrix.

Gate the aggregate's packaging invariant on the **built artifact, not the manifest**. Asserting that leaves sit in `devDependencies` tests the declaration, not the outcome — tsdown bundles devDependencies and externalizes dependencies, so the categorization only matters through its effect on the emitted bundle. The honest gate reads the built `dist` bytes and fails when any import or require specifier names a private leaf (the `check-dist-no-private-imports` guard, wired into the aggregate's build after bundling). Red-green proof: green on the real bundle, exit 1 with a planted leak, green again after rebuild.

## Architectural invariant

**A gate reads the artifact a consumer receives, or it is a ritual.** Any check whose failure mode is "the world changed but the declaration was not updated" must inspect the output of the transformation the declaration drives, not the declaration itself. Corollary for splits: _consumer-visible identity is a contract to pin mechanically at every layer it crosses_ — exported surface, preset wiring, and mirrored sources each get their own pin, because each can drift independently of the others.

## When to Apply

- A package's mutant count pushes its mutation cell past its wall-clock budget ($\text{budget} \ll T_{\text{full}}$, and no incremental cache exists for a new cell's debut run).
- Rule ids, plugin names, or config keys are pinned by external consumers and cannot migrate.
- A build tool infers behavior from dependency categorization (bundling vs externalization) — gate the emitted output.

## Examples

Before: `@systemfsoftware/oxlint-plugin` owns 20 rules, one Stryker config, ~2,075 mutants, one serial CI cell.

After: three private leaves (`effect-native` 8, `tag-discipline` 4, `structure` 8 plus four vendored kernels) each mutate in parallel under the per-package budget; the aggregate re-keys via `recommendedFrom` and spreads, exports stay byte-identical (20 rules, 16 recommended), and the dist guard fails a bare-import leak at build time.

## Related

- docs/solutions/architecture-patterns/machine-stream-is-a-file.md
- docs/solutions/build-errors/tsdown-private-dependency-bare-import-dist.md
- docs/solutions/build-errors/changeset-gate-transitive-build-hash.md
- docs/solutions/build-errors/a-disable-comment-names-the-config-key.md
