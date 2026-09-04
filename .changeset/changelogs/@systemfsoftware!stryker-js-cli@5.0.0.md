## 5.0.0

### Major Changes

- The Node host package `@systemfsoftware/stryker-js-platform-node` is gone: the engine (`@systemfsoftware/stryker-js-engine`) is the host-neutral mutation run, and the `stryker` CLI owns the Node composition roots and worker entries. Depend on the engine for the run and the CLI for process entries; install the new names.

- RunOutcome now places the genuine verdicts (RunParseFailed, RunSurvivorsRejected, RunConfigFailed, RunFailed) on the decision channel as a branded tagged union; RunInterrupted remains a failure. Output.workflow resolves a branded HumanOutput|MachineOutput union instead of a plain record

- Disposing a worker now terminates the whole process group and escalates. The
  runner signals the group so a worker's own child processes go with it, waits for
  the exit, and sends `SIGKILL` if the worker is still alive two seconds later.
  Previously a single `SIGTERM` went to one process id and the runner moved on
  after a fixed wait, so a worker that installed a `SIGTERM` handler — or that had
  spawned children of its own — outlived the run.

### Patch Changes

- Updated dependencies:
  - @systemfsoftware/effect-cell-types@6.0.0
  - @systemfsoftware/stryker-js@1.0.0
  - @systemfsoftware/stryker-js-html-reporter@1.0.0
