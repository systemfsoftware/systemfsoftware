---
title: Linter environment failure routed into the violation channel
date: 2026-08-30
category: logic-errors
module: oxlint-guard-hook
problem_type: logic_error
component: tooling
severity: high
symptoms:
  - "Hook demands INVOKE SKILLS FIRST for every edit in a project whose oxlint-tsgolint companion is absent"
  - "Fresh clone without a local oxlint install produces the exit-2 skills diagnostic instead of an install hint"
root_cause: logic_error
resolution_type: code_fix
related_components:
  - classifyResult
  - runGuarded
  - spawnUnavailableHint
tags:
  - lint-guard
  - classification
  - exit-code-protocol
  - environment-failure
---

# Linter environment failure routed into the violation channel

## Problem

A PostToolUse lint guard classifies each linter run into outcome classes with different exit-code meanings: silent skip (0), install hint (1), skills-first violation (2). The classifier ended in a catch-all rule treating every nonzero exit with unrecognized output as a violation. Two environment failures fall into that net: oxlint exiting nonzero because its `oxlint-tsgolint` companion cannot initialize, and `pnpm exec` exiting nonzero because the local oxlint binary is absent. In both, the agent receives the `INVOKE SKILLS FIRST` demand — a checkpoint that only makes sense for rule violations — and no number of skill invocations can install a missing binary, so the guard is wrong on every single edit in that project.

## Failure Modes

1. **Exit-code-only partitioning.** The classifier's last rule is `matches: () => true` with a violation outcome. Any new failure mode whose output does not match a known tolerance pattern silently becomes a violation. Adding tolerance patterns piecemeal is whack-a-mole: the next environment failure (locked node_modules, dead registry cache) reintroduces the defect.
2. **Causality collapse.** Rule violations are caused by the agent's edit; environment failures are caused by the workspace state and are unfixable by the agent's in-session actions. A channel that demands skill invocations presupposes the first causality. Collapsing the two makes the diagnostic unfalsifiable — the agent cannot ever satisfy it.
3. **Retry-eligible degradation.** The type-aware lint pass depends on a companion binary that plain lint does not. Treating the companion's absence as terminal discards the guard's remaining enforcement power (all non-type-aware rules) when a one-flag retry keeps it.

## Solution

Classify by causality before the catch-all, and route each class to the channel its cause supports:

- Output naming the type-aware companion (`tsgolint`) maps to a retry outcome; the runner re-spawns the linter without the type-aware flags, with retry disabled on the second pass so a genuine plain-lint violation still reaches the violation channel.
- Output matching the package runner's missing-binary markers (`ERR_PNPM`, command-not-found text) maps to an exit-1 outcome rendered through the existing `spawnUnavailableHint` path, same as a spawn-level `not-found`.
- The sibling guard `classifyLintResult` already implements the retry half of this split; the two guards now share the posture.

Verified on the oxlint-guard-hook branch (PR pending at writing): `deno task check` and `deno task test` green with fixtures for both failure classes and for the retry-still-fails path; repo `pnpm check:local` green.

## Why This Works

The invariant: **an outcome class the callee does not control must never route into a channel that demands callee-controlled remediation.** Partition outcomes by who can fix them:

```text
cause(agent's edit)      → remediation channel for the agent   (exit 2, skills demand)
cause(workspace state)   → remediation channel for the human   (exit 1, install hint)
cause(nothing repairable) → silence                            (exit 0, tolerated skip)
```

A catch-all rule is only lawful as the last resort of the _agent-fault_ class. Everything recognizably not-agent-fault must be peeled off before it, because the cost asymmetry is unbounded: a misrouted environment failure fires on every future edit forever, while a missed tolerance pattern for a genuine violation fires once.

## Prevention

- Test each exit channel with an environment-failure fixture, not only a violation fixture: a missing-companion output and a missing-binary output must assert exit 1 (or the retry), never the skills diagnostic.
- Assert the retry shape: the second spawn's argv must lack the flags the missing component powers, and a second failure must fall through to the correct channel.
- When adding a tolerance pattern, add the negative fixture too (the same marker text arriving with a real violation must still exit 2) — marker matching on combined output can over-match.

## Related Issues

- docs/solutions/runtime-errors/hook-subprocess-drops-path.md (same guard family: child-environment construction determines which failures are even reachable)
- systemfsoftware/systemfsoftware#324 (residual review findings for this guard)
