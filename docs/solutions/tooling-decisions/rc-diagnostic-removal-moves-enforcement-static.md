---
title: An RC can delete the runtime diagnostic you planned to teach
category: tooling-decisions
module: schema-tooling
date: 2026-09-04
problem_type: tooling_decision
component: tooling
severity: medium
applies_when:
  - "planning enforcement against an Effect API while the release line is still an RC"
  - "deciding where a constructability or validity report lives: runtime derivation or static gate"
  - "reconciling public docs against a vendored dependency tree"
tags:
  - schema-v4
  - arbitrary
  - lint-gate
  - rc-churn
---

# An RC can delete the runtime diagnostic you planned to teach

## Context

Effect Schema v4's release line shipped a derivation-report diagnostic and then deleted it inside the same RC series: `Schema.toArbitrary` consolidated into a factory form, `toArbitraryLazy` and the `{ report: true }` / `OpaqueFilter` report were removed (recorded in the vendored tree's pre-release changesets, absent from its internal `toArbitrary` module). The public documentation site still showed the report API — the docs lagged the code. A plan written from the docs would have taught and wired a mechanism that no longer exists.

The invariant the deleted diagnostic carried survives: a schema filter whose predicate cannot describe how to construct its valid values generates by rejection sampling. In v4 the filter itself owns that description — `arbitrary.constraint` narrows the base generator, `arbitrary.candidate` adds a weighted constructor — and the predicate always runs on every generated value, so a wrong hint costs draws, never correctness.

## Guidance

- **Pin API claims against the vendored dependency tree, never the public docs, when the dependency is an RC.** REPO-W4 already states this; the trap measured here is that the divergence is invisible until you read the vendored source. Grep the vendored `src` for the symbol you are about to prescribe; a docs page is not a witness.
- **When a runtime report disappears, ask what static surface can carry the same check.** The report answered "which filters cannot guide generation?" — a question a lint rule over the schema authoring act answers better, because it fires before the code exists rather than after derivation. The rule's honest claim is narrower than the runtime report was (file-local filters; imported filters trusted), and that narrowing is stated in the rule message and pinned as valid test cases.
- **Teach the hook vocabulary, not the removed mechanism.** The window (skill, TTSR rule) now names `constraint`, `candidate`, and the node `toArbitrary` override — with the override placed before filters, since one placed after a filter it cannot satisfy exhausts the discard budget — and never the retired function-valued `arbitrary` annotation.

## Applicability

This guidance applies whenever a dependency's pre-release line is moving faster than its documentation: the authority for "what exists" is the vendored source; the authority for "what it means" is the dependency's own migration notes; and an enforcement design must survive the diagnostic it leans on being deleted.
