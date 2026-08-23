---
title: A workspace package's declared files reach every task hash, not just its dependents'
date: "2026-08-23"
category: tooling-decisions
module: monorepo task graph and cache
problem_type: tooling_decision
component: build
severity: medium
applies_when:
  - estimating the blast radius of a change to a shared workspace package
  - narrowing a task's `inputs` in the hope of reducing cache invalidation
  - deciding whether rarely-changed shared configuration may live beside frequently-changed code
  - reading an `affectedTasks` count and deciding whether it over-reports
tags:
  - turbo
  - cache-invalidation
  - task-graph
  - blast-radius
  - measurement-controls
---

# A workspace package's declared files reach every task hash, not just its dependents'

## Problem

A one-line edit to the shared test-runner configuration package — a single key added to the exported `sharedConfig` object — invalidated **257** tasks. Every other commit in the same branch invalidated 0 or 4. The obvious reading is that most of those 257 are waste: `typecheck`, `lint`, `attw`, `build` and `api:check` accounted for roughly 180 of them, and none of those tasks reads a test-runner config.

That reading is wrong, and the correction is the learning: the invalidation is real, it is not routed through the dependency graph, and no amount of narrowing a task's `inputs` reduces it.

## Mechanism

A task's cache key is composed of three independent parts:

$$H_{\text{task}} = H_{\text{global}} \;\oplus\; H_{\text{inputs}} \;\oplus\; \bigoplus_{u \in \text{upstream}} H_u$$

Task-level `inputs` govern only the middle term. The first term is the one that matters here. Turbo's global cache inputs carry a component covering the **declared file set of internal workspace packages** — the manifest's published file list, not the task's `inputs` globs and not the package's source directory.

Two consequences follow, and both were measured:

1. **A package whose declared files change moves the global term.** The shared config package declares its library directory as its published file set, so editing a file inside it moves that component. Its own `build` task declares `inputs` that do not include that directory at all, and its hash moved regardless.

2. **The global term is in every task's key, so it ignores edge direction.** The `tsconfig` package's `build` hash moved too — and `tsconfig` is _upstream_ of the shared config package, not downstream. There is no dependency path along which the change could propagate. A global term needs none.

The failure mode this creates is a scoping illusion:

$$\text{blast radius} \neq f(\text{dependents}) \quad\text{when the change moves } H_{\text{global}}$$

An engineer reasoning from the dependency graph predicts "the packages that depend on it." The measured answer is "every task in the repository."

## Falsified hypothesis

The natural first explanation is a root-anchored input: the `test` task declares a root-relative glob pointing at the shared config package's library directory, so that turbo re-runs tests when shared test configuration changes. A root-relative input cannot be attributed to any one package, so folding it into the global hash would explain the symptom exactly.

**It is not the cause.** Removing that single input line and re-measuring left all sampled task hashes moving exactly as before. The root-relative input is a correct and necessary declaration for the `test` task; it is not the carrier of the repo-wide invalidation. Diffing the global cache inputs across the edit named the carrier directly: only the internal-dependency component changed.

Record this one explicitly, because the root-relative input is the plausible-looking suspect and deleting it is a tempting "optimization" that removes a real correctness declaration while fixing nothing.

## Architectural invariants

**INV-1 — Input narrowing is orthogonal to the global term.** Tightening a task's `inputs` reduces $H_{\text{inputs}}$ sensitivity only. It cannot reduce sensitivity to a change that moves $H_{\text{global}}$. Any optimization framed as "narrow the inputs so shared-package edits stop invalidating us" is unfalsifiable by construction — it targets the wrong term.

**INV-2 — A package's declared file surface is its blast radius, not its dependency count.** What determines whether editing a file triggers repo-wide invalidation is whether that file sits inside the published file set of a workspace package. A file excluded from that set — a test, a fixture, a doc — does not move the global term. This is why edits to a package's tests invalidated only that package's tasks while an edit to a shared library file invalidated everything.

**INV-3 — Co-location decides invalidation frequency.** Given a package whose declared files change with frequency $f$, every task in the repository is invalidated at rate $f$. Placing a volatile file inside a shared package's published surface therefore taxes the entire repository. The design lever is not the task graph; it is which files a shared package declares, and how often those files change. A shared package should hold only what genuinely changes rarely.

**INV-4 — Full invalidation from shared configuration is correct, not waste.** When shared test configuration changes, re-running every test is the right answer. The defect worth attention is the _unnecessary_ half — rebuilding and re-linting for a test-config change — and that half is not addressable through task configuration. It is addressable only by not putting the volatile file in a shared package's declared surface in the first place.

## Verification and prevention

**Always run a null control before attributing a hash movement.** Rewrite the target file with byte-identical content and re-measure. If hashes move under an identical rewrite, the instrument is measuring file metadata rather than content, and every subsequent attribution is noise. In the measurement that produced this document, the null control moved 0 of 17 sampled task hashes, which is what licensed the rest of the findings.

**Always run an attribution control.** Edit an unrelated file outside any package's declared surface — a planning document, for instance — and confirm the same hashes do _not_ move. Without this, "everything invalidates" is indistinguishable from "the measurement invalidates everything."

**Prefer per-task hash comparison over the affected-task query when the question is causal.** The affected-task query answers "what would run"; comparing the dry-run hash of a named task before and after a controlled edit answers "what actually changed and why." Only the latter distinguishes a global-term movement from a dependency-edge movement, because the two produce identical affected-task output.

**Diff the global cache inputs, not just the task hashes.** The dry-run output exposes the global inputs as separate named components. When a hash moves for a reason the dependency graph does not explain, diffing those components names the carrier in one step instead of inviting a hypothesis loop.

### Code smells

```jsonc
// SMELL: an "optimization" that narrows inputs to escape a shared-package edit.
// Targets the wrong term (INV-1); the global component is untouched.
{ "build": { "inputs": ["src/**"] } }   // already narrow; was never the carrier

// SMELL: deleting a root-relative input because it "looks like" the cause.
// Removes a correctness declaration; measured to change no hash.
{ "test": { "inputs": ["$TURBO_ROOT$/<shared-config-package>/lib/**"] } }
```

```txt
SMELL: a shared workspace package whose published file set contains
       frequently-edited files. Every edit is a repo-wide invalidation (INV-3).

SMELL: an attribution claim with no null control. "Editing X invalidates
       everything" is not a finding until "editing X with identical bytes
       invalidates nothing" is also shown.
```

## Related

- `docs/solutions/architecture-patterns/label-routed-rules-are-unfalsifiable.md` — the same shape in a different instrument: a check keyed on the wrong term is unfalsifiable regardless of how precise it looks.
