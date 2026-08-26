## 3.0.0

### Major Changes

- An evaluator now answers with the verdict it reached instead of failing to
  report one.

  `Evaluator.evaluate` returns `ExitClass | null` on the success channel: the
  class the run should end in, or `null` for nothing to report. `ExitClass` is
  exported from `@systemfsoftware/stryker-js-plugin-api/evaluate`. The error
  channel is for the evaluator itself breaking — a report it cannot read, a
  decision it cannot reach.

  Previously the only way to report a failed gate was to fail, which a caller
  could not tell apart from the evaluator crashing, so neither the exit code nor
  the message could distinguish them. If you wrote an evaluator that failed to
  signal a verdict, return the class instead.

  A run's verdict is now the most severe class anyone reported — the score against
  your `break` threshold, plus every evaluator's answer.

- Plugins are written against Effect instead of Promise.

  `Checker`, `TestRunner`, `Reporter`, `Ignorer` and `Evaluator` are capability services whose operations return an `Effect`. Provide your plugin as a `Layer` through `declarePlugin`; the class, factory and value declarations are gone, along with the `typed-inject` dependency. Implement the operations that were optional — return `Effect.void` where there is nothing to do, and one group per mutant from `group` if you have no grouping opinion.

  Each capability fails with a tagged error. Outcomes are not failures: a killed mutant, a survivor and a compile error in the code under test are successful results.

  Read the sandbox path from `SandboxDirectory`. `commonTokens`, `tokens` and the plugin context types are removed. `determineHitLimitReached` returns an `Option`.

### Minor Changes

- `RENDERED_OPTION_DEFAULTS` is exported from the `core` entry point. It carries
  the four option defaults that appear in human-readable help text, so a tool
  printing "the default is X" reads the same value the option schema applies
  instead of restating it.

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

### Patch Changes

- These packages no longer install dependencies they never imported, so installing them pulls less into your tree.

  `tslib` is gone from all six. The mutation runner additionally stops installing `lodash.groupby`, `semver` and `source-map`, and the command line interface stops installing `@effect/platform-node-shared`. Nothing exported changes.

- Published packages no longer carry build artifacts left over from earlier builds. One package was shipping about a megabyte of bundled test-runner internals this way.
