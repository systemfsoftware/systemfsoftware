## 3.0.1

### Patch Changes

- A `--survivors` run given a prior report that exists but does not parse now stops and names the parse failure. It previously reported that no prior report was found — the same message as an absent report — so a corrupted or truncated report looked like a missing one.

  The exit code is unchanged, and so is every admission verdict: a report whose recorded options, framework version or source content disagree with the current run still reports a mismatch, a report a `--survivors` run produced itself is still refused, an absent report still reports that none was found, and a report with no surviving mutants still ends the run without re-testing.

- Fix the CLI refusing to start with a missing-flag error when optional boolean flags were omitted. Starting a mutation run, printing help, or emitting the agent manifest now works without explicitly passing `incremental`, `force`, `ignoreStatic`, or the other boolean flags.

- Updated dependencies:
  - @systemfsoftware/effect-cell-types@4.0.0
  - @systemfsoftware/stryker-js-mutation-run@4.0.0
