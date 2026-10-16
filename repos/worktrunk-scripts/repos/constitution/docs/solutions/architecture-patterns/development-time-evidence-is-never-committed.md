---
title: Development-time evidence is never committed as an artifact
date: 2026-09-12
category: architecture-patterns
module: constitution corpus amendment
problem_type: architecture_pattern
component: tooling
severity: high
applies_when:
  - A migration reaches for a recorded output or a build-to-build comparison as its safety net
  - A test's expected side is produced by the subject or by a second build of it
  - A rule's permission has to change without vacating the id other documents cite
root_cause: the subject on both sides of the assertion
tags: [constitution, characterization, snapshot, differential, testing, rule-identity]
---

## Context

A migration wants a safety net before it starts, and the cheapest one is the subject's own
current output: record what it emits today, then compare after the change. The technique works
as scaffolding and becomes a liability the moment it is committed. A stored snapshot
re-records whatever the subject currently does and passes forever; a comparison against a
second build of the same subject passes whenever both builds share the bug. Neither can tell a
caller that behavior is wrong.

CONST-T11 previously licensed exactly that: `snapshot only canonicalized published output;
compare two implementations only of the same published operation (or a prior published major
against current)`. The permission put the subject on both sides of the assertion — a stored
snapshot records what the subject emits, and a prior-major comparator builds the expected side
from a second build of the same subject.

## The amended rule

CONST-T11 is amended in place: its id, its title, its `gate: lint`, and the corpus count of 38
rules are all unchanged, so every citation of `CONST-T11` still resolves to the same rule. What
changes is the obligation:

- do: use stored-output snapshots and same-lineage differentials only as development-time
  evidence in a dot-prefixed, always-gitignored scratch directory; the committed suite asserts
  intended behavior against an oracle the subject did not produce
- dont: commit a stored-output snapshot, a recorded-output fixture, or a differential-comparison
  test; keep scratch evidence past the commit that lands the intended-contract tests
- harm: a committed capture re-records whatever the subject currently does and passes forever,
  certifying nothing; a committed differential passes whenever both builds of the same subject
  share a bug
- check: lint — no snapshot API call and no same-lineage differential import in a committed test
  file; review — the scratch directory is gitignored and empty at commit

The title changed with the obligation: snapshots and same-lineage differentials are not
published-surface oracles, and a name that says they are outlives the doctrine it states. The
corpus gate then refuses the change — `deno task test --against origin/main` prints
`FAIL reassigned id: 'CONST-T11' named "Snapshots and Differentials Are Published-Surface Oracles"
at origin/main and names "Snapshots and Differentials Are Development-Time Evidence, Never
Committed Artifacts" now — every citation to it resolves to a different rule`. That failure is
declared, not hidden: the check treats a rule's identity as its id *and* its title, while
CONCEPTS.md licenses amending a rule in place. The disagreement belongs to the instrument's owner,
so the change waits for a declared-amendment mechanism or an explicit waiver rather than editing
the validator (CONST-E9) or retiring the id the owner directed be amended.

## Why amend rather than retire the id

A retired id is vacated: the law survives only under a fresh number, and every document that cites
`CONST-T11` is left pointing at nothing. CONCEPTS.md defines a rule as `minted with a fresh number,
amended in place, or vacated`, and the owner directed the amendment be made in place — the
obligation changes, the id that carries it does not. Legal drafting keeps the citation identifier
across amendments for the same reason: legislation.gov.uk's provision URIs are persistent across
revisions, RFC 9676 fixes a URN namespace for sources of law, and the literature on diachronic
legal norms tracks a provision's content changing while its identifier stays.

The cost is the gate failure recorded above, which is why it is declared and escalated rather than
absorbed.

## Enforcement

Two channels, and only one of them is shipped:

- the TTSR rule `no-characterization` (reminder tier) fires on a snapshot API call, a
  `readFile`-as-oracle assertion, and `.keys()`/`.sort()` equality pins in a test file
- the deterministic channel is a lint rule over committed files, which this repository does not
  yet carry; it is proposed to the lint owner in `systemfsoftware/are-the-types-wrong`
  (`docs/proposals/lint-no-snapshot-api.md`). The author of the law must not build the gate that
  grades it (CONST-E9), so the gap is declared and handed over rather than closed in place
