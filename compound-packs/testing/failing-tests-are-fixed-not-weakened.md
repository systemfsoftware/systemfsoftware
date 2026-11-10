---
title: A failing test is fixed in the code under test, never by weakening, emptying or deleting the test; a package that cannot be specified is removed or redesigned
applies_when:
  - a test fails after a change
  - a diff edits an assertion, an expected value or a test file's scenarios, or deletes a test
  - deleting a package's behaviour tests, test configuration or test target
  - deleting or replacing a Feature scenario that pins a third party, a decoder or the implementation
tags: [testing, assertions, weakened-tests, deletion, package]
---

Never turn a red test green by loosening what it asserts (exact value to partial or containment match, a named error to a broader one), widening a tolerance or time bound, narrowing the inputs a property draws, rewriting it so it cannot fail, or deleting a test, scenario or test file.

A change that removes a test proving a behaviour of our system either removes that behaviour or adds, in the same change, a test CI runs that proves it through the consumer's entry. Where that test is an effect-e2e test effect-e2e cannot yet express, the change deletes the fake and names the behaviour left uncovered and the effect-e2e work it waits for (e2e-testing pack: e2e-is-its-own-package-on-real-processes.md); it never keeps the fake as a placeholder.

A scenario whose Then reads only a third party's wire format, a configuration decoder's output or literals copied from the implementation proves no behaviour of ours: delete it with no replacement, while it passes. A Then over what a stand-in received (a third party's stand-in's wire-level record, or an inline stub's record that no contract suite runs) is deleted with question 4 (features-specify-our-systems-observable-behaviour.md); when its When drove the consumer entry, what our system sent is a behaviour of ours, and the same change replaces it with the same Then over the port's contract-suite fake's read operation, which is a consumer outcome: what our system sent through one of its own outbound ports, read in the port's terms. Judge each scenario on its own: one whose Then reads a consumer outcome is our behaviour and is rewritten in the consumer's terms, not deleted with its neighbours.

When a package's tests are deleted because they break this pack, either remove the package and every caller's use of it, or redesign it so Features can specify its behaviour through its published surface, with the first slice in the same change. A package left with no tests, no test configuration or no test target and no Feature in their place is not done, except when its only replacement is an effect-e2e test that cannot yet be expressed: the change then names each behaviour left uncovered and the effect-e2e work it waits for, as the second paragraph requires.

```diff
// WRONG: the failure is hidden, not fixed
- expect(s.total).toBe(1_250)
+ expect(s.total).toBeGreaterThan(0)
```
