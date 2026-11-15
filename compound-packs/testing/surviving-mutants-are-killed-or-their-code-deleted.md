---
title: Kill surviving mutants with contract assertions or delete dead code; never suppress mutation checks
applies_when:
  - a mutation report lists a surviving mutant in a workflow file
  - deciding whether code containing a survivor is dead or an equivalent mutant
  - adding a mutation-tool disable comment, baseline, allowlist or threshold reduction
tags: [testing, mutation, survivors, stryker]
---

Kill a surviving mutant by adding a test (in `<stem>.workflow.property.test.ts` or a Feature through the public entry) that asserts the contract clause the mutant breaks, using requirement literals (`expected-values-come-from-the-requirement.md`) rather than restating the mutated expression.

Delete code only when nothing reads it at runtime—never empty a map, drop a field, or strip an operand a reader consumes just to eliminate a mutant. Eliminate an equivalent mutant on live code by rewriting the expression so the mutant cannot arise. Never silence a survivor with a mutation-tool disable comment, excluded mutator, ignorer, baseline, allowlist, accepted-survivor record, or lowered threshold.

```typescript
// RIGHT: kills a > vs >= boundary mutant via the published contract
Then('a withdrawal one cent above the daily limit is refused')((s, expect) =>
  expect(s.decision).toEqual({ _tag: 'Refused', reason: 'over daily limit' })),
```
