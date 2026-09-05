## 1.0.0

### Major Changes

- Decision channels are now tagged unions of at least two Schema tagged classes sharing one family TypeId: the dry-run observation splits into DryRunPassed and DryRunFailed, the mutation-run verdict becomes three variants, and shouldKeepTempDir accepts any failure channel instead of only S.SchemaError

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

- `runMutationTest` now returns an effect that requires the stage services. Provide your host layer once at the program entry instead of passing a layer to each stage.

- The Node host package `@systemfsoftware/stryker-js-platform-node` is gone: the engine (`@systemfsoftware/stryker-js-engine`) is the host-neutral mutation run, and the `stryker` CLI owns the Node composition roots and worker entries. Depend on the engine for the run and the CLI for process entries; install the new names.

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

- Five entry points that were never API are gone. Each existed because another
  package in this project found the code convenient, not because it was a surface
  anyone should depend on.

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

### Minor Changes

- The shared base preset is importable again at `./config/base`, so a config file can inherit it with `"extends"` instead of restating every setting. The entry had stopped being published, which silently broke any config that inherited from it.

  The command manifest now lists the entry points the installed package actually declares, rather than a list written by hand that could disagree with it.

- Configured checkers now type-check mutants in the groups the checker returns, instead of checking the whole remaining set at once.

  Compile-error mutants are still reported as compile errors.

  The package now exports `checkGroupedPlans` and the `CheckerResourceService` type for that grouped check phase.

- feat: bump stryker-js-engine to 0.3.0

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

- A mutation run that is killed mid-way keeps every completed mutant: the JSONL progress stream is flushed after each result, and incremental mode writes remembered verdicts as they finish so the next run continues instead of starting over.

  Remembered killed mutants still name the tests that killed them, so a resumed run's report matches a complete run.

  The progress stream path is progressStreamFile (default reports/mutation-stream.jsonl) and can be set in config or with --progressStreamFile.

- A run no longer walks your installed dependencies before it starts.

  The scan that collects a project's input files descended into `node_modules`. With a
  package manager that stores dependencies as links, that tree holds every version of every
  transitive dependency, so the scan did not come back: the run printed its opening line and
  then only heartbeats, never reaching a phase, and eventually exhausted memory.

  Dependency directories are skipped again, so a run reaches its first phase immediately
  regardless of how much is installed.

- A failed run now says what failed.

  Every stage failure previously reported an empty message, so a run that could
  not start your test runner, could not read your config, or found no tests exited
  non-zero and told you nothing. The reported error now names the failure and the
  one beneath it, down to the fault that actually happened — including a failure
  raised inside a worker process, whose description used to be replaced with a
  fixed string before it reached you.

- Incremental mode (`incremental: true`) reuses previous results instead of re-running every mutant.

  A run with an incremental file now remembers the outcome of every mutant whose source file and covering tests are unchanged, re-runs only what changed, and finishes in seconds instead of minutes. The incremental file is written on failed runs too, so a score under the threshold no longer discards the results just computed. Editing a test file re-runs exactly the mutants its tests cover.

- A mutation run writes the JSON report the `json` reporter is configured to produce.

  Vitest no longer reprints its full summary for every mutant.

- An oversized message between the runner and a worker now fails the run with a
  reason instead of exhausting memory. Each side of the connection reads frames
  up to 16 MiB, which leaves headroom over the largest legitimate payload — a dry
  run carrying per-test coverage — and a frame past the limit fails the calls
  waiting on it rather than growing until the process dies.

- Instrumented files written into the sandbox now get `// @ts-nocheck` when `disableTypeChecks` is on (the default).

  A TypeScript checker dry-run no longer fails the mutation run because the coverage helpers do not type-check.

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
  - @systemfsoftware/stryker-js@2.0.0
  - @systemfsoftware/stryker-js-instrumenter@5.0.0
