---
title: What a filename suffix can enforce, and what it cannot
date: 2026-08-13
category: architecture-patterns
module: repo-wide enforcement and harness doctrine
problem_type: architecture_pattern
component: tooling
severity: high
applies_when:
  - proposing a filename suffix, tag, or path convention that rules will key on
  - writing a rule whose message describes what a file means rather than what it contains
  - a convention is expected to constrain consumers of a published package
tags:
  - naming-convention
  - enforcement-ceiling
  - lint-rule-design
  - decidability
---

# What a filename suffix can enforce, and what it cannot

## Context

Keying rules on a filename suffix is cheap and effective: the name grants and denies a file its powers, and a checker can read the name without resolving anything. That cheapness invites overreach. A suffix looks like it can mean anything, so conventions accrete that the suffix cannot actually carry, and the rules written against them either cannot be implemented or quietly check something narrower than they claim.

## Guidance

Two limits bound what a suffix can do, and both are structural rather than a matter of effort.

**The suffix is a carrier in one frame only.** In the authoring frame — inside the repository, where the file is being written and the checker runs over the tree — the suffix is available and rules may key on it. In the consuming frame it is not: a stranger importing a published package sees exported symbols and types, not your filenames. The corollary is a hard constraint on design: _a constraint that must bind a stranger cannot ride the suffix._ It has to be carried by something that survives packaging — a type, a runtime check, an exported shape.

**Only two kinds of meaning are enforceable.** A suffix that names a _semantic interior_ property — what the code means, whether the function is pure, whether the module is cohesive — cannot be verified; deciding non-trivial semantic properties of programs is undecidable in general, so no checker settles it. A suffix that names a _syntactic interior_ property is enforceable directly, by looking at the file. So the enforceable meanings available to a suffix are exactly:

- **edge properties** — what the file imports and what it exports, which are readable from its own text; and
- **depth-0 syntactic properties** — what tokens and shapes appear in the file itself, with no import resolved and no call followed.

Anything else a suffix appears to mean is aspiration. Keep it, if it is useful as guidance, but do not write a rule that reports it as decided.

## Why This Matters

The two limits fail in opposite and equally quiet ways.

Ignoring the frame limit produces a convention that works perfectly in development and evaporates on publication. Everything is green in the repository, and the constraint reaches no consumer at all, because the carrier was left behind at the package boundary.

Ignoring the decidability limit produces something worse than an unimplementable rule: an implementable rule that checks a proxy and reports the property. A check that finds a forbidden token at depth 0 has established that the token is present, not that the program has the property the token suggests. When the message states the stronger thing, every future reader learns a rule the tool never verified, and the overreach is invisible because the check still fires correctly on the narrow thing it does detect.

## When to Apply

Before adding or extending a suffix-keyed convention:

- **Name the frame.** Must this bind only authors in this repository, or also consumers of a published artifact? If the latter, the suffix is the wrong carrier — pick one that survives packaging.
- **Classify the meaning.** Is it an edge property, a depth-0 syntactic property, or a semantic claim? Only the first two can be gated.
- **Match the message to the check.** State what was actually decided. "A forbidden token appears here" is honest; "this module is impure" is a claim a depth-0 check did not earn.
- **Where the property is genuinely semantic**, stop pretending. Either move to an instrument that can see it — a test, a type, a runtime assertion — or record it as guidance and say it is unenforced.

## Examples

**A suffix that cannot cross the boundary.** A convention requiring that files with a given suffix only be imported by certain other suffixes is enforceable in the tree by reading the import graph. The same convention is meaningless to a consumer who imports the package's entry point: the suffix is not in the published surface, so nothing constrains how the consumer composes what they receive. The constraint has to be re-expressed as a type or a separate entry point to survive.

**A message that outran its check.** A rule examining one file at depth 0 emitted a message asserting a property of the whole program. The check was sound about the token it found; the message described something the check could not decide, because deciding it would require following imports the rule never resolved. Filed as issue #139.

**A rename that moved the meaning.** Because the suffix is the key rules dispatch on, changing a file's suffix changes which rules apply to it — silently, since the rename touches no rule. That is the drift hazard described under `Drifted key` in `CONCEPTS.md`, and it is the price of keying on a name that nothing verifies.

## Related

- `docs/solutions/architecture-patterns/constraint-reaches-only-via-window-or-gate.md` — the general form: a constraint binds only by occupying the window or gating the emission
- `docs/solutions/architecture-patterns/constructor-rule-boundary.md` — when a type-level constructor rather than a suffix-keyed rule is the right carrier
- Issue #139 — the over-claiming rule message named above
