---
"@systemfsoftware/stryker-js-cli": minor
"@systemfsoftware/stryker-js-engine": major
---

A run's verdict now reaches the exit code, and an interrupted run reports the
signal that stopped it.

- A score below the breaking threshold printed the score, said it was too low,
  and exited `0`, so a step that checked the status passed no matter how low the
  score fell. A failing verdict now fails the command.
- A run stopped with `Ctrl-C` or `SIGTERM` reported the interruption and then
  exited `1` anyway. The status is now `128 + n` for the signal that ended the
  run — `130` for `SIGINT`, `143` for `SIGTERM`.
- Every mutant you can act on — survived, uncovered, timed out, errored — is
  announced as it is found, not only in the closing summary.
