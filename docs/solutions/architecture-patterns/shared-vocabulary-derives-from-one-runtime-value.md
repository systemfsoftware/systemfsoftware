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

`@systemfsoftware/effect-cell-types` publishes a set of chaining phase constructors — `Cell.read`, `Cell.decode`, `Cell.decide`, `Cell.encode`, `Cell.write` — whose return types admit only one order, a description value `Cell.canonical` built through them, and `Cell.vocabulary`, a fold over that value carrying `module`, `ioCells`, `phases`, `byKind` and `applier`. Five axes come off the fold as data: the phase names, their purity, their intra-layer order, the owning module name, and the I/O-cell classification.

Three packages outside the description derive their whole behaviour from that one value, and naming them beats counting them, because an enumeration decays quietly: a FastCheck arbitrary that generates random-but-valid descriptions as the interpreter's property oracle, and two oxlint rule plugins, `cell-vocabulary` deciding which calls a pure phase body may make and `effect-executor` requiring the description at all.

## Guidance

**A vocabulary several packages must agree on is either one value every package derives, or N restatements that drift.** Restated, it has N places to change and no observer: each copy is internally consistent, so nothing fails until two copies decide the same question differently, and by then the disagreement is load-bearing. Derived, it has one place to change and the walk is the observer — a consumer's output changes because the value changed, and it stays correct because it read the change rather than being told about it.

**Derivation is a falsifiable property, not an aspiration, and one experiment tests it.** Add one element where the value is built, then require every consumer to stay green _while changing its output_. Green with unchanged output means the element never reached that consumer — it is reading something else. Failure means the consumer was never derived: it carried a copy that the new element contradicted. Run the experiment before believing the derivation. Whether to keep a scripted form of it is a separate call with a real cost on both sides: a committed probe keeps the claim re-runnable, and it is one more artifact whose anchors rot against the module it patches. This repository ran the experiment and did not keep the script, so the measurement below is dated rather than repeatable — which is the honest consequence, not a defect to paper over.

**A derived checker validated only against fixtures the same walk produced cannot fail.** If the walk is wrong it is wrong in both the checker and its fixture, and they agree. So exactly one restatement must survive, as an independent oracle whose job is to disagree, and it belongs in the package that owns the value — beside the constructors it checks, never in a consumer. Every consumer must then be clean of axis literals, which is a countable property: a census for the phase names across each consumer's own sources returns zero, and a non-zero count names the smuggled copy. Scope the census to words the vocabulary actually owns. A word that also names something else — a cell-file taxonomy sharing a noun with the I/O classification — will recur for its own reasons, and counting it as a copy trains the reader to ignore the census.

**The build graph, not taste, decides how a consumer derives.** A direct import is the cheapest carrier and the default choice. When an oxlint plugin imports the description directly, it must be delivered consumer-side via `jsPlugins` (e.g. `OX-DL1`), rather than aggregated through `@systemfsoftware/oxlint-plugin-effect-dmmf` or declared as a dependency in `@systemfsoftware/oxlint-config` — which would close a cyclic build dependency.

## Why This Matters

The five axes are not decoration. Phase purity decides what a lint rule forbids; phase order decides what a type test asserts; the I/O classification decides which calls count as effects and therefore what enforcement reaches. A silent divergence in any one of them changes what is actually protected while every check stays green — the failure mode is not a broken build but a gate that has quietly stopped covering a case, discovered when something ships through the hole.

Restatement also has a cost that compounds in the wrong direction: each new consumer makes the next vocabulary change more expensive, because the change is now N edits and N reviews. Derivation inverts that. A sixth phase is one edit in the package that owns the phases, and every consumer republishes itself.

## When to Apply

Apply it when a vocabulary is load-bearing for correctness across a package boundary — when two packages must decide the same question the same way, and nothing in either package's type system makes disagreement impossible.

Do not apply it when one package owns every consumer and the imports are acyclic. There, a direct import and the ordinary type system are cheaper, and a walk plus an intermediary is apparatus with nothing to protect.

Count the cost before paying it. A direct import is preferred whenever possible. When a plugin depends on the description, keeping the graph acyclic requires consumer-side plugin delivery rather than aggregate re-exports. The deliberate oracle reads as duplication to a reviewer who will try to delete it, so its reason must be recorded next to it.

## Examples

