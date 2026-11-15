---
title: Fix failing tests in the code under test, never by weakening or deleting tests
applies_when:
  - a test fails after a code change
  - a diff loosens an assertion, widens a tolerance, narrows property inputs or deletes a test
  - removing a package's tests or replacing a Feature scenario
tags: [testing, assertions, weakened-tests, deletion, package]
---

Fix a red test in the code under test—never by loosening exact assertions to partial or containment matches, broadening expected error tags, widening tolerances or timeouts, narrowing property generators, or deleting tests.

Removing a test that proves our system's behaviour is valid only if the behaviour itself is removed or the same change adds a passing test proving it through the consumer entry, running the shipped system when real IO is needed (`features-specify-our-systems-observable-behaviour.md`).

Scenarios whose `Then` checks only a third party's wire format, a config decoder, or copied implementation literals prove no behaviour of ours and are deleted without replacement. If a `When` drove the consumer entry and `Then` inspected an unverified stub's request log, replace the assertion with the port's contract-suite fake read operation in the same change (`port-fakes-share-a-contract-suite.md`). If a package's tests are deleted for breaking this pack, either delete the package and all callers or redesign it around a published consumer surface with its first passing Feature in the same diff.

```diff
// WRONG: hiding a regression instead of fixing the calculation
- expect(s.total).toBe(1_250)
+ expect(s.total).toBeGreaterThan(0)
```
