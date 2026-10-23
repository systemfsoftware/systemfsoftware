---
title: Tests live in their package's tests/ and import the package only through its public specifier; nothing is exported so a test can reach it
applies_when:
  - writing a test that needs an internal function
  - adding an export or subpath so a test can import something
  - placing tests in a package
  - a test imports its own package by a relative path
tags: [composition, tests, internals, exports]
---

A test lives in the `tests/` folder of the package whose behaviour it tests. It imports that package by its public specifier (`@scope/name`), the same specifier a real consumer uses. That holds for a test inside the package too. No test reaches into `src` or `internal` by a relative path. The workspace source condition (`source-condition-resolution`) resolves the specifier to TypeScript source, so this needs no build.

When behaviour cannot be reached through the public entry, either it is not public behaviour, or the surface is wrong. Test it through the public operation that uses it, or fix the surface. Never export it for the test. A fake or test Layer that other packages' tests need is a public Layer of the service, exported from `.` beside the live one (Effect's `layerTest` pattern). There is no `./testing` entry. An application has no public specifier, so its tests drive its deployed entry (the Worker's fetch or RPC handler), never its internal modules.

An entry that only tests import is legitimate in two cases:

- it is published, and its consumers are outside this workspace;
- it is the root of a leaf library.

Not legitimate: a `./testing` entry, a private library's deep file path or folder wildcard, and any key that names itself internal (`_internal`, `internal`).

A test that imports internals freezes them, because the test suite becomes the package's largest consumer of code nobody else may touch. TanStack's source never deep-imports another package's source.

Gate: fact-gated. In `@systemfsoftware/oxlint-plugin-test-discipline`:

- `tests-import-public-api` reports a test whose relative specifier has a `src` segment, or an `internal` segment after a `..` climb;
- `test-file-outside-tests-dir` and `no-test-file-in-src` keep tests in `tests/`.

`repo-checks composition-imports` fails an import of another workspace package by a specifier its `exports` map does not admit, and an import that reaches another package by a relative path (both resolved by the compiler, never matched in text).

Judge-gated (`test-only-exports`, see the README): the same check lists the export entries that only test files import, and asks a panel whether each is one of the two legitimate cases above. The calibration set still labels `./testing` roles as legitimate. Until those cases are relabelled, the judge reports and the fact gates above are the authority.
