---
title: A surviving mutant is killed by a test that asserts the contract clause it breaks, or its code is deleted because nothing reads it
applies_when:
  - a mutation report lists a surviving mutant in a *.workflow.ts file
  - deciding whether the code a survivor sits in is dead or the mutant is equivalent
tags: [testing, mutation, survivors, stryker]
---

A survivor is killed by a test that asserts the contract clause the mutant breaks, in the workflow's `<stem>.workflow.property.test.ts` (a unit or property test in src/, inside the module or under src/**tests**, never under tests/, and it builds no Feature) or a behaviour test through the public entry; its expected value follows expected-values-come-from-the-requirement.md and never restates the mutated expression.

Code is deleted only when nothing reads it at runtime; never empty a map, drop a field or remove an operand a reader consumes to make a mutant disappear. An equivalent mutant on live code is removed by rewriting the code so the mutant cannot occur.

Never clear a survivor with a Stryker disable comment, an excluded mutator, an ignorer, a baseline, an allowlist, an accepted-survivor record or a thresholds value in a package's Stryker config.

Decision: for each survivor the diff addresses, the judge finds a new assertion that fails on the mutant and names a contract clause, or a deletion whose code has no runtime reader, or a rewrite that makes the mutant impossible; anything else fails. Whether code is dead or a mutant is equivalent is the judge's call; an uncertain case escalates.

Defect it prevents: a gap in the tests that coverage hides, closed on paper by silencing the report or deleting code a reader needs.

```
WRONG: survivor `amount > limit` → `true`, cleared in stryker.config.json
"mutator": { "excludedMutations": ["ConditionalExpression"] }
```

```typescript
// RIGHT: the contract says a withdrawal above the daily limit is refused
Then('a withdrawal one cent above the daily limit is refused')((s, expect) =>
  expect(s.decision).toEqual({ _tag: 'Refused', reason: 'over daily limit' })),
```

Source: Stryker Mutator documentation (https://stryker-mutator.io/docs/): "If your tests passed, the mutant survived", which means a test is probably missing; "code coverage doesn't tell you everything about the effectiveness of your tests."

Gate: judge
