---
title: "A vocabulary shared across packages must be derived from one runtime value, and the build graph decides the carrier"
date: 2026-08-15
category: architecture-patterns
module: "effect-cell-types and its derived consumers"
problem_type: architecture_pattern
component: tooling
severity: high
applies_when:
  - "adding a package that must agree with another on a phase list, purity, ordering, or an I/O classification"
  - "a direct import between two packages risks closing a dependency cycle in the build graph"
  - "auditing whether a derived consumer has smuggled a hand-written copy of a shared vocabulary"
  - "a change to a shared vocabulary should propagate to every consumer without editing them"
tags:
  - vocabulary-derivation
  - single-source-of-truth
  - build-graph
  - generated-modules
  - dependency-cycles
  - propagation
  - anti-circularity
---

# A vocabulary shared across packages must be derived from one runtime value, and the build graph decides the carrier

## Context

`@systemfsoftware/effect-cell-types` publishes a `Cell.layer` one-sandwich constructor whose interpreter is the text of `layerRunner`, and `Cell.vocabulary`, a const table carrying `module`, `ioCells`, `byKind.pure` and `composer`. Order is deliberately absent from the table — it is the interpreter's body, and nothing restates it. The table carries only what a rule cannot read off a type: purity, the owning module name, and the I/O-cell classification.

Packages outside the description derive their behaviour from that one value, and naming them beats counting them, because an enumeration decays quietly: the `cell-vocabulary` lint plugin deciding which calls a pure phase body may make, and every consumer whose runtime or messages name the module or the I/O surface.

## Guidance

**A vocabulary several packages must agree on is either one value every package derives, or N restatements that drift.** Restated, it has N places to change and no observer: each copy is internally consistent, so nothing fails until two copies decide the same question differently, and by then the disagreement is load-bearing. Derived, it has one place to change and the walk is the observer — a consumer's output changes because the value changed, and it stays correct because it read the change rather than being told about it.

**Derivation is a falsifiable property, not an aspiration, and one experiment tests it.** Add one element where the value is built, then require every consumer to stay green _while changing its output_. Green with unchanged output means the element never reached that consumer — it is reading something else. Failure means the consumer was never derived: it carried a copy that the new element contradicted. Run the experiment before believing the derivation. Whether to keep a scripted form of it is a separate call with a real cost on both sides: a committed probe keeps the claim re-runnable, and it is one more artifact whose anchors rot against the module it patches. This repository ran the experiment and did not keep the script, so the measurement below is dated rather than repeatable — which is the honest consequence, not a defect to paper over.

**A consumer must not carry the vocabulary's own words, and the table must not carry what the types already hold.** The census is countable: a scan for phase names across each consumer's own sources returns zero, and a non-zero count names the smuggled copy that will drift. Scope the census to words the vocabulary actually owns — a word that also names something else recurs for its own reasons. The inverse holds too: a fact the compiler or the interpreter's text already states (phase order, arity, channels) never enters the table, because a table restating the text is a second declaration with no reader.

**The build graph, not taste, decides how a consumer derives.** A direct import is the cheapest carrier and the default choice. When an oxlint plugin imports the description directly, it must be delivered consumer-side via `jsPlugins` (e.g. `OX-DL1`), rather than aggregated through `@systemfsoftware/oxlint-plugin-effect-dmmf` or declared as a dependency in `@systemfsoftware/oxlint-config` — which would close a cyclic build dependency.

## Why This Matters

The facts are not decoration. Purity decides what a lint rule forbids; the I/O classification decides which calls count as effects and therefore what enforcement reaches. A silent divergence in either changes what is actually protected while every check stays green — the failure mode is not a broken build but a gate that has quietly stopped covering a case, discovered when something ships through the hole.

Restatement also has a cost that compounds in the wrong direction: each new consumer makes the next vocabulary change more expensive, because the change is now N edits and N reviews. Derivation inverts that. A reclassified phase is one edit in the package that owns the table, and every consumer republishes itself.

## When to Apply

Apply it when a vocabulary is load-bearing for correctness across a package boundary — when two packages must decide the same question the same way, and nothing in either package's type system makes disagreement impossible.

Do not apply it when one package owns every consumer and the imports are acyclic. There, a direct import and the ordinary type system are cheaper, and a walk plus an intermediary is apparatus with nothing to protect.

Count the cost before paying it. A direct import is preferred whenever possible. When a plugin depends on the description, keeping the graph acyclic requires consumer-side plugin delivery rather than aggregate re-exports.

## Examples

**The cycle, and what dissolving it cost.** Importing the description into the executor lint plugin closes a cycle while the plugin is delivered through an aggregate: `effect-executor -> effect-cell-types -> effect-gherkin-spec -> oxlint-config -> effect-dmmf -> effect-executor`. Two carriers answer it. A committed generated module plus a byte-comparison gate keeps the aggregate intact and buys an extra artifact, an extra gate, and a build step. Removing the aggregate's edge and delivering the plugin from each consuming package's own `jsPlugins` (`OX-DL1`) buys a real import — no artifact, no gate, no generated file — and pays for it somewhere less obvious: the aggregate used to make delivery automatic, so forgetting it was impossible, and afterwards forgetting it is merely invisible. A package that grows a cell whose rules arrive consumer-side simply does not get them, and nothing fails.

That is the part worth carrying away. Neither carrier is free, and the second one's cost is not visible in the diff that introduces it — it shows up later, in a package nobody has written yet. So a consumer-side carrier is only honest once something fails when the delivery is missing: here, the lint-coverage guard grew a positive check that a package owning a consumer-delivered cell also loads that cell's plugin, observed failing when one consumer's entry is removed. Trading a drift gate for a delivery gate is a fair trade; trading a drift gate for a convention is not.

**The rules that read vocabulary at load.** The `cell-vocabulary` plugin derives its pure-phase set from `Cell.vocabulary.byKind.pure`, its description module from `Cell.vocabulary.module`, its I/O names from `Cell.vocabulary.ioCells`, and its composer name from `Cell.vocabulary.composer`. No rule decides on a phase-name, purity or order literal, and the sentences the messages hand a reader are interpolated from the same import — a fix message that spelled the phase list would keep promising a shape after the table changed. Reclassifying a cell or a phase changes what the rule forbids and what its message says, with no edit in the plugin.

## Related

- `docs/solutions/build-errors/turbo-build-cycle-from-self-hosted-devdeps.md` — same problem class, a circular turbo build graph closed by a workspace dependency; removing the aggregate's edge and delivering the plugin consumer-side is a third remedy beside its path-loading and plugin-override.
- `docs/solutions/design-patterns/generated-schema-laws-are-tautological.md` — the mirror principle: an instrument whose inputs are pre-validated by the code it checks cannot fail, which is why order is asserted once over a local trace instead of being derived from the table it would compare against.
- `docs/solutions/build-errors/stale-api-report-outlives-toolchain.md` — the regenerate-and-compare gates used here return a stale pass unless the comparison stays uncached.
- `docs/solutions/architecture-patterns/constraint-reaches-only-via-window-or-gate.md` — the gate mechanism these drift checks instantiate, including why a gate must sit outside the judged party's write scope.
- `docs/solutions/architecture-patterns/constructor-rule-boundary.md` — when chaining constructors are earned; they are what build the single value every consumer reads.
- `docs/solutions/tooling-decisions/rule-admission-severity-and-accretion.md` — the accretion budget a new gate spends, and what it must catch to be worth it.
