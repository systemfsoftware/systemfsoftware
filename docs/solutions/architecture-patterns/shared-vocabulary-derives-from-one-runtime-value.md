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

Three packages outside the description now derive their whole behaviour from that one value: a FastCheck arbitrary that generates random-but-valid descriptions as the interpreter's property oracle, a generator that emits a type-test suite, and an oxlint rule that decides which calls a pure phase body may make. A fourth — two rules in the executor lint plugin — held hand-written copies of the same five axes until they were rewired.

## Guidance

**A vocabulary several packages must agree on is either one value every package derives, or N restatements that drift.** Restated, it has N places to change and no observer: each copy is internally consistent, so nothing fails until two copies decide the same question differently, and by then the disagreement is load-bearing. Derived, it has one place to change and the walk is the observer — a consumer's output changes because the value changed, and it stays correct because it read the change rather than being told about it.

**Derivation is a falsifiable property, not an aspiration, and one experiment tests it.** Add one element where the value is built, then require every consumer to stay green _while changing its output_. Green with unchanged output means the element never reached that consumer — it is reading something else. Failure means the consumer was never derived: it carried a copy that the new element contradicted. The experiment is worth committing as a probe, because the claim decays silently otherwise.

**A derived checker validated only against fixtures the same walk produced cannot fail.** If the walk is wrong it is wrong in both the checker and its fixture, and they agree. So exactly one restatement must survive, as an independent oracle whose job is to disagree, and it belongs in the package that owns the value — beside the constructors it checks, never in a consumer. Every consumer must then be clean of axis literals, which is a countable property: a census for the phase names across each consumer's own sources returns zero, and a non-zero count names the smuggled copy. Scope the census to words the vocabulary actually owns. A word that also names something else — a cell-file taxonomy sharing a noun with the I/O classification — will recur for its own reasons, and counting it as a copy trains the reader to ignore the census.

**The build graph, not taste, decides how a consumer derives.** A direct import is the cheapest carrier and the first choice. Where a direct edge closes a cycle, the derivation must arrive as a committed generated module plus a gate that re-renders it from a fresh walk and fails on any differing byte — and the generator then cannot live in either package, because acquiring the import is the thing the cycle forbids. A root script with an explicit source-path import mapping is what remains.

## Why This Matters

The five axes are not decoration. Phase purity decides what a lint rule forbids; phase order decides what a type test asserts; the I/O classification decides which calls count as effects and therefore what enforcement reaches. A silent divergence in any one of them changes what is actually protected while every check stays green — the failure mode is not a broken build but a gate that has quietly stopped covering a case, discovered when something ships through the hole.

Restatement also has a cost that compounds in the wrong direction: each new consumer makes the next vocabulary change more expensive, because the change is now N edits and N reviews. Derivation inverts that. A sixth phase is one edit in the package that owns the phases, and every consumer republishes itself.

## When to Apply

Apply it when a vocabulary is load-bearing for correctness across a package boundary — when two packages must decide the same question the same way, and nothing in either package's type system makes disagreement impossible.

Do not apply it when one package owns every consumer and the imports are acyclic. There, a direct import and the ordinary type system are cheaper, and a walk plus a generated artifact plus a gate is apparatus with nothing to protect. The tell that the pattern is earned is the boundary itself: a direct edge that closes a cycle means the generated-module-and-gate is not ceremony but the only derivation the graph permits.

Count the cost before paying it. Each consumer that cannot import needs a generated artifact; each artifact needs a gate; the propagation claim stays honest only while its probe remains runnable; and the deliberate oracle reads as duplication to a reviewer who will try to delete it. Every piece has an obvious reading in which it is waste, which is why each one needs its reason written next to it. The gate is also real accretion against a fixed false-positive budget, so it earns its place only because the thing it catches — a vocabulary that no longer describes the value — is invisible to every other check in the chain.

## Examples

