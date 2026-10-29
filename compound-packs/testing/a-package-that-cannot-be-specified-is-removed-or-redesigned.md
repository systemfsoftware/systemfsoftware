---
title: A package whose behaviour cannot be specified by Features is removed or redesigned, never left without tests
applies_when:
  - deleting a package's behaviour tests, its test configuration or its test target
  - a package's tests can only be written with mocks, stand-ins, child processes or fixtures the other rules in this pack refuse
tags: [testing, deletion, design, coverage, package]
---

When a package's tests are deleted because they break this pack, the package is either removed or redesigned so that its behaviour can be specified by Features through its published surface. A package that ships with its tests, test configuration or test target removed and no Feature in their place proves the package's design failed; the change is not done.

The PR that deletes them does one of two things: it removes the package and every caller's use of it, or it carries the redesign's first slice with Features for the behaviour its consumers depend on (and names the issue for the rest).

Decision: the judge fails a PR that deletes a package's behaviour tests or test target while the package stays, unless the same PR adds Features that specify the behaviour its consumers use. An uncertain case escalates.

Defect it prevents: deleting tests that could not be written honestly leaves the code they covered untested and the design that made them dishonest in place, so the next change ships blind.

Source: owner ruling, 2026-10-28, on a merged PR that deleted a package's pseudo-BDD tests and its test target: "it is a mockery it proves the package design is a failure", "Either remove the package or rethink it".

Gate: judge
