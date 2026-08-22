---
title: A release note's claimed surface must be recomputed from the exports map, never read off the diff
date: 2026-08-22
category: conventions
module: repo-wide release and changeset authoring
problem_type: convention
component: tooling
severity: high
applies_when:
  - authoring a changeset body or choosing a bump after a release gate demanded an intent
  - a release gate names packages by build-hash movement rather than by consumer reach
  - a package publishes a binary, a plugin entry, or any surface narrower than its source
  - deciding whether an API report's silence is evidence that a surface held
tags:
  - release-notes
  - published-surface
  - claim-hygiene
  - author-unforgeable-recomputation
---

# A release note's claimed surface must be recomputed from the exports map, never read off the diff

## Context

Two questions look like one and are not. **Is an intent required** is decided by a release gate — the honest form keys on the build-graph hash, so a package whose shipped inputs moved demands an intent and one whose did not demands nothing. **What the intent may claim** is decided by the package's published surface, and the gate says nothing whatsoever about it.

An author who has just spent hours in the internals answers the second question from the first. The gate names a package; the diff shows symbols added and removed; the note reports them. Every sentence is true about the source tree and false about the artifact, because `export` in a module is not export from a package.

## Failure Mechanics

Three independent ways the source's exports and the published surface diverge. Each produces a release note promising names no consumer can import.

1. **No type entry at all.** A package whose manifest exposes only its own manifest under `exports`, shipping a binary, has _no_ import surface. Every symbol in it is internal regardless of how it is spelled in source. A note announcing "X and Y are new exports; Z is removed" describes a surface with zero members. The correct entry names only what the executable does differently — arguments, exit codes, stream contract, operator-facing messages.

2. **Exported from a module the entry never re-exports.** A symbol declared `export` inside an internal module reaches nobody when the single entry point does not forward it. The same holds for a package whose only export is a framework entry point — a plugin's registration function, a CLI's main — where the surface is that one value and nothing beside it.

3. **A rollup report carrying no signatures.** An API report is author-unforgeable evidence _only if it records declarations_. A report that is a namespace rollup — listing which names a namespace re-exports and not their types — moves zero lines when a signature changes underneath it. Its silence is then not evidence the surface held; it is evidence the instrument cannot see signatures. A report holding real declarations gives the opposite reading: zero movement across the branch _is_ the surface holding.

$$
\text{claimable} \;=\; \text{declared surface} \;\cap\; \text{recomputed}, \qquad
\text{claimable} \;\neq\; \text{diff}
$$

## Architectural Invariants

**Published-Surface Precedence.** The bump and the body are functions of the artifact, never of the change that produced it. Two recomputations decide them, each keyed on something the author did not write in the note:

- **Reach.** Read the manifest's export conditions (including any publish-time override that replaces them). No type-bearing entry ⇒ no importable surface ⇒ the note may name no symbol. An entry exists ⇒ confirm the specific symbol is reachable _through it_, not merely `export`ed somewhere.
- **Movement.** Diff the committed API report across the branch, and first establish which kind of report it is. Declarations present ⇒ its verdict binds in both directions. Rollup only ⇒ its zero is uninformative and reach must be established from the entry module directly.

**Bump follows the recomputation, not the effort.** A whole-module restructure behind an identical surface earns `none`. A three-character change to an exported default earns `major`. The self-refuting entry is the tell: a body that needs "purely internal" or "no behavioural change" to be accurate has admitted its own bump is `none`.

**The two errors are not symmetric.** A false `major` publishes a migration no consumer can perform, against names they cannot resolve — it costs every reader of that changelog a wasted investigation and destroys trust in the rest of the entry. A false `none` is a silent non-release: the version never ships and the observable change reaches nobody who reads notes to decide upgrades. Both are defects; only the second is the one a hash-keyed gate exists to catch, which is why the first passes every gate and must be caught by recomputation.

```
# WRONG — surface claimed from the diff
gate names package  ->  read diff  ->  list added/removed symbols  ->  pick bump from diff size

# RIGHT — surface recomputed from the artifact
gate names package  ->  read export conditions       -> importable? which entry?
                    ->  classify the API report      -> declarations, or rollup?
                    ->  diff that report             -> movement, or uninformative?
                    ->  body names only what a consumer observes through that entry
                    ->  bump follows the observation
```

## Verification & Prevention

Recompute per package the gate named, never once for the batch — reach differs package by package inside one change.

- **Reach check.** Resolve the manifest's effective export conditions. Absent type entry ⇒ reject every symbol-naming sentence in the draft.
- **Report classification.** Establish declarations-versus-rollup before reading any zero as a verdict. This is the step that turns an instrument into evidence; skipping it makes a green reading indistinguishable from a blind one.
- **Body audit.** Read the draft once as someone who has only ever installed the package. A sentence they cannot act on is noise at best and a false promise at worst.

### Code Smells

- A changeset body containing a symbol name for a package whose `exports` carries no type-bearing entry.
- "… are new exports for building it" — the phrase reports the source's exports, and appears verbatim where the surface has none.
- A bump above `none` beside a sentence asserting the surface is unchanged.
- A single note carrying one body across many packages at mixed bumps: one prose block cannot be the changelog entry for surfaces that moved differently.
- An API report's zero-line diff cited as evidence without the report's kind established.

## Related

- `docs/solutions/tooling-decisions/changeset-requirement-keys-on-turbo-build-hash.md` — decides _whether_ an intent is required; this document decides what that intent may claim, and the two are deliberately disjoint.
- `docs/solutions/build-errors/exports-types-rollup-drift.md` — the same entry-condition surface failing at resolution time rather than at authoring time.
- `docs/solutions/build-errors/stale-api-report-outlives-toolchain.md` — the report as instrument, failing from staleness rather than from carrying no signatures.
- `docs/solutions/conventions/state-a-claims-epistemic-status.md` — the general discipline; a claimed export is an empirical claim about an artifact, defeated by re-measurement.
- `docs/solutions/architecture-patterns/constraint-reaches-only-via-window-or-gate.md` — why a repo-local instrument reaches an adopter as zero bits, the same asymmetry that makes the note the only thing that does reach them.
