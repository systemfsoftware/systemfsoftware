---
title: "The oxlint gate wall shapes new-package code — do not inline what a gate forces"
date: 2026-09-21
category: conventions
module: "packages/* authoring (oxlint config-all preset, ce-plugin comment annotator, test-discipline rules)"
problem_type: convention
component: tooling
severity: medium
applies_when:
  - "authoring a new workspace package under oxlint-config-recommended plus ce plugin annotators"
  - "a reviewer or simplify pass asks to inline a tiny helper or dedupe a one-liner"
  - "moving helpers into an import.meta.vitest guard to shrink the published surface"
  - "writing a readiness or retry poll loop in Effect v4"
tags: [oxlint, complexity, internal-export-jsdoc, in-source-tests, effect-whileloop, review-pipeline]
---

# The oxlint gate wall shapes new-package code — do not inline what a gate forces

## Context

While authoring `packages/effect-microsandbox` (PR branch `right-sizenode`), three review passes (a three-lens simplify pass and a seven-persona code review) repeatedly flagged the same shapes as "hacky": a two-step `messageOf`/`describeCause` split, an `optional(value, apply)` helper used four times in a row, a hand-rolled `Effect.whileLoop` countdown instead of `Schedule`, and test helpers sitting at module top level outside the in-source vitest guard. Every one of those shapes is load-bearing: an automated gate forces it, and "fixing" it turns the gate red.

## Guidance

**The complexity≤2 gate is why small helpers exist.** `applyPlan` with four plain `if (x !== undefined)` lines scores complexity 5; the `optional` helper is the compliant shape. The same gate splits `describeCause` into `messageOf` (string passthrough) + `describeCause` (Error unwrap): one nested ternary is complexity 3. When a reviewer asks to inline one of these, the answer is no — cite the complexity rule, not taste.

**A helper must still not be a naked new export in the src/internal folder.** `internal-export-jsdoc` (see `packages/effect-microsandbox/oxlint.config.ts`) demands a JSDoc `@internal` on every export under an internal folder, while the comment annotator flags short docs as "restating what the code says". The deadlock-free resolution: give the export a contract-bearing doc (what it guarantees, not what the signature says) — the annotator passes doc blocks that state a guarantee, and the linter passes any `@internal`. A bare new export in the internal folder fails lint outright.

**In-source test helpers stay top-level privates.** `in-source-test-targets-private` requires an `import.meta.vitest` block to touch at least one non-exported module-level binding; moving `applyAll`/`twinOf`-style prop helpers inside the guard makes the block reference only exported names and fails the rule. The published-bundle concern is already handled: tsdown statically dead-code-eliminates the guard, and unexported locals referenced only from it are shaken.

**An `Effect.whileLoop` poll needs its own sleep.** v4 `whileLoop` has no `initial`-state option and no built-in delay: `remaining = timeoutMs / 250` sets an attempt budget, but without `Effect.sleep` in the body the loop burns every attempt back-to-back and "times out" instantly. The delay is a poll cadence next to a real event source (the probe), not a timing guess; keep the cadence and the timeout budget as named constants.

**Gate-colliding simplification findings go to the PR body, not the tree.** The ce-simplify/ce-code-review pipeline applies only mechanical, behavior-preserving fixes; when a finding collides with a gate, record it as an unapplied finding with the gate named, so the next reviewer does not re-litigate it.

## Applicability

Any new `packages/*` library under the `all`-preset oxlint config plus the CE plugin annotators — before preemptively "cleaning up" a small helper, check which gate put it there.
