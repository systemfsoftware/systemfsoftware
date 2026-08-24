---
"@systemfsoftware/stryker-js-plugin-api": minor
"@systemfsoftware/stryker-js-cli": patch
"@systemfsoftware/stryker-js-instrumenter": patch
"@systemfsoftware/stryker-js-mutation-run": patch
"@systemfsoftware/stryker-js-typescript-checker": patch
"@systemfsoftware/stryker-js-vitest-runner": patch
---

The shared helpers package is gone. Nothing installs it any more, and the
handful of helpers worth sharing now live in the plugin contract next to the
types they serve:

- `strykerReportBugUrl`, `normalizeFileName`, `propertyPath`, `errorToString`
  and `isErrnoException` from `@systemfsoftware/stryker-js-plugin-api/core`
- `noopLogger` from `@systemfsoftware/stryker-js-plugin-api/logging`
- `testFilesProvided` from `@systemfsoftware/stryker-js-plugin-api/test-runner`

If you imported any of those, change the specifier. Everything else it exported
had no consumer and is removed: use `Predicate.isNotNullish` from Effect in place
of `notEmpty`, and `RegExp.escape` in place of `escapeRegExp`.
