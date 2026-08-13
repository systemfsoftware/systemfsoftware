---
title: A prohibition is unenforceable until it is closed transitively
date: 2026-08-13
category: architecture-patterns
module: repo-wide enforcement and harness doctrine
problem_type: architecture_pattern
component: tooling
severity: high
applies_when:
  - writing an allow-list or deny-list over module or layer dependencies
  - adding a prohibition between two components in an import graph
  - reviewing whether a stated architectural boundary is actually enforced
tags:
  - import-graph
  - transitive-closure
  - allow-list
  - enforcement-gap
---

# A prohibition is unenforceable until it is closed transitively

## Context

Architectural boundaries are usually written as direct statements: this component may not import that one. The check that follows is written the same way — it looks at each edge and rejects the forbidden pair. Every direct check passes, the boundary reads as enforced, and the prohibition can still be false, because forbidding an edge says nothing about the paths that route around it.

## Guidance

**Compute the transitive closure of the permitted relation before accepting a prohibition as enforced.** When `X` is forbidden to reach `Y`, the obligation is not "no direct edge from `X` to `Y`" but "no permitted chain from `X` reaches `Y`". Writing the direct prohibition and stopping leaves the boundary decorative.

The general result is sharper than a reminder to check paths: **a permissive residual makes every prohibition between the laundering pair unenforceable.** If some third component is reachable from `X` and can itself reach `Y`, then that component _is_ the residual, and no prohibition stated directly between `X` and `Y` can bind — not because the check is buggy, but because the relation the check consults still permits the route. The repair is to the relation, never to the check.

The trap that makes this specifically hard to see: **a deny-list inverts the entry.** Reading "`state` may be imported only by `executor`, `main`, and test-side files" as a restriction feels like reading a prohibition, but it is a _closed permitted set_ — and what matters for laundering is what that set still allows onward. The mind reads the sentence as a wall and the checker reads it as a door with a guest list.

## Why This Matters

This failure is invisible to exactly the review that should catch it, because the prohibition and the table that defeats it are both correct in isolation. The defect lives in their composition, and composition is what a reader skims.

Its concrete cost here: a prohibition between two cell types was defeated by a third holding the same capability, and **three review rounds and roughly fifteen reviewer agents read the prohibition sitting beside the table that defeated it, and none saw it.** That is the calibration to carry forward — adding reviewers does not find this class, because every reviewer is checking the same local statement and finding it sound. Only computing the closure finds it.

It is also the reason a boundary can pass its gate for months. Every direct check passes. There is no failing edge to notice.

## When to Apply

Whenever a dependency rule is stated between two components:

- **Enumerate, then close.** Build the permitted relation explicitly, compute its transitive closure, and check the prohibition against the closure rather than against the edge list.
- **Read every restriction as a permitted set.** For each "only these may import X" clause, ask what those permitted importers can themselves reach. That is where the residual hides.
- **Look for shared capability.** Two components holding the same underlying licence — the same runtime access, the same privileged import — are interchangeable as launderers, whatever their names suggest.
- **Do not add reviewers to find this.** Add the closure computation. Reviewer count is measurably not the instrument.

## Examples

**The laundering pair.** `middleware` was forbidden `store`, and reached it anyway through `state`, which holds the same `runtime` licence. Nothing in the direct rule was wrong; `state` was simply permitted to `middleware` and permitted onward to `store`, so the forbidden reachability existed through a chain of individually-legal edges. The fix is a closure audit over the whole relation, not a second prohibition bolted beside the first.

**The inversion in practice.** The table entry allowing `state` and `adapter` to be imported _only_ by `executor`, `main`, and test-side files reads as a tight restriction. As a permitted set it is the opposite of tight for this purpose: what it licenses onward is unconstrained by the clause, so the clause cannot participate in enforcing any downstream prohibition.

## Related

- `docs/solutions/architecture-patterns/constraint-reaches-only-via-window-or-gate.md` — the general form: a rule that cannot bind is decoration regardless of how it is written
- `docs/solutions/architecture-patterns/what-a-filename-suffix-can-enforce.md` — why import-graph properties are among the few things a suffix-keyed rule can actually decide
- `docs/solutions/architecture-patterns/provenance-ritual-gates.md` — a related shape: a gate that checks a proxy and reports the claim
