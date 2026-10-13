---
title: A refusal property is written only for a boundary no consumer can observe, and judged by an oracle the schema did not produce
applies_when:
  - adding a check, pattern, bound, or brand refinement to a schema
  - deciding whether a refined schema's rejection boundary needs its own test
  - reviewing a property that decodes values against a schema
tags: [schema-laws, refusals, negative-testing, refinements, oracles]
---

A refinement's refusal is behaviour, and behaviour is proven where it is observed. When a decider, workflow, or public entry receives the raw value and can be driven with one the refinement refuses (a handler answering 400, a workflow rejecting a command), its own test proves the refusal through that consumer. Sometimes no consumer can see it: every consumer receives the refined Type, and the only way in is constructing or decoding the schema itself. Then a refusal property on the schema is the only place the boundary is checked.

A property that draws its inputs from the refined schema cannot see the boundary. Its arbitrary is built from the refinement under test, so a widened refinement still accepts every draw. `docs/solutions/design-patterns/generated-schema-laws-are-tautological.md` records the case: every `S.pattern` mutant in hex-schema survived such properties.

## Rule

Write a refusal property only when no decider, workflow, or public behaviour that consumes the refined value can observe the refusal; otherwise prove the refusal through that consumer. A refinement on its own does not call for a refusal property. When one is written:

- Draw candidates from the **unrefined base type** (`S.Finite`, `S.String`), never from the refined schema.
- Compare the decode verdict against a predicate written from the domain contract, not copied from the refinement.
- Append the boundary seeds (`-1`, `0`, the maximum, `NaN`, infinities, the empty string) to every draw so the edges are always exercised.
- Place it where the test-placement lint (`@systemfsoftware/oxlint-plugin-test-discipline`, `no-test-file-in-src`) sends a test of what it exercises. This rule does not choose the file.

```ts
// WRONG: drawn from the refined schema, so a widened refinement still accepts every draw.
it.prop('∀n_Amount_=Decode', { of: [Amount], subject: amountDecodes }, (subject, [value]) => subject(value))

// RIGHT: drawn from the unrefined base, plus seeds, against an independent predicate.
const seeds = [-1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 0]
const nonNegativeFinite = (n: number): boolean => Number.isFinite(n) && n >= 0
const amountDecodes = (n: number): boolean => Result.isSuccess(S.decodeResult(Amount)(n))

it.prop(
  '∀n_AmountRefusal_≡NonNegative',
  { of: [S.Finite], subject: amountDecodes },
  (subject, [value]) => Arr.every(Arr.append(seeds, value), (n) => subject(n) === nonNegativeFinite(n)),
)
```

Working example: `packages/discern/src/Budget.schema.ts`. Its `Limited` count reaches the budget decider only as an already-refined `BudgetLimit` (`admit-budget-charge.workflow.ts`), and the public entry `Discern.Model.Limited.make` is the schema's own constructor, so the refusal is observable only by constructing or decoding `Limited`. A schema's own constructor or decoder is not a consumer: it produces the refined Type rather than acting on the refused value.

Gate: `review`. The reviewer names the consumer that cannot observe the refusal and the contract the predicate came from. Can-fail evidence is an observed red, named by run or mutant id: a generated-input property run that failed, a mutant the property kills in the latest main CI Mutation report (available only when that run mutated the file holding the refinement), a throwaway deliberate-red CI change, or a new test run red on the real pre-fix commit; otherwise the change states `red not shown`. Never apply a mutant by hand (REPO-D3).
