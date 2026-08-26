## 2.0.0

### Major Changes

- The TypeScript compiler's methods return Effects instead of Promises, and the
  compiler is acquired for the length of the check. An interrupted check now
  releases the compiler instead of leaving it alive with the run's state still in
  it.

  Compiler failures are now a single tagged `CompilerFailed` error carrying a
  `reason` — the compiler used before initialization, no projects found for the
  tsconfig, an unknown file in the graph, or a project file missing from disk.
  They were untagged `Error`s before, so anything catching them saw one
  indistinguishable type.

  Diagnostics and `tsconfig` resolution are unchanged.

### Patch Changes

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

- Published packages no longer carry build artifacts left over from earlier builds. One package was shipping about a megabyte of bundled test-runner internals this way.

- Updated dependencies:
  - @systemfsoftware/stryker-js-plugin-api@3.0.0
