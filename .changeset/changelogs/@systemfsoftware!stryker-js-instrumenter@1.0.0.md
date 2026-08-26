## 1.0.0

### Major Changes

- Parse, transform and mutant-placement failures now carry a message naming the
  file and what went wrong, and their `cause` survives being written to JSON — so
  a failure that crossed a process boundary no longer arrives blank.

  Every error tag is now qualified, which is what makes two identically named
  errors from different packages distinguishable.

  `MutantPlacementFailed` is removed; it was a second name for `PlacementFailed`
  and had no constructor anywhere. Match `PlacementFailed`.

- svelte is now an optional peer dependency. Install it to mutate .svelte components; without it, every other file type is unaffected. A copy of the Svelte compiler used to be bundled in, which pinned whichever version was present when the package was built and made the compiler version check read the wrong answer.

### Patch Changes

- The instrumenter no longer depends on `weapon-regex`, a Scala library compiled to JavaScript that is no longer maintained. It is replaced by `@eslint-community/regexpp`, which has no dependencies of its own. Regular expression mutants are unchanged, so no action is required.

- The shared helpers package is gone. Nothing installs it any more, and the
  handful of helpers worth sharing now live in the plugin contract next to the
  types they serve:

  - `strykerReportBugUrl`, `normalizeFileName`, `propertyPath`, `errorToString`
    and `isErrnoException` from `@systemfsoftware/stryker-js-plugin-api/core`
  - `noopLogger` from `@systemfsoftware/stryker-js-plugin-api/logging`
  - `testFilesProvided` from `@systemfsoftware/stryker-js-plugin-api/test-runner`

  If you imported any of those, change the specifier. Everything else it exported
  had no consumer and is removed: use `Predicate.isNotNullish` from Effect in place
  of `notEmpty`, and `RegExp.escape` in place of `escapeRegExp`.

- These packages no longer install dependencies they never imported, so installing them pulls less into your tree.

  `tslib` is gone from all six. The mutation runner additionally stops installing `lodash.groupby`, `semver` and `source-map`, and the command line interface stops installing `@effect/platform-node-shared`. Nothing exported changes.

- When a mutant cannot be placed, the reported error now links to this project's issue tracker rather than the upstream StrykerJS one.

- Published packages no longer carry build artifacts left over from earlier builds. One package was shipping about a megabyte of bundled test-runner internals this way.

- Updated dependencies:
  - @systemfsoftware/stryker-js-plugin-api@3.0.0
