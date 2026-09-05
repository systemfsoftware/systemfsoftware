## 2.0.0

### Major Changes

- The packages are renamed. `plugin-api` is now `@systemfsoftware/stryker-js`, the
  language every plugin is written against. `mutation-run` is split: the run
  itself is `@systemfsoftware/stryker-js-engine`
  (host-neutral, no Node on its manifest) and the Node process entries are
  `@systemfsoftware/stryker-js-cli`, which owns the worker files and the runtime
  gate. `mutation-report` is now `@systemfsoftware/stryker-js-html-reporter`.
  `@systemfsoftware/stryker-js-platform-node` is never published — do not install
  it. Install the new names and change your imports.

  Options types moved. `StrykerOptions`, `PartialStrykerOptions` and `LogLevel` are
  imported from the `Schema` export; `Mutant`, `MutantStatus`, `Position` and
  `Location` from the `Mutant` export. Point a config's `extends` at the language
  package's `Schema` export.

  `MutantStatus` accepts one spelling per outcome: `Killed`, `Survived`,
  `NoCoverage`, `Timeout`, `CompileError`, `RuntimeError`, `Ignored` and `Pending`.
  The lowercase and abbreviated forms — `killed`, `timedOut`, `noCoverage` and the
  rest — are gone. A comparison against a removed spelling never matched the value
  the reporter actually produced, so check any status comparison you wrote.

  Statuses, plugin kinds, exit classes and AST formats are string literal unions
  rather than enums, so read them as their string values. Member access such as
  `ExitClass.VerdictFail` no longer resolves.

  A plugin no longer receives a logger, and the logger port is gone. Plugins log
  through Effect, and the host decides where that output goes.

  The bundled base preset is gone. A config inherits from the language package's
  `Schema` export and states the thresholds, reporters and plugins it wants; you no
  longer silently inherit a package manager, a plugin list or a break threshold.

- An evaluator now answers with the verdict it reached instead of failing to
  report one.

  `Evaluator.evaluate` returns `ExitClass | null` on the success channel: the
  class the run should end in, or `null` for nothing to report. `ExitClass` is
  exported from `@systemfsoftware/stryker-js/evaluate`. The error
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
    and `isErrnoException` from `@systemfsoftware/stryker-js/core`
  - `noopLogger` from `@systemfsoftware/stryker-js/logging`
  - `testFilesProvided` from `@systemfsoftware/stryker-js/test-runner`

  If you imported any of those, change the specifier. Everything else it exported
  had no consumer and is removed: use `Predicate.isNotNullish` from Effect in place
  of `notEmpty`, and `RegExp.escape` in place of `escapeRegExp`.

- Checker and test-runner workers now talk over Effect's own worker RPC, and every
  call they exchange is a declared operation with a declared result.

  Before, the parent and its workers spoke a protocol written by hand: messages were
  newline-delimited JSON, arguments were typed as "any JSON value", and each method
  was reached by name through a proxy. Nothing checked that a payload was one the far
  end could serve, so a value it could not read was refused after it arrived, and a
  call whose message never landed was waited on anyway.

  The six operations that cross that boundary — a checker's `check` and `group`, a
  runner's `capabilities`, `dryRun` and `mutantRun` — now each name what they take
  and what they return, and the options a worker starts from are sent once when it
  starts rather than as a first method call. A payload that does not fit is refused
  where it is built, and a worker that cannot answer fails the call that was waiting.

  The two worker entry points are no longer importable subpaths of this package.
  They were only ever spawned as processes, and the paths resolved to TypeScript
  sources that could not be executed.

### Patch Changes

- A mutation run that is killed mid-way keeps every completed mutant: the JSONL progress stream is flushed after each result, and incremental mode writes remembered verdicts as they finish so the next run continues instead of starting over.

  Remembered killed mutants still name the tests that killed them, so a resumed run's report matches a complete run.

  The progress stream path is progressStreamFile (default reports/mutation-stream.jsonl) and can be set in config or with --progressStreamFile.

- New version is published through npm trusted publishing, so it carries a provenance attestation you can verify.

- Peer Effect requirement advances to 4.0.0-rc.112. No API changes.

- An oversized message between the runner and a worker now fails the run with a
  reason instead of exhausting memory. Each side of the connection reads frames
  up to 16 MiB, which leaves headroom over the largest legitimate payload — a dry
  run carrying per-test coverage — and a frame past the limit fails the calls
  waiting on it rather than growing until the process dies.

- Each of these packages now has a README, so its registry page says what the package is, how
  to install it, and what to import or register — previously the page was blank. The lint
  plugins show the configuration line that enables what they recommend.

  `@systemfsoftware/stryker-js-html-reporter` also carries its licence text

- These packages no longer install dependencies they never imported, so installing them pulls less into your tree.

  `tslib` is gone from all six. The mutation runner additionally stops installing `lodash.groupby`, `semver` and `source-map`, and the command line interface stops installing `@effect/platform-node-shared`. Nothing exported changes.

- Published packages no longer carry build artifacts left over from earlier builds. One package was shipping about a megabyte of bundled test-runner internals this way.

- The closing verdict line carries its findings again. It had shrunk to the score alone, so a consumer reading the stream could no longer see the score limits the run was held to, where the report was written, or which mutants survived — the survivors were reported while the run was in flight and then absent from the summary that closes it.

  The verdict now states the thresholds, the report path, and every surviving mutant with its file, position, mutator and replacement.
