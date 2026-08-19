---
title: Deleted effect-purity-law — repetition cannot observe constant-returning I/O
date: 2026-08-19
topic: architecture-patterns
---

# The determinism law, deleted as a package; the limit it recorded, kept

`@systemfsoftware/effect-purity-law` shipped one property — `∀x. f(x) = f(x)`, two applications of a function claimed pure to the same input must agree — and one doctrine boundary it could not cross. The package is gone (2026-08-19, deleted with the git history intact); the boundary is a doctrine entry because it is the part that outlives the mechanism.

## What the package was, and why it measured right once

The law's warrant was measured on arrival: `kernel-no-ambient-impurity` (a now-deleted lint rule, itself deleted with the cell-role fleet in `166e6bb655c`) reported `Math.random()` written directly in a kernel cell and reported nothing when the same call sat one indirection away behind an imported helper. Applying the caller twice returned `1.0140990551606173` then `1.4605868309411392` — the exact witness quoted in `cf0adf756d3`. A lint rule resolves a called name against the file it reads; a run resolves it against the program. That asymmetry is real and remains true after the package's deletion: no AST rule follows an import.

## Why the package died

- **Zero in-tree callers.** Nothing in the workspace ever registered the law; the umbrella's dependency edge (`packages/all`) was a declaration of intent, not a use.
- **Effect v4 ships the comparator the package hand-rolled.** `Equal.equals` already treats `NaN` as equal to `NaN` (`repos/effect/packages/effect/src/Equal.ts` special-cases it before object comparison) and does structural equality for records, options, chunks, dates. The package's `Object.is` default existed to dodge a `NaN` flake Effect had already fixed; `ruleOfPurityBy` existed only because that default was wrong for structural codomains.
- **The gate was vacuous.** The leaf's own check ran its `test` command, which exited 0 with zero test files by configuration (`passWithNoTests`). A green gate that runs nothing certifies nothing.
- **Nothing shipped.** The registry never saw it (404 at deletion time), so the removal has no adopter blast radius.

## The doctrine that survives

Repetition cannot observe I/O whose result is constant. A write that returns the same value every time, an emitted metric, a mutation outside the function that leaves its return value alone — `∀x. f(x) = f(x)` stays green over all of them, and a reader who infers purity from that green is wrong. This limit is the reason a determinism law can only demote, never certify: it proves impurity when it fails and proves nothing when it passes.

Gate: review — for each function under a determinism law that touches anything outside itself, the reviewer names why repetition suffices, or the purity claim is withdrawn.

What an adopter gets instead of the package: the three-line law at the call site — one `it.prop` over the domain's arbitrary, comparator `Equal.equals` (or `Schema.toEquivalence` when the codomain is a schema type). That is the whole package's runtime content, and it needs no dependency.

## Related

- [Deleted the cell-role suffix rule fleet](../architecture-patterns/cell-suffix-fleet-deleted-unowned.md) — the sibling deletion of the lint-rule fleet; its paid ledger ("none" for every refusals channel) is the measured background for why a runtime law was the last instrument standing.
