---
title: An AGENTS.md leaf mandates; it never describes — hierarchy rewrite doctrine
date: 2026-09-03
category: conventions
module: repo-wide enforcement and harness doctrine
problem_type: convention
component: documentation
severity: medium
applies_when:
  - writing, rewriting, or auditing an AGENTS.md instruction tree
  - a leaf describes its directory instead of mandating behaviour
  - a gate command cited in an instruction file no longer exists
tags:
  - agents-md
  - instruction-hierarchy
  - subtraction-first
  - gate-naming
---

# An AGENTS.md leaf mandates; it never describes

## Context

Over successive edits, the repo's `AGENTS.md` tree had drifted from instruction files into per-package READMEs: ownership narratives ("Owned under this org … ported from …"), incident timestamps ("Measured 2026-08-13 …"), design-history essays, and rules whose `check:` named commands that no longer existed (`test:run` where the manifest declares `test`, paths under a directory renamed two refactors ago). Two failure modes compounded: narrative prose dilutes the mandates an agent must hold at done, and stale gate commands teach the agent that instructions lie.

## Failure mechanisms

1. **Description crowds out mandate.** A leaf that explains what its directory contains restates what the filesystem, the manifest, and the types already say — two sources of truth, one of which rots. The agent trusts the prose over the tree.
2. **Prose restraints bind nothing.** A rule of the form "never do X" carried only in prose is the weakest enforcement channel; a restraint survives only as a gate (a command that fails) or as a named `review` judgment.
3. **Copied gates go stale silently.** When a leaf is rewritten by paraphrase rather than re-derivation, dead commands and renamed paths carry forward verbatim. The rewrite itself is the staleness vector.

## Architectural invariants

- **A leaf mandates; it never describes.** Every line in a leaf changes what an agent does in that directory: a command, a boundary, a named gate. Anything derivable from the manifest, the types, or the tests is deleted, not paraphrased.
- **One rule, one home.** Each rule lives at the highest level of the tree it applies to. A rule repeated across N leaves (mutation-enrollment exclusions, codec-law prohibitions) is consolidated upward into the parent, whose own gate enumerates the children; children keep only the delta.
- **A parent can satisfy many children.** A leaf earns its existence only by carrying a non-derivable mandate no ancestor can state without becoming a distractor everywhere else. A leaf of boilerplate verification commands plus description is deleted; the nearest surviving ancestor governs by design.
- **Every gate is re-derived, never carried.** During any rewrite, each cited command, path, package name, and script is verified against the current tree before it is written down. The rewrite diff is the audit surface.

## Verification pattern

Mechanical sweep after the rewrite, in this order: every backticked path resolves on disk; every `pnpm --filter <name>` names a real manifest; every cited script exists in that manifest; every rule-ID cross-reference resolves to its definition; a grep for narrative markers (ownership blurbs, measurement dates, port provenance) over surviving instruction files returns zero; the repo's own pre-delivery gate (`pnpm check:local`) exits 0. The one stale gate this sweep caught — a `test:run` citation where the manifest declares `test` — had survived multiple prior edits precisely because prose is never executed.

## Applicability

Apply on any instruction-tree audit or rewrite. The doctrine source is the harness-creator hierarchy pattern (subtraction first, placement escalation, earn test); the content doctrine (a load-bearing rule names its gate) is agent-docs. Related: `docs/solutions/architecture-patterns/cell-suffix-fleet-deleted-unowned.md` records the same honesty rule for obligations with no mechanical channel.
