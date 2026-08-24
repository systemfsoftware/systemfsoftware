---
"@systemfsoftware/stryker-js-mutation-run": major
"@systemfsoftware/stryker-js-cli": minor
---

A run's verdict now reaches the exit code, and an interrupted run reports the
signal that stopped it.

Three faults sat between a decided verdict and the number your shell reads:

- A score below the breaking threshold printed the score, said it was too low,
  and exited `0`. Nothing gated on it, so a CI step that ran a mutation test and
  checked the status passed no matter how low the score fell. A failing verdict
  now fails the command.
- A run stopped with `Ctrl-C` or `SIGTERM` reported the interruption in its
  closing line, carrying the code it had resolved, and then exited `1` anyway.
  The status is now `128 + n` for the signal that ended the run — `130` for
  `SIGINT`, `143` for `SIGTERM` — matching the code the closing line already
  named.
- Every mutant a consumer can act on — survived, uncovered, timed out, errored —
  is now announced as it is found, not only in the closing summary. Killed,
  ignored and compile-error mutants stay counts-only, as they were.

For programmatic callers, a run now hands back its verdict alongside the results
instead of the results alone, and a caller supplying its own mutation-test stage
must return both. If you only read the results, take the `results` field.

The failure identities a caller can catch — the three config-read failures, a
stage failure, a crashed or out-of-memory worker, and the generic run error —
now have a home of their own at `@systemfsoftware/stryker-js-mutation-run/errors`
instead of arriving through the config-resolution entry.
