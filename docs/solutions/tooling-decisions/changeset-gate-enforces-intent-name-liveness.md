---
title: The Changeset Gate Enforces Intent-Name Liveness at the PR
date: 2026-09-01
category: docs/solutions/tooling-decisions
module: intent versioning
problem_type: tooling_decision
component: tooling
severity: high
applies_when:
  - A merge gate guards a shared pending-record queue consumed by a later automation (releases, migrations, publishes)
  - A gate scoped to the PR's own diff that must actually judge a post-merge global state
  - An extraction-based validator whose failure mode is silently accepting a record it failed to parse
resolution_type: design_change
tags:
  - changesets
  - release-gate
  - fail-closed
  - liveness
  - monorepo
---

# The Changeset Gate Enforces Intent-Name Liveness at the PR

## Context

Under _intent versioning_ (CONCEPTS), a deleted workspace package leaves a
trap: every pending `.changeset/` intent that still names it aborts
`pnpm version -r` at release time
(`docs/solutions/runtime-errors/pnpm-versioning-unknown-package-deleted-intent.md`
owns the intent-side law; `docs/solutions/tooling-decisions/changeset-requirement-keys-on-turbo-build-hash.md`
owns the hash-side gate). The hash-side gate judged only whether a PR's own
changes demanded an intent. Nothing judged the backlog. The stryker-js split
deleted `@systemfsoftware/stryker-js-platform-node` without sweeping the 38
intents that named it; every PR checked green, and the next push to `main`
failed the Release with `ERR_PNPM_VERSIONING_UNKNOWN_PACKAGE` — the exact
"vacuously passing PR, squashed onto main, failing in production" shape this
gate family exists to prevent.

The fix widens the gate with a **liveness verdict**: every frontmatter bump
key of every pending intent, judged against the live workspace membership the
gate already computes from its turbo dry-run enumeration (`readMembers`).
Membership reuses the one engine of record — parsing `pnpm-workspace.yaml`
globs separately would fork the engine's input model, the defect the hash-gate
doctrine bans.

## Mechanism — three ways a liveness check fails open

1. **Diff-scoped scope.** Judging only the files a PR changed ignores the
   backlog. The release consumes the union of pending intents, so a verdict
   over a subset proves nothing about consumability. The verdict must judge
   all pending records at head.
2. **Under-extraction.** A parser that recognizes a record only when it
   matches a strict grammar (exact bump token, line end, no trailing YAML
   comment) silently drops the records it cannot parse — and a dropped stale
   name reads as a clean name. Over-extraction is harmless here: the check is
   membership, so extracting every plausible key flags only non-members. When
   the predicate is a set lookup, extract liberally and let membership decide.
3. **Swallowed indeterminacy.** An enumeration or read error that returns an
   empty pending set converts "could not judge" into "nothing stale". The
   guard's own sibling verdicts fail closed on the same shape (an empty
   turbo package set throws). Indeterminable state must resolve to failure,
   per the fail-closed verdict direction.

A second, subtler failure was caught in review and rejected: the regex
case-insensitive flag was suspected of folding captured package names. It does
not — a regex capture returns the literal source text, and the membership
lookup is exact — so a wrong-case stale name is flagged, not accepted. The
lesson generalizes: before alleging a case-folding bypass, trace which text
the capture group actually returns.

## Architectural Invariants

- **A merge gate for a shared queue judges the queue's post-merge state, not
  the delta.** `consumable(head) := ∀ record r ∈ pending(head): valid(r)` —
  never `∀ r ∈ diff(pr)`. Diff-scoping a shared-queue gate is the design
  defect; the PR's own files are one input, not the subject.
- **Over-extract, filter by membership.** For a liveness predicate, the
  extraction grammar may be loose (any scalar-valued key) because a live
  member never violates; under-extraction is the only fatal direction.
- **Fail closed on indeterminable state.** Enumeration, read, and parse
  failures of the judged set resolve to gate failure — the same resolution the
  fail-closed direction prescribes for unparseable verdicts.
- **A deletion sweeps its intents in the same change, or the PR fails.** The
  gate converts the previously advisory invariant into a merge-blocking one.

## Verification

- Selftest fixtures in the guard's `--selftest` (no subprocess, no writes):
  dead `patch` name fails, dead `none` name fails, live names pass, an intent
  untouched by the PR but stale at head fails (pins the all-pending scope), a
  trailing-comment stale line fails, README ignored.
- Red cases against the live planner: a scratch tree with one reintroduced
  dead name reproduces `ERR_PNPM_VERSIONING_UNKNOWN_PACKAGE`; the repaired
  tree passes `pnpm version -r --dry-run`.
- Spot-red the live gate with the deliberate defect before trusting the green.

## Related

- `docs/solutions/runtime-errors/pnpm-versioning-unknown-package-deleted-intent.md` — the intent-side law this gate enforces at PR time.
- `docs/solutions/tooling-decisions/changeset-requirement-keys-on-turbo-build-hash.md` — the hash-side gate; membership and executor-pinning doctrine.
- `docs/solutions/integration-issues/parallel-lanes-race-on-one-immutable-cache-key.md` — lane-distinct cache keys for the same release pipeline.
