---
title: A failing test is fixed in the code under test, never by weakening, emptying or deleting the test
applies_when:
  - a test fails after a change
  - a diff edits an assertion, an expected value or a test file's scenarios, or deletes a test
  - deleting or replacing a Feature scenario that pins a third party, a decoder or the implementation
tags: [testing, assertions, weakened-tests, deletion]
---

Never turn a red test green by loosening what it asserts (an exact value to a partial match or a containment matcher, a named error to a broader one), widening a tolerance or time bound, narrowing the inputs a property draws, rewriting it so it cannot fail (an expected value computed by the code under test, a Then that asserts nothing), or deleting a test, a scenario or a test file.

A change that removes a test that proves a behaviour of our system either removes that behaviour, or adds in the same change a test CI runs that proves the same behaviour through the consumer's entry.

A Feature scenario whose Then reads only a third party's wire format, a stand-in's received requests, a configuration decoder's output or literals copied from the implementation proves no behaviour of our system. It is deleted with no replacement. Each scenario is judged on its own: a scenario in the same file whose Then reads a consumer outcome (the person is told the reply was interrupted; the caller gets a refusal) is our behaviour, and is rewritten in the consumer's or the port's terms, never deleted with its neighbours. A decoder or layer with logic of its own keeps its unit or property test in src/. A test offered in place of a deleted one is reviewed as a new behaviour test, and one that re-pins the deleted assertions is rejected. This clause never turns a red test green: the test is deleted while it passes, or fixed first.

Decision: for each edited or deleted assertion in the diff, the judge asks whether some wrong behaviour the old test caught would now pass. If yes, and the behaviour was ours and is still shipped, the change is rejected. An uncertain case escalates.

Defect it prevents: the suite stays green while the behaviour it guarded breaks; or a pseudo-behaviour test is kept alive by rewriting it instead of deleting it.

```diff
// WRONG: the failure is hidden, not fixed
- expect(s.total).toBe(1_250)
+ expect(s.total).toBeGreaterThan(0)
// WRONG: a deleted vendor-request test replaced by a Feature that re-pins the same request
+ Then('the order is paid')((s, expect) => expect(peer.received[0].body.capture).toBe(true))
```

```diff
// RIGHT: the code is fixed and the exact assertion stays
  expect(s.total).toBe(1_250)
// RIGHT: a test that only pinned the provider's request shape is deleted with no replacement
```

Source: Kent C. Dodds, Testing Implementation Details (https://kentcdodds.com/blog/testing-implementation-details): false positives, a test that does not fail when it should.

Gate: judge
