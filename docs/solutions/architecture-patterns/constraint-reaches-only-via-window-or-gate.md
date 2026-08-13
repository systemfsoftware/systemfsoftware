---
title: A constraint binds only by occupying the window or gating the emission
date: 2026-08-13
category: architecture-patterns
module: repo-wide enforcement and harness doctrine
problem_type: architecture_pattern
component: development_workflow
severity: high
applies_when:
  - adding a rule, gate, doc, or convention meant to change what an author writes
  - auditing whether existing doctrine still reaches anyone
  - a check reports green and it is unclear whether it examined anything
  - deciding whether a constraint needs a gate or only a place to be written down
tags:
  - constraint-delivery
  - enforcement
  - gates
  - write-scope
---

# A constraint binds only by occupying the window or gating the emission

## Context

Doctrine, rules, and conventions accumulate in a repository faster than anyone verifies they reach the work. The load-bearing question behind any enforcement apparatus is therefore not "is this true of the codebase" but "does this change what an author writes." A rule registered in a shared plugin, a policy stated in a doc, and a gate declared in a config all look load-bearing from the outside, and none of them reveals by its existence whether it ever touches the writing act. This principle names the only two ways a constraint can reach that act, so any constraint can be audited by asking which of the two carries it.

## Guidance

Stated as law:

> A constraint changes what an author writes only through a mechanism active at the writing act: it occupies the **window** the author reads, or it **gates** the emission. A constraint true of the codebase and present in neither changes nothing.

There are exactly two mechanisms, and they are exhaustive:

- **Window** — the constraint is present in the reading surface the author actually loads: the instruction file pulled into context, the rule text surfaced in the editor, the message a tool prints back.
- **Gate** — the constraint fails a command that runs as part of emission, so a violating emission is rejected.

Everything else is decoration. A constraint true of the codebase but present in neither mechanism can be deleted with no observable effect, because nothing was ever reading it and nothing was ever rejecting anything on its account.

This is a derivation over measured atoms rather than an assertion: the premise rests on an external constrained-decoding measurement (SynCode, arXiv:2403.01632) about what actually alters an emission. One honest caveat travels with it — the reach of the two mechanisms does not multiply into a single score; the source establishing the premise explicitly forbids treating it as a product, so use the two mechanisms as a checklist, never as a metric.

Two sharpening results follow, and the second carries a status worth preserving:

- **A gate inside the author's effective write scope does not bind that author.** A gate binds only from outside the surface the judged party can edit. If the author can weaken the threshold, widen the ignore list, or delete the check in the same change the gate is supposed to reject, the gate has no power over that author.
- **An index key whose assignment nothing verifies drifts, and a drifted key retrieves the wrong doctrine at the writing act — worse than retrieving none.** This one is _empirical, not derived_: it is an observed behaviour, not a theorem. Retrieving nothing leaves the author looking; retrieving the wrong rule leaves the author confident.

## Why This Matters

Both mechanisms can fail without producing a complaint, which is why the absence of one is never evidence of reach.

A rule no config opts into still appears installed — the plugin loaded, the rule registered, nothing errored. A doc no context loads still reads as policy — correctly worded, on the shelf, never seen. A check whose pattern matches nothing has simply stopped examining anything, and whether that is loud is an accident of the tool: some runners treat an empty match as a clean pass, others abort. Nothing about the _loss_ of reach guarantees a complaint, so "it is written down" and "it is enforced" stay separate questions and only the second binds.

Worse, a loud complaint does not guarantee reach is restored. The cheapest way to silence a tool that aborts over an empty pattern is to delete the pattern, which ends the noise and the enforcement together. So the audit is needed in both directions: a constraint can rot quietly — its opt-in never granted, its key drifted onto the wrong payload — and a constraint can also be retired by whoever was trying to make the build green.

## When to Apply

Run this when adding **any** constraint — lint rule, gate, doc, convention, or index key:

- **Name the mechanism.** Window or gate. If neither can be named, no constraint has been added.
- **Show it reaching a real subject.** A file the glob actually matches, a package whose config actually opts in, a context that actually loads the text. Prove the non-empty match; do not infer it from a green run.
- **Put the gate outside the write scope of whoever it judges.** A threshold, glob, or ignore list the judged party can edit in the same change binds no one.
- **Verify the key the constraint keys on.** If a suffix, tag, or path decides which doctrine applies, something must check that assignment, or the key will drift and serve the wrong rule.

Skip the checklist for a constraint deliberately left advisory — but then state it as advisory. The hazard is not advisory doctrine; it is doctrine written and priced as binding while satisfying neither mechanism.

## Examples

Three instances, each with the mechanism that failed and the reason nothing complained.

**Registration is not delivery — the gate never reached.** A rule registered in a shared lint plugin reaches only the packages whose own config extends it. Registration is a green operation, so the rule reads as installed repo-wide while binding a subset. The root `AGENTS.md` carries the invariant and names its check: "Registration is not delivery — a rule reaches only the packages that opt in. Gate: `pnpm check:lint-coverage`, which also defines the production/tooling boundary — never re-derive it by hand." The **gate** mechanism was the one that failed: the rule existed but was not active at the emission of any author outside the opted-in set. Nothing complained because a registered-but-undelivered rule is indistinguishable from a delivered one by inspection of the plugin alone.

**A rename emptied a mutation glob — the gate lost its subject.** Three files renamed from `*.workflow.ts` to `*.kernel.ts` fell out of a mutation glob written as `src/**/*.workflow.ts`, so the observer those files had been under no longer selected them. This instance failed _loudly_: the mutation runner aborts rather than passing when its pattern matches no files. But the abort was resolved by deleting the configuration, which ended the error and the observer together — the package now carries no mutation gate at all, and because a `kernel` cell is forbidden from a mutation glob by the scope guard, the replacement observer those files need is a different instrument that was never granted. Filed as issue #138, still open. The **gate** failed by losing its subject: the key it matched on was reassigned by a rename with no reason to think about the glob.

**A rule message asserted what its check cannot decide — the window taught a falsehood.** A lint rule whose check examines a single file at depth 0 emitted a message claiming a property of the whole program. The gate itself was sound; it rejected the token it found. The **window** was the failing mechanism: the text the author reads asserted a stronger claim than the check established, so every future reader learns a rule the tool never verified. Filed as issue #139. Nothing complained because an over-claiming message still fires correctly on the narrow thing it does detect.

## Related

- `docs/solutions/architecture-patterns/constructor-rule-boundary.md` — the same reach question one level down — which observer can see a given cell property, and why a type and a rule are complementary rather than substitutes
- `docs/solutions/logic-errors/shared-ast-helper-vacuums-its-consumers.md` — a gate that ran and reported success while its subject had been emptied underneath it
- `docs/solutions/architecture-patterns/provenance-ritual-gates.md` — a gate that checks form is a ritual: it occupies the gate slot without deciding the property it appears to decide
- `docs/solutions/tooling-decisions/rule-admission-severity-and-accretion.md` — `warn` severity is silence to an agent — a rule at `warn` satisfies neither mechanism
- `docs/solutions/integration-issues/comment-checker-hook-silently-bypasses-on-patch-mode-edit.md` — a skip indistinguishable from a pass — the emission was never gated
- Issue #138 — the emptied mutation glob; the gate-lost-its-subject instance above.
- Issue #139 — the over-claiming rule message; the window instance above.
