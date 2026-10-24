---
title: A failing test is fixed in the code under test, never by weakening or deleting the test
applies_when:
  - a test fails after a change
  - a diff edits an assertion, an expected value or a test file's scenarios, or deletes a test
tags: [testing, assertions, weakened-tests]
---

Never turn a red test green by loosening what it asserts (an exact value to a partial match or a containment matcher, a named error to a broader one), widening a tolerance or time bound, narrowing the inputs a property draws, or deleting a test, a scenario or a test file.

A change that removes a test either removes the behaviour that test proves, or adds in the same change a test CI runs that proves the same behaviour through the public entry.

Whether a test change weakens what the test proves is decided by the review judge from the diff; an uncertain case escalates.

Gate: judge
