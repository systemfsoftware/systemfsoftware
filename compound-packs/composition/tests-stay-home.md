---
title: Tests import their own package relatively and other packages only through public specifiers; nothing is exported so a test can reach it
applies_when:
  - writing a test that needs an internal function
  - adding an export or subpath so a test can import something
  - placing tests in a package
tags: [composition, tests, internals, exports]
---

A test lives in the package whose code it tests, beside that code or under its `tests/`, and imports it by relative path. A test in another package imports only public specifiers, the same ones a real consumer uses. When an internal behaviour needs testing from outside, the test belongs in the owning package.

An entry that only tests import is still a legitimate surface in three cases: it is published (its consumers are outside this workspace), it is the root of a leaf library (a leaf has no workspace dependents because it is the bottom of the graph), or it is a `./testing` role that exists to serve tests. Not legitimate: a private library's deep file path or folder wildcard imported only by tests, and any key that names itself internal (`_internal`, `internal`), even in a published package. An asset entry such as a stylesheet is read by path, so whether tests alone use it is not settled by imports.

Exporting a module so that a test elsewhere can reach it turns the test suite into the package's largest consumer of internals and freezes them. TanStack's source never deep-imports another package's source, and the few tests that do are a visible smell. Deno std keeps tests next to the module they test.

Gate: fact-gated, `repo-checks composition-imports` fails an import of another workspace package by a specifier its `exports` map does not admit and an import that reaches another package by a relative path (resolved by the compiler, never matched in text). Judge-gated (`test-only-exports`, calibration kappa 0.79 over 37 cases, see the README): the same check lists the export entries that only test files import and asks a panel whether each is legitimate (a published entry with outside consumers, a `./testing` role, a leaf library's root) or exported only so a test can reach it; a violated verdict needs both panel members and fails only while the kappa stays at or above 0.7. An asset entry such as a stylesheet is uncertain and reported for a human.
