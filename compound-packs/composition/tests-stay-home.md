---
title: Tests import their own package relatively and other packages only through public specifiers; nothing is exported so a test can reach it
applies_when:
  - writing a test that needs an internal function
  - adding an export or subpath so a test can import something
  - placing tests in a package
tags: [composition, tests, internals, exports]
---

A test lives in the package whose code it tests, beside that code or under its `tests/`, and imports it by relative path. A test in another package imports only public specifiers, the same ones a real consumer uses. When an internal behaviour needs testing from outside, the test belongs in the owning package.

Exporting a module so that a test elsewhere can reach it turns the test suite into the package's largest consumer of internals and freezes them. TanStack's source never deep-imports another package's source, and the few tests that do are a visible smell. Deno std keeps tests next to the module they test.

Gate: `repo-checks composition imports` fails any import of another workspace package by a path the package doesn't export, and any export that only test files import (computed with knip-style reachability over non-test sources).
