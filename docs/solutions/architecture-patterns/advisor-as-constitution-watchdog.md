---
title: Advisor as constitution watchdog — policing gate:review rules no command enforces
date: 2026-08-15
category: architecture-patterns
module: repo-wide enforcement and harness doctrine
problem_type: architecture_pattern
component: tooling
severity: high
applies_when:
  - a constitution or doctrine document designates gate:review for rules that are judgment calls
  - no deterministic check can enforce a rule (root-cause vs symptom, testing trophy, scope discipline)
  - an omp advisor is available and can be configured via WATCHDOG.md
tags:
  - advisor
  - watchdog
  - constitution
  - gate-review
  - enforcement
  - omp
---

# Advisor as Constitution Watchdog

## Context

The constitution designates `gate: review` for 21 of its 24 rules — "enforced by review." The remaining 13 are mechanized: 10 lint, 2 type-checker, 1 mutation. The mechanized rules fail builds; the review-gated rules are judgment calls no command can make. A lint rule catches `as any` (CONST-B5). It cannot catch "this change patches a symptom instead of fixing the root cause" (CONST-S1) or "this test buries logic in I/O" (CONST-T1).

Until now, `gate: review` meant "a human or reviewer checks this" — but no reviewer mechanism existed in the agent loop. The rules were dead text: stated, cited, never enforced.

## Guidance

A `WATCHDOG.md` at the repo root `@import`s `CONSTITUTION.md` into the omp advisor's system prompt. The advisor — a separate model with its own session and `read`/`grep`/`glob` tools — reviews every code delta against the 21 review-gated rules and raises `concern` (violation), `nit` (borderline), or stays silent (conforms). The 13 mechanized rules are excluded; the advisor does not re-check what the toolchain already catches.

### Key design decisions

1. **@import amortizes the constitution.** The full constitution (~388 lines) is loaded once into the advisor's system prompt at session start, not re-read per turn. The advisor carries it in context for every review.

2. **The advisor is external, not circular.** It is a separate model with its own session — not the primary agent judging itself (CONST-E4). The primary agent can edit `WATCHDOG.md` or `CONSTITUTION.md` (both Editable), but those changes go through review, and the advisor would see the change in the next transcript delta. Bounded circularity, not the unbounded kind.

3. **The advisor is not a gate.** It raises concerns; it does not pass/fail a build. This is consistent with the AGENTS.md surface class "Doctrine is never an input to a gate" — the advisor IS the review mechanism the constitution's `gate: review` designates, not a deterministic gate wired to doctrine text.

4. **Subagents need explicit advising.** Subagents run unadvised by default. The primary agent's advisor sees subagent _results_ but not their individual edits. To police delegated work, set `task.agentAdvisor` per agent (e.g., `task: "on"`, `single-unit-coder: "on"`). Each advised subagent gets its own advisor that re-discovers `WATCHDOG.md` for its cwd.

5. **Model choice matters for judgment calls.** The 21 review-gated rules are the hard ones — the ones that couldn't be mechanized. A flash model with thinking off is the lowest-reasoning configuration. It catches obvious violations (handler with business logic → CONST-B1, symptom patch → CONST-S1) but misses subtle ones (I/O interleaved in a refactor → CONST-B3). Use a mid-tier model with thinking on for the advisor role.

## Applicability

Use this pattern when a doctrine document designates `gate: review` (or equivalent) for rules that are judgment calls. Do not use it when a rule can be mechanized — make it a lint/type-checker/mutation gate instead (CONST-E1). A rule that can fail a build should fail a build; the advisor is the fallback for rules that can't.

## Not yet verified

The watchdog is written but not activated. Activation requires `advisor.enabled: true`, a model for `modelRoles.advisor`, and `task.agentAdvisor` entries for subagent advising. The pattern's effectiveness (false-positive rate, concern quality, subagent coverage) is unmeasured.

## Related

- [What a filename suffix can enforce](./what-a-filename-suffix-can-enforce.md) — the enforcement ceiling of path conventions; this pattern pushes past that ceiling by using a model instead of a lint rule.
- [Rule admission severity and accretion](../tooling-decisions/rule-admission-severity-and-accretion.md) — "an honest advisory belongs in review"; this pattern provides the review surface that doc named but did not build.
