## 6.0.0

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

- The Node host package `@systemfsoftware/stryker-js-platform-node` is gone: the engine (`@systemfsoftware/stryker-js-engine`) is the host-neutral mutation run, and the `stryker` CLI owns the Node composition roots and worker entries. Depend on the engine for the run and the CLI for process entries; install the new names.

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

- Machine-readable mutation progress is a newline-delimited JSON file next to the HTML and JSON reports, not the console.

  The console prints bounded progress prose: phase names, a count line, at most twenty surviving mutants, and a verdict. Killed mutants now advance that count. Child test runs during mutation no longer print per-test output or GitHub workflow commands.

  If you parsed the console as JSON lines, read the stream file instead. A hard kill can leave that file without a closing verdict line.

- cut over to effect v4 (4.0.0-rc.108): public surface derives from effect types; peers flip effect ^3→^4

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

- The Workflow brand: `make` is the only door to a decide slot.

  `Workflow<C, D, E>` and `Cell.DecidePhase<P>` carry a phantom `WorkflowBrand` conjunct applied
  solely by `Workflow.make` through the existing assertion narrowing — no runtime property, `make`
  stays the identity it always was. The consumer's signature is the forcing function: a bare
  function handed where a decide run is demanded is now a compile error naming the brand, so a
  decision cannot reach production without passing through the constructor every gate keys on.

  Breaking by design (`REPO-R1`): the two inline adapter sites (cli's admission adapter,
  claude-compat's submit-hook adapter) become `make`-wrapped, and the cell-gen either-pass
  fixture reshapes to one exhaustive path with the failure injection decided before the boundary.

### Patch Changes

- The shared base preset is importable again at `./config/base`, so a config file can inherit it with `"extends"` instead of restating every setting. The entry had stopped being published, which silently broke any config that inherited from it.

  The command manifest now lists the entry points the installed package actually declares, rather than a list written by hand that could disagree with it.

- A setting given a value it does not allow now says which setting and what it accepts, and stops the run before anything is instrumented. It used to surface the raw decode failure with an internal stack trace, point the reader at a report the run never wrote, and exit as though the run itself had failed rather than the configuration.

  The message names the option and its accepted form, the remediation points at the config file, and the exit code is the one reserved for a configuration mistake.

- A mutation run that is killed mid-way keeps every completed mutant: the JSONL progress stream is flushed after each result, and incremental mode writes remembered verdicts as they finish so the next run continues instead of starting over.

  Remembered killed mutants still name the tests that killed them, so a resumed run's report matches a complete run.

  The progress stream path is progressStreamFile (default reports/mutation-stream.jsonl) and can be set in config or with --progressStreamFile.

- New version is published through npm trusted publishing, so it carries a provenance attestation you can verify.

- Peer Effect requirement advances to 4.0.0-rc.112. No API changes.

- Express each executor's sandwich as a `Cell` description.

  Every call site that previously sequenced the phases by hand now builds one description and hands it to the interpreter, so the order these executors run in is carried by the phase types instead of by the order the statements happen to appear in. Behaviour is preserved and no public surface moves: the change is confined to `src/internal/*.executor.ts`, and each package's golden API report is unchanged.

  One site needed a real fix rather than a translation. `supervisor-body.executor.ts` wrote before it could classify — it recorded a restart, then read the resulting rate — which is a read that depends on an earlier decision. Its read now gathers the restart record and the resulting rate as one product, which keeps that site a single layer, with the intensity tracker passed as the read's command rather than captured from the surrounding scope.

- A failed run now says what failed.

  Every stage failure previously reported an empty message, so a run that could
  not start your test runner, could not read your config, or found no tests exited
  non-zero and told you nothing. The reported error now names the failure and the
  one beneath it, down to the fault that actually happened — including a failure
  raised inside a worker process, whose description used to be replaced with a
  fixed string before it reached you.

- Asking for a run addressed to a person now gets prose. Every stage, the plan and the closing verdict were written as machine lines whatever the mode, so a reader got a stream of JSON and the count of files being mutated was reported to nobody at all.

  A run addressed to a person reports how many of its files it is about to mutate and writes no machine lines; a run addressed to a program is unchanged.

- A mutation run writes the JSON report the `json` reporter is configured to produce.

  Vitest no longer reprints its full summary for every mutant.

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
    and `isErrnoException` from `@systemfsoftware/stryker-js/core`
  - `noopLogger` from `@systemfsoftware/stryker-js/logging`
  - `testFilesProvided` from `@systemfsoftware/stryker-js/test-runner`

  If you imported any of those, change the specifier. Everything else it exported
  had no consumer and is removed: use `Predicate.isNotNullish` from Effect in place
  of `notEmpty`, and `RegExp.escape` in place of `escapeRegExp`.

- These packages no longer install dependencies they never imported, so installing them pulls less into your tree.

  `tslib` is gone from all six. The mutation runner additionally stops installing `lodash.groupby`, `semver` and `source-map`, and the command line interface stops installing `@effect/platform-node-shared`. Nothing exported changes.

- Published packages no longer carry build artifacts left over from earlier builds. One package was shipping about a megabyte of bundled test-runner internals this way.

- The closing verdict line carries its findings again. It had shrunk to the score alone, so a consumer reading the stream could no longer see the score limits the run was held to, where the report was written, or which mutants survived — the survivors were reported while the run was in flight and then absent from the summary that closes it.

  The verdict now states the thresholds, the report path, and every surviving mutant with its file, position, mutator and replacement.

- Produce every workflow through `Workflow.make`.

  `decideRestart`, `interpretHookResult`, and `admitSurvivorsRun` are now built by the constructor rather
  than annotated with `Workflow<Command, Decision, Error>`. Each decision is behaviourally identical —
  `make` is the identity at runtime — but the channels are now inferred from the decider instead of
  asserted by hand, so a total decision resolves to `UninhabitedError` and becomes uncallable rather than
  compiling as a workflow that cannot fail.

  `effect-daemon-spec` takes a minor bump because the change is consumer-visible beyond its own source:
  `@systemfsoftware/effect-cell-types` moves from `devDependencies` to `dependencies`, so installing this
  package now installs it. That reclassification is required, not incidental — `make` is a runtime call,
  and `scripts/guards/check-runtime-deps.mjs` fails a runtime import declared only as a dev dependency.
  `omp-claude-compat` gains the same dependency; `stryker-js-cli` already declared it.

  `RestartDecisionWorkflow` survives as a type-only export: one in-repo consumer, its own property test,
  references it through `ReturnType<…>`.

- Updated dependencies:
  - @systemfsoftware/stryker-js@2.0.0
  - @systemfsoftware/stryker-js-engine@1.0.0
  - @systemfsoftware/stryker-js-html-reporter@2.0.0
