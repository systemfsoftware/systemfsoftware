---
title: A surviving mutant is killed by a test that asserts the contract clause it breaks, or its code is deleted because nothing reads it
applies_when:
  - a mutation report lists a surviving mutant in a *.workflow.ts file
  - deciding whether the code a survivor sits in is dead or the mutant is equivalent
tags: [testing, mutation, survivors, stryker]
---

Kill a survivor with a test that asserts the contract clause the mutant breaks, in the workflow's `<stem>.workflow.property.test.ts` or a behaviour test through the public entry. Its expected value follows expected-values-come-from-the-requirement.md and never restates the mutated expression.

Delete code only when nothing reads it at runtime; never empty a map, drop a field or remove an operand a reader consumes to make a mutant disappear. Remove an equivalent mutant on live code by rewriting the code so the mutant cannot occur.

Never clear a survivor with a Stryker disable comment, an excluded mutator, an ignorer, a baseline, an allowlist, an accepted-survivor record or a thresholds change.

```typescript
// RIGHT: the contract says a withdrawal above the daily limit is refused
Then('a withdrawal one cent above the daily limit is refused')((s, expect) =>
  expect(s.decision).toEqual({ _tag: 'Refused', reason: 'over daily limit' })),
```
