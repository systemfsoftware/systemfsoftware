## 0.1.0

### Major Changes

- The `command` test runner works again, and its scores mean something. Re-run any
  score you recorded with it.

  - `commandRunner.command` and `buildCommand` are command lines from your config,
    not executable paths, so `npm test` was looked up as a single file and every
    run ended in `ENOENT`. Both now run through a shell.
  - A mutant run received the mutant variable and nothing else — no `PATH`, no
    `HOME` — so every mutant was reported killed by a suite that never ran while
    the baseline passed. A project whose mutants all survive scored 100. Mutant
    runs and the build command now keep the environment they inherit.
  - With `coverageAnalysis` set to `off`, every mutant was filed as uncovered and
    never run. Each mutant now runs against the whole suite.
  - The `testRunner` you configured is honoured; the mutation phase always used the
    child-process runner regardless.

- Three packages are renamed. `plugin-api` is now `@systemfsoftware/stryker-js`, the
  language every plugin is written against. `mutation-run` is now
  `@systemfsoftware/stryker-js-platform-node`, the Node host that runs a mutation
  test. `mutation-report` is now `@systemfsoftware/stryker-js-html-reporter`.
  Install the new names and change your imports.

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

- Removed the public export LoggingServerNotTcpError from @systemfsoftware/stryker-js-platform-node. The worker log server that could fail with this error no longer exists, so the error can no longer occur. If you imported this symbol, remove the import.

- `IdGeneratorService` is removed. The identifier generator is now the
  `IdGenerator` service with its own layer, so a caller asks for the service
  rather than importing a tag from the module that composes the run.

  Dry-run results are no longer edited in place: a test's reported file name is
  rewritten into a new value, so the object you passed in comes back unchanged.

- `--inPlace` no longer reports success after failing to put your files back.

  Restoring the backup over your working tree swallowed every failure: an
  unreadable directory counted as empty, a file that could not be inspected was
  skipped, and a failed restore printed a warning and exited 0 — leaving your own
  sources on disk still carrying the run's mutations while the command claimed it
  was fine. A restore that cannot complete now ends the run, and the backup
  directory it names is left in place to recover by hand.

  Files that could not be moved directly are now copied as bytes. They were read
  as text and written back, which corrupted every file in the project that was not
  text, and a read that failed produced an empty file rather than an error.

  The temp directory is also removed when a run finishes, instead of failing to
  delete itself and logging that it had.

- The console log threshold is now scoped to the run that set it. Two runs in one
  process no longer share it, so a run that lowers its own level can no longer
  quieten another run happening alongside it.

  `setEngineLogLevel` is removed. The level travels with the run.

- Five entry points that were never API are gone. Each existed because another
  package in this project found the code convenient, not because it was a surface
  anyone should depend on.

  - The engine's version and its engine range now come from the package's own
    entry point.
  - The failure identities you catch come from that same entry point rather than a
    separate one.
  - `toRelativeNormalizedFileName` comes from there too.
  - A timer, and a barrel of plugin internals, are no longer reachable. Report's
    `makeEmptyTimer` is gone with them; a progress tally now carries the instant
    the run started rather than a timer object.

  What is left is documented: an entry point is a name you may import and we may
  not move without a major, and everything else is internal whatever file it sits
  in.

- A run hands back its verdict alongside the results instead of the results alone.
  If you only read the results, take the `results` field; a caller supplying its
  own mutation-test stage returns both.

  The failure identities a caller can catch — the three config-read failures, a
  stage failure, a crashed or out-of-memory worker, and the generic run error — now
  have an entry point of their own rather than arriving through the one that
  resolves configuration.

- A failing run stage now says what failed. The five stage error types are one
  `StageError` carrying the stage it came from, the reason, and the command when
  there was one, and its message reads as a sentence — previously every stage
  error carried an empty message, so anything that printed one printed nothing.

  `PrepareFailedError`, `InstrumentFailedError`, `DryRunFailedError` and
  `DryRunNoTestsError` no longer exist. Match on `StageError` and read its `stage`
  field to recover the distinction. The exit code each failure produces is
  unchanged.

  An error's `cause` now survives being written to JSON, so a cause raised inside
  a worker reaches the report instead of arriving empty.

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

- Disposing a worker now terminates the whole process group and escalates. The
  runner signals the group so a worker's own child processes go with it, waits for
  the exit, and sends `SIGKILL` if the worker is still alive two seconds later.
  Previously a single `SIGTERM` went to one process id and the runner moved on
  after a fixed wait, so a worker that installed a `SIGTERM` handler — or that had
  spawned children of its own — outlived the run.

  The public export `ChildProcessSpawnerLive` is gone. It was a second, unused
  copy of the spawner carrying the old single-signal kill, and nothing could reach
  it.