**The propagation measurement, taken once.** The experiment: author one real sixth phase — a second pure validation with the fatal `either-fail` convention — entirely inside the description module, and separately admit one more cell into the I/O classification. With the sixth phase retained, every derived consumer stayed green with a phase it had never seen, and its output changed: the generated type-test suite absorbed it, and each plugin's pure-phase set gained it from the walk alone. The only failures were inside the description package — its own hand-written oracle, its API golden, and its type spec. Those failures are the design: the oracle is supposed to disagree and the goldens are supposed to be regenerated. The I/O half changed one file and propagated with the whole chain green. This is a dated record, not a re-runnable check: the scripted form of the experiment was removed along with the generated-vocabulary apparatus it was built beside, so repeating it means performing the edit by hand and reading which packages fail.

**The independent oracle.** The description package's integration suite carries a scenario named _The exported vocabulary is the one the constructors build_, whose expected phase list is written out by hand. The comment above it states the anti-circularity requirement directly: the vocabulary is written out so the derivation has something to disagree with, and it fails if the canonical description stops covering a phase, if the fold drops one, or if someone replaces the fold with a literal that then drifts. In the same file, assertions on the module name and the I/O classification are deliberately identity comparisons against the exported constants rather than a third copy of the literals — they check that the fold _carries_ what the constructors wrote instead of rebuilding it.

**The cycle, and what dissolving it cost.** Importing the description into the executor lint plugin closes a cycle while the plugin is delivered through an aggregate: `effect-executor -> effect-cell-types -> effect-gherkin-spec -> oxlint-config -> effect-dmmf -> effect-executor`. Two carriers answer it. A committed generated module plus a byte-comparison gate keeps the aggregate intact and buys an extra artifact, an extra gate, and a build step. Removing the aggregate's edge and delivering the plugin from each consuming package's own `jsPlugins` (`OX-DL1`) buys a real import — no artifact, no gate, no generated file — and pays for it somewhere less obvious: the aggregate used to make delivery automatic, so forgetting it was impossible, and afterwards forgetting it is merely invisible. A package that grows a cell whose rules arrive consumer-side simply does not get them, and nothing fails.

That is the part worth carrying away. Neither carrier is free, and the second one's cost is not visible in the diff that introduces it — it shows up later, in a package nobody has written yet. So a consumer-side carrier is only honest once something fails when the delivery is missing: here, the lint-coverage guard grew a positive check that a package owning a consumer-delivered cell also loads that cell's plugin, observed failing when one consumer's entry is removed. Trading a drift gate for a delivery gate is a fair trade; trading a drift gate for a convention is not.

**The rules that read vocabulary at load.** Both the `cell-vocabulary` and `effect-executor` plugins derive their pure-phase set from `Cell.vocabulary.byKind.pure`, their description module from `Cell.vocabulary.module`, their I/O names from `Cell.vocabulary.ioCells`, and their method list from `Cell.vocabulary.phases` plus `applier`. No rule decides on a phase-name, kind or order literal, and the sentences the messages hand a reader are interpolated from the same walk — a fix message that spelled the chain would keep promising five phases after the description grew a sixth. Reclassifying a cell or adding a phase changes what the rules forbid and what their messages say, with no edit in either plugin.

## Related

- `docs/solutions/build-errors/turbo-build-cycle-from-self-hosted-devdeps.md` — same problem class, a circular turbo build graph closed by a workspace dependency; removing the aggregate's edge and delivering the plugin consumer-side is a third remedy beside its path-loading and plugin-override.
- `docs/solutions/design-patterns/generated-schema-laws-are-tautological.md` — the mirror principle: an instrument whose inputs are pre-validated by the code it checks cannot fail, which is why the hand-written oracle here is mandatory rather than redundant.
- `docs/solutions/build-errors/stale-api-report-outlives-toolchain.md` — the regenerate-and-compare gates used here return a stale pass unless the comparison stays uncached.
- `docs/solutions/architecture-patterns/constraint-reaches-only-via-window-or-gate.md` — the gate mechanism these drift checks instantiate, including why a gate must sit outside the judged party's write scope.
- `docs/solutions/architecture-patterns/constructor-rule-boundary.md` — when chaining constructors are earned; they are what build the single value every consumer walks.
- `docs/solutions/tooling-decisions/rule-admission-severity-and-accretion.md` — the accretion budget a new gate spends, and what it must catch to be worth it.
