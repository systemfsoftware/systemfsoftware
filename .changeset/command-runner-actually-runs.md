---
"@systemfsoftware/stryker-js-mutation-run": major
---

The `command` test runner works again, and its scores mean something.

Three faults stacked up, and together they made a run either die immediately or
report a confident, wrong result:

- `commandRunner.command` and `buildCommand` are command lines from your config,
  not executable paths. They were handed to the OS as a program name, so `npm
  test` was looked up as a single file and every run ended in `ENOENT` before a
  test executed. Both now run through a shell.
- A mutant run received the mutant variable and nothing else — no `PATH`, no
  `HOME`. The command could not be found, exited non-zero, and every mutant was
  reported killed by a suite that never ran, while the baseline run (which sets
  no variable) passed. A project whose mutants all survive scored 100. Mutant
  runs and the build command now keep the environment they inherit.
- With `coverageAnalysis` set to `off`, and with the `command` runner, which
  reports one synthetic test and no coverage at all, every mutant was filed as
  uncovered and never run. Both cases now run each mutant against the whole
  suite.

Mutation testing also honours the `testRunner` you configured. The mutation
phase always used the child-process runner regardless, so selecting `command`
produced a passing baseline and then failed every mutant while trying to load a
plugin named `command`, which does not exist.