**The propagation measurement.** A committed probe, registered as local tooling in the script-provenance manifest and wired into no chain, applies either propagation change one half at a time and reverts it byte-for-byte. The phase half authors one real sixth phase — a second pure validation with the fatal `either-fail` convention — entirely inside the description module; the I/O half admits one more cell into the classification. With the sixth phase retained, all three derived consumers stayed green with a phase they had never seen, and their output changed: the generated type-test suite absorbed it, and the executor plugin's generated pure-phase set gained it from the walk alone. The only failures were inside the description package — its own hand-written oracle, its API golden, and its type spec. Those failures are the design: the oracle is supposed to disagree and the goldens are supposed to be regenerated. The I/O half changed one file and propagated into the generated suite with the whole chain green. Both halves are re-runnable, which is the only reason either claim is still worth reading.

**The independent oracle.** The description package's integration suite carries a scenario named _The exported vocabulary is the one the constructors build_, whose expected phase list is written out by hand. The comment above it states the anti-circularity requirement directly: the vocabulary is written out so the derivation has something to disagree with, and it fails if the canonical description stops covering a phase, if the fold drops one, or if someone replaces the fold with a literal that then drifts. In the same file, assertions on the module name and the I/O classification are deliberately identity comparisons against the exported constants rather than a third copy of the literals — they check that the fold _carries_ what the constructors wrote instead of rebuilding it.

**The cycle that decided the carrier.** Importing the description into the executor lint plugin was measured, not assumed: with the dependency added, turbo reports a cyclic dependency running `effect-executor -> effect-cell-types -> effect-gherkin-spec -> oxlint-config -> effect-dmmf -> effect-executor`, and names the plugin's own import of the description — the edge just added — as the only breakable one. Every other edge in that chain exists in the tree for its own reasons, which is what leaves exactly one candidate. The plugin cannot import the description because the description's own lint config extends an aggregate that depends on the plugin. The resolution is a root Deno guard that walks `Cell.vocabulary` and renders a generated module exporting `DESCRIPTION_SOURCE`, `PURE_PHASES`, `IO_CELLS`, `IO_SOURCES` and `DESCRIPTION_METHODS`; `pnpm vocabulary:executor` writes it and `pnpm check:executor-vocabulary` re-renders and compares, observed red on a hand edit to the committed file and green after regeneration. The guard needs its own Deno config with `nodeModulesDir: "manual"` and an explicit mapping from the package specifier to the description's source file, because nothing under the repo's script directory declares workspace dependencies — and a root script acquiring one would close the same cycle it exists to break.

**The rule that reads its vocabulary at load.** The cell-vocabulary plugin's rule derives `PURE_PHASE_NAMES` from `Cell.vocabulary.byKind.pure`, `MODULE_SOURCE` from `Cell.vocabulary.module`, and its I/O names from `Cell.vocabulary.ioCells`. Nothing in the rule names a phase. Reclassifying a cell in the description changes what the rule forbids, with no edit in the plugin.

## Related

- `docs/solutions/build-errors/turbo-build-cycle-from-self-hosted-devdeps.md` — same problem class, a circular turbo build graph closed by a workspace dependency; the gated generated module is a third remedy beside its path-loading and plugin-override.
- `docs/solutions/design-patterns/generated-schema-laws-are-tautological.md` — the mirror principle: an instrument whose inputs are pre-validated by the code it checks cannot fail, which is why the hand-written oracle here is mandatory rather than redundant.
- `docs/solutions/build-errors/stale-api-report-outlives-toolchain.md` — the regenerate-and-compare gates used here return a stale pass unless the comparison stays uncached.
- `docs/solutions/architecture-patterns/constraint-reaches-only-via-window-or-gate.md` — the gate mechanism these drift checks instantiate, including why a gate must sit outside the judged party's write scope.
- `docs/solutions/architecture-patterns/constructor-rule-boundary.md` — when chaining constructors are earned; they are what build the single value every consumer walks.
- `docs/solutions/tooling-decisions/rule-admission-severity-and-accretion.md` — the accretion budget a new gate spends, and what it must catch to be worth it.
