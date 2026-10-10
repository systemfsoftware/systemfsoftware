---
title: A surviving mutant is killed by a property whose expected value comes from the contract the mutant breaks
applies_when:
  - a mutation report lists a surviving mutant and a test is about to be written for it
  - the same kind of survivor recurs across sibling files
  - reviewing a test added to kill a reported mutant
tags: [mutation-testing, survivors, oracles, property-testing, stryker]
---

A surviving mutant means a behaviour changed and no test noticed. Stryker reports it as "You're missing a test for it" (mutant-states page, https://stryker-mutator.io/docs/mutation-testing-elements/mutant-states-and-metrics/). The report names what went unchecked. It does not say what the check should compare against.

A test that restates the mutated expression kills the mutant and checks nothing else. It fails on every rewrite of the implementation and stays green when the behaviour is wrong in a way the expression shares. Google's mutation work names this the change-detector test: it tests "the current implementation rather than the specification" and causes "brittle tests and false alarms" (Petrović, Ivanković, Fraser, Just, "Practical Mutation Testing at Scale", arXiv:2102.11378, §1).

## Rule

Kill a survivor with a property whose expected value comes from the domain contract the mutant breaks, never from the expression the mutant changed:

- State the contract clause the mutant violates (an alphabet, a bound, a refusal, an ordering) independently of the code under test (CONST-T10).
- Draw the property's inputs from that contract, including the inputs the contract refuses.
- When the same survivor recurs across sibling files, read the cluster as a circular oracle: the existing tests take their expected values or inputs from the code under test. Adding more tests of the same kind will not kill it.

```ts
// WRONG: systemfsoftware/systemfsoftware cca5f66e8e:packages/hex-schema/src/hex-string.schema.ts:10-12
// The round-trip laws draw inputs from this arbitrary, which restates the pattern.
// Widening the pattern widens the generator with it, so every S.pattern mutant survived (package score 55.95%).
S.pattern(/^(0x)?[0-9a-fA-F]*$/),
S.annotations({
  arbitrary: () => (fc) => fc.stringMatching(/^(0x)?[0-9a-fA-F]*$/),

// RIGHT: systemfsoftware/systemfsoftware b5cf2e1d23:packages/hex-schema/src/hex-string.schema.ts:66-73
// The contract: a character outside the hex alphabet is refused, however the regex is rewritten.
const decodeHexString = S.decodeUnknownEither(HexString)
const hexPart = fc.stringMatching(/^[0-9a-fA-F]*$/)

it.prop(
  '∀s_HexStringAlphabet_⊥',
  [fc.tuple(hexPart, fc.constantFrom('g', 'z', '!', ' ', '-'), hexPart)],
  ([[head, outsider, tail]]) => Either.isLeft(decodeHexString(`${head}${outsider}${tail}`)),
)
```

The incident is recorded in `docs/solutions/design-patterns/generated-schema-laws-are-tautological.md`. For schemas, the mechanism (refusal properties beside the generated laws, drawn from the unrefined base type) is owned by `compound-packs/schema-laws/refusals-beside-generated-laws.md` and is not restated here.

Gate: `review`. The killing test's expected value traces to a contract source, not to the mutated expression. The kill itself is read off the mutant id in the next CI Mutation report, never from a local run (REPO-D3).
