## 3.2.0

### Minor Changes

- Asking for human output now produces some.

  A run told to address a person wrote nothing at all to standard output: the
  progress prose went to standard error, and the machine stream reporter — which
  exists to feed the machine-readable channel — stayed selected even though no
  such channel was open. Human runs now print the progress prose and the score
  table where you would expect to read them, and the machine stream reporter is
  selected only for the machine channel; any other reporter you configured, such
  as `html` or `json`, still runs in both.

  Colour follows the `NO_COLOR` convention: set it to any non-empty value and
  neither descriptor receives an escape sequence. The machine channel is never
  coloured.

  Machine output is unchanged — standard output remains the newline-delimited
  stream and nothing else, with the engine's log lines on standard error.

- A run's verdict now reaches the exit code, and an interrupted run reports the
  signal that stopped it.

  - A score below the breaking threshold printed the score, said it was too low,
    and exited `0`, so a step that checked the status passed no matter how low the
    score fell. A failing verdict now fails the command.
  - A run stopped with `Ctrl-C` or `SIGTERM` reported the interruption and then
    exited `1` anyway. The status is now `128 + n` for the signal that ended the
    run — `130` for `SIGINT`, `143` for `SIGTERM`.
  - Every mutant you can act on — survived, uncovered, timed out, errored — is
    announced as it is found, not only in the closing summary.

### Patch Changes

- `--help` reads the four defaults it quotes from the option schema, so a default
  that changes can no longer leave the help text describing the old one.

- A failed run now says what failed.

  Every stage failure previously reported an empty message, so a run that could
  not start your test runner, could not read your config, or found no tests exited
  non-zero and told you nothing. The reported error now names the failure and the
  one beneath it, down to the fault that actually happened — including a failure
  raised inside a worker process, whose description used to be replaced with a
  fixed string before it reached you.

- Mutants are tested against your real test runner.

  The command line interface supplied placeholder checker, reporter and test
  runner implementations to its own run: the placeholder runner answered
  `Survived` with zero tests for every mutant, so a run reported a mutation score
  that had nothing to do with your tests, and no reporter output was produced. It
  now supplies only the capabilities a host owns, and your configured plugins
  provide the rest.

  If you have a recorded score from an earlier release, discard it and measure
  again.

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
  - @systemfsoftware/stryker-js-mutation-report@2.0.0
  - @systemfsoftware/stryker-js-mutation-run@5.0.0
  - @systemfsoftware/stryker-js-plugin-api@3.0.0
