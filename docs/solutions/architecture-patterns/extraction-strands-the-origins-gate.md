---
title: An Extraction Moves the Tests With the Code and Strands the Origin's Gate
date: "2026-08-23"
category: architecture-patterns
module: systemfsoftware
problem_type: architecture_pattern
component: testing_framework
severity: high
tags:
  - package-split
  - extraction
  - vacuous-gate
  - in-source-tests
  - empty-suite
---

# An Extraction Moves the Tests With the Code and Strands the Origin's Gate

## Problem

Splitting `@systemfsoftware/effect-schema-law` down to its namesake export left the origin package with **zero tests**, and its own doctrine went on citing the package's `test` command as the check for both codec laws. The command still exited 0. It was running nothing.

The extraction was correct: `refutes`, `scanObligations` and the weakening chain left the module, `boundedUnion` went to its own package, and `ruleOfSchemas` stayed. What nobody wrote down is that under an in-source test convention, **a module's tests are bytes inside the module**, so a file move is simultaneously a test move — and the surviving export's coverage was never in its own module at all. It rode along in a sibling that left. Where the departed code lands does not soften this: two of the three later came back as a second entry on the same package, and the origin's gate was already empty by then.

## Failure mechanics

1. **Coverage was extrinsic to the symbol it covered.** `ruleOfSchemas` was exercised only as a side effect: a fixture inside the refusal module's in-source block called it once. No in-source block ever lived beside `ruleOfSchemas` itself. Coverage of a symbol residing in a _different_ module than the symbol is invisible to any per-module reasoning about a move.

2. **The boundary fix deleted the last caller.** The new refutation package must not depend on the law package, so that one cross-package call was deleted rather than carried across the new edge. Deleting it was right, and it was also the moment total coverage of `ruleOfSchemas` reached zero. The two facts were decided in different steps and nobody joined them.

3. **The runner reports success on the empty set.** With no matching test file and no in-source block, the runner prints `No test files found` and exits 0. Formally: for a suite $S$, `exit = 0 ⟺ ∀t ∈ S. pass(t)`. At $S = \emptyset$ the antecedent is vacuously true. A green exit code is `|S| > 0 ∧ all pass` conflated with `|S| = 0`, and nothing in the exit code distinguishes them.

4. **The doctrine cited the exit code.** Two rule blocks named that command as their `check:`. So the written law of the package pointed at a measurement that had become an identity — the strongest possible form of a gate keyed on a value its own author supplied.

## Architectural invariants

**Extraction Coverage Conservation.** For an extraction of symbols $E$ out of module $M$ leaving residue $R = M \setminus E$, the pass must establish that $R$'s verification is non-empty _after_ the move, not that the origin's command still exits 0. Test count is the observable; the exit code is not.

```
before:  cover(R) ⊆ tests(M)          -- may be located anywhere in M
after:   cover(R) ⊆ tests(R)          -- must be located in what remains
check:   |tests(R)| > 0  ∧  killed(mutate(R)) > 0
```

**A gate keyed on emptiness certifies nothing.** Any verification whose success predicate is a universal quantifier over a collection must also assert the collection is inhabited. This generalises past test suites: a linter with no matching files, a schema walk with no schemas, a coverage assertion whose refuted set is empty, and a property whose generator produces only the trivial case all pass for the same reason.

**Discriminate, then trust.** A suite earns its exit code by being shown to fail. The repair here was not "add a test" but "add a fixture the predicate must reject": a codec that decodes every input to one value, so a law that cannot say _no_ to it cannot pass. Both predicates were then inverted in turn and the suite observed red, restoring red before green.

## Code smells

- A package whose verification command is cited as doctrine while its test directory and in-source blocks are both empty.
- A rule whose `check:` names a bare command and no property of the run — no count, no named fixture, no inversion. The bare form cannot distinguish a real pass from an empty one.
- An in-source test block that constructs a fixture and calls a symbol imported from _another_ module. That call is coverage filed in the wrong place; it disappears the moment either module moves.
- A test-move plan that reasons about the _destination_ package's suite only. The origin is where the silent loss lands.
- `passWithNoTests`, or a runner default equivalent to it, in a package whose gate is load-bearing.

## Verification

Assert inhabitance and discrimination, never the exit code alone:

```
assert |tests(R)| == expected            -- inhabited, and the count is pinned
for pred in decisions(R):
    inject(negate(pred)); assert suite(R) == RED
    restore();            assert suite(R) == GREEN
```

The inversion loop is the part that transfers. It is cheap for a pure decision, it needs no mutation-testing run, and it is the only evidence that separates "the predicate holds" from "the predicate cannot fail".

## Related

- [Deleted effect-purity-law — repetition cannot observe constant-returning I/O](repetition-cannot-observe-constant-io.md) — records the same vacuous-gate observation as one cause of a package's deletion (`A green gate that runs nothing certifies nothing`). That doc treats it as a symptom of an unused package; this one names the mechanism that manufactures it in a _healthy_ package, so the two do not compete: prefer this document when reasoning about an extraction, and that one when judging whether a package still earns its place.
- [A Label-Routed Rule Cannot Fail On The Case It Targets](label-routed-rules-are-unfalsifiable.md) — the sibling unfalsifiability shape, keyed on a label rather than on emptiness.