### Minor Changes

- The shared base preset is importable again at `./config/base`, so a config file can inherit it with `"extends"` instead of restating every setting. The entry had stopped being published, which silently broke any config that inherited from it.

  The command manifest now lists the entry points the installed package actually declares, rather than a list written by hand that could disagree with it.

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

- A worker frame that cannot be delivered now fails the call instead of waiting forever.

  Both sides of the worker connection discarded write failures. The parent discarded the
  error from sending a call and then waited for a reply to a message that was never sent; a
  worker discarded the error from sending its reply and returned as though it had answered.
  Either one left the caller waiting on an answer that could not arrive, so a run stopped
  making progress without failing, reporting, or timing out — it simply kept emitting
  heartbeats.

  A send that fails now fails the call that needed it, and a worker that cannot deliver a
  reply stops rather than reporting success it did not send.

- An ignore plugin you did not select no longer ignores your mutants.

  `ignorers` in your config names which ignore plugins are active. It was read as
  documentation: every ignore plugin reachable through `plugins` ran, whether or
  not you named it. A shared plugin set therefore imposed its ignore rules on
  every project that loaded it.

  The consequence was silent and total wherever an unselected plugin's rule
  matched broadly: mutants came back ignored, the score was reported as `null`,
  and no mutant was ever tested — a run that looks like it worked and proves
  nothing. `ignorers` is now the allowlist it claims to be.

- A setting given a value it does not allow now says which setting and what it accepts, and stops the run before anything is instrumented. It used to surface the raw decode failure with an internal stack trace, point the reader at a report the run never wrote, and exit as though the run itself had failed rather than the configuration.

  The message names the option and its accepted form, the remediation points at the config file, and the exit code is the one reserved for a configuration mistake.

- A run no longer walks your installed dependencies before it starts.

  The scan that collects a project's input files descended into `node_modules`. With a
  package manager that stores dependencies as links, that tree holds every version of every
  transitive dependency, so the scan did not come back: the run printed its opening line and
  then only heartbeats, never reaching a phase, and eventually exhausted memory.

  Dependency directories are skipped again, so a run reaches its first phase immediately
  regardless of how much is installed.

- New version is published through npm trusted publishing, so it carries a provenance attestation you can verify.

- A failed run now says what failed.

  Every stage failure previously reported an empty message, so a run that could
  not start your test runner, could not read your config, or found no tests exited
  non-zero and told you nothing. The reported error now names the failure and the
  one beneath it, down to the fault that actually happened — including a failure
  raised inside a worker process, whose description used to be replaced with a
  fixed string before it reached you.

- Asking for a run addressed to a person now gets prose. Every stage, the plan and the closing verdict were written as machine lines whatever the mode, so a reader got a stream of JSON and the count of files being mutated was reported to nobody at all.

  A run addressed to a person reports how many of its files it is about to mutate and writes no machine lines; a run addressed to a program is unchanged.

- Incremental mode (`incremental: true`) reuses previous results instead of re-running every mutant.

  A run with an incremental file now remembers the outcome of every mutant whose source file and covering tests are unchanged, re-runs only what changed, and finishes in seconds instead of minutes. The incremental file is written on failed runs too, so a score under the threshold no longer discards the results just computed. Editing a test file re-runs exactly the mutants its tests cover.

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

- An oversized message between the runner and a worker now fails the run with a
  reason instead of exhausting memory. Each side of the connection reads frames
  up to 16 MiB, which leaves headroom over the largest legitimate payload — a dry
  run carrying per-test coverage — and a frame past the limit fails the calls
  waiting on it rather than growing until the process dies.

- Each of these packages now has a README, so its registry page says what the package is, how
  to install it, and what to import or register — previously the page was blank. The lint
  plugins show the configuration line that enables what they recommend.

  `@systemfsoftware/stryker-js-html-reporter` also carries its licence text

- Instrumented files written into the sandbox now get `// @ts-nocheck` when `disableTypeChecks` is on (the default).

  A TypeScript checker dry-run no longer fails the mutation run because the coverage helpers do not type-check.

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

- A run no longer hangs before testing any mutant.

  Two defects in the worker protocol between the engine and its child processes
  each stalled a run indefinitely, with no error and no progress:

  - A reply carrying no value — the answer from any operation that returns
    nothing — was rejected and discarded, so the call it answered waited forever.
  - Two replies arriving close together could erase one another's pending call, so
    the second answer had nowhere to go and that operation never finished.

  Either one stopped a run after the dry run, reporting no total and no progress
  until it was interrupted. Runs now proceed to a score, and no worker process is
  left behind afterwards.

- Updated dependencies:
  - @systemfsoftware/effect-cell-types@5.0.0
  - @systemfsoftware/stryker-js-instrumenter@2.0.0
