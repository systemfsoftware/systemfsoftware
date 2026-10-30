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

A change that removes a test proving a behaviour of our system either removes that behaviour or adds, in the same change, a test CI runs that proves it through the consumer's entry.

A scenario whose Then reads only a third party's wire format, a stand-in's received requests, a configuration decoder's output or literals copied from the implementation proves no behaviour of ours: delete it with no replacement, while it passes. Judge each scenario on its own: one whose Then reads a consumer outcome is our behaviour and is rewritten in the consumer's terms, not deleted with its neighbours.

When a package's tests are deleted because they break this pack, either remove the package and every caller's use of it, or redesign it so Features can specify its behaviour through its published surface, with the first slice in the same change. A package left with no tests, no test configuration or no test target and no Feature in their place is not done.

```diff
// WRONG: the failure is hidden, not fixed
- expect(s.total).toBe(1_250)
+ expect(s.total).toBeGreaterThan(0)
```
