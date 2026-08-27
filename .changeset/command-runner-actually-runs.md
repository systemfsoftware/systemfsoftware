---
"@systemfsoftware/stryker-js-platform-node": major
---

The `command` test runner works again, and its scores mean something. Re-run any
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
