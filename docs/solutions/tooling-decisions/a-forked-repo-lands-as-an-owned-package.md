---
title: A forked third-party repository lands as an owned package, not a vendored subtree
date: "2026-09-23"
module: systemfsoftware
problem_type: tooling_decision
component: packages/discern
severity: medium
applies_when:
  - Bringing a third-party repository into this workspace in order to modify it
  - Choosing between a repos/ vendored subtree and a packages/ owned member for external code
  - Someone describes a repos/ subtree as this repo's fork of something
root_cause: ownership_boundary_choice
resolution_type: package_fork
related_components:
  - packages/discern
  - subtrees.toml
  - guard-protected-writes
tags:
  - fork
  - subtree
  - vendoring
  - ownership
---

# A forked third-party repository lands as an owned package, not a vendored subtree

## Context

`packages/discern` is a fork of [`doeixd/discern`](https://github.com/doeixd/discern) at commit `ab092e2656d5cb116653e846d3f42c4343bfbdf3`. This repo holds two mechanically different substrates for someone else's code — `repos/` trees declared in `subtrees.toml`, and members under `packages/` — and they differ in one property that decides every case: whether a write to the tree is permitted.

## Candidates

1. **A `repos/` entry in `subtrees.toml`.** Rejected. The substrate forbids the work: `REPO-S3` declares every `repos/` tree read-only and the `guard-protected-writes` hook fails a write into one. A subtree is a reference this repo reads (`REPO-W4`), not a copy it owns, so a defect found there cannot be repaired in place.
2. **A git submodule mounted at the package path.** Rejected. It preserves upstream history and a remote to pull from, but no workspace member uses a submodule shape, so the pnpm member resolution it needs has no precedent to copy.
3. **An npm dependency on `@doeixd/discern`.** Rejected. It is the only candidate that leaves the code unowned, which is the property the fork exists to obtain — the same reason `effect-memfs` and `effect-atom` are forks rather than dependencies.
4. **An owned member at `packages/discern`.** Chosen.

## Deciding criterion

`REPO-O1` states the test directly: a member under `packages/` is owned outright, is not treated as a fork of an upstream, and does not defer to one. That is exactly the wanted relationship: the package is sovereign, upstream carries no weight for its API, tests or behaviour, and it is never a merge source. It is also the relationship every existing fork here already has (`stryker-js`, `arethetypeswrong`, `effect-atom`, `effect-memfs`). `REPO-S3` reads the other way for the rejected candidate: a `repos/` subtree is defined by the edits it forbids.

Provenance stays legible in both directions: the package description and README carry a `forked from doeixd/discern` clause, and `packages/discern/AGENTS.md` carries the pinned commit.

## Architectural invariant

**The ownership boundary decides the substrate, not the code's origin.** For any third-party tree, ask one question first: does anything in this repo intend to write to it?

- Reference only → `repos/` + `subtrees.toml`. Upstream is tracked by `git subtree pull`; `REPO-S3` plus `guard-protected-writes` make writes impossible rather than discouraged.
- Repaired, extended, or shipped → a member under `packages/`. Upstream is a reference; `REPO-O1` makes the tree first-party and forbids deferring to it.

The falsifier is one step, and it is the check a reviewer runs: **name a defect you intend to fix in the tree.** If one exists, the tree cannot be a `repos/` subtree, because the substrate forbids the fix. Equivalently — a `repos/` entry whose consumer needs a patch is a fork that has been placed in the wrong substrate, and the symptom is a plan that proposes an edit the hook will reject.

Two consequences follow, and both are the reason this is an invariant rather than a one-off judgement:

1. **Origin is not a property of the substrate.** `repos/effect` and `packages/discern` are both third-party code; they differ only in whether this repo writes to them. Reading provenance from a directory name, rather than from the write boundary, is what produces the subtree-as-fork category error.
2. **A fork's landings rewrite upstream, and rewrites need the writable substrate.** The first landing repaired four places where `exactOptionalPropertyTypes` and API Extractor refused upstream code; the next replaced every upstream module with cell-taxonomy modules that pass the unrelaxed `recommended` lint preset (`docs/plans/2026-09-23-1600-refactor-discern-cell-architecture-plan.md`). A `repos/` tree can hold neither.

## Reversing observation

Adopting candidate 1 or 3 after this diverges is a discard, not a move. No upstream module survives in `src/`, and the strictness configuration it satisfies is repo-wide: an npm dependency would silently drop the whole rewrite, and a subtree could not hold it. Reversal is therefore measured by the rewrite lost, not by the files moved.

## Related

- `packages/discern/AGENTS.md` — the fork's provenance and the gates it answers to
- `CONSTITUTION.md`, `repos/constitution/ENFORCEMENT.md` — the `REPO-O1` / `REPO-S3` boundary this record applies
- `subtrees.toml` — the vendored trees, each read-only
- `docs/solutions/tooling-decisions/registry-consumption-of-self-hosted-forks.md` — the opposite decision, for a fork this repo publishes rather than consumes
