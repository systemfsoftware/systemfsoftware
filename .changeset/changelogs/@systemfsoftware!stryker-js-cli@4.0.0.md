## 4.0.0

### Major Changes

- `CliRequest` is a type, not a schema. It described a value the CLI builds in
  memory and hands to its own dispatcher, so nothing ever decoded it, and its
  declared `options` were the fully resolved option set rather than the partial
  overlay a command line actually carries. Import it with `import type`; if you
  were decoding with it, decode the options you have against the language
  package's `Schema` export instead.

  Captured console output renders objects differently. In machine mode the CLI
  captures what a run writes to the console, and an object now appears as
  `{"a":1}` where it previously appeared as `{ a: 1 }`. Strings, numbers and
  format specifiers such as `%s` and `%d` are unchanged.

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

### Minor Changes

- Machine-readable mutation progress is a newline-delimited JSON file next to the HTML and JSON reports, not the console.

  The console prints bounded progress prose: phase names, a count line, at most twenty surviving mutants, and a verdict. Killed mutants now advance that count. Child test runs during mutation no longer print per-test output or GitHub workflow commands.

  If you parsed the console as JSON lines, read the stream file instead. A hard kill can leave that file without a closing verdict line.

### Patch Changes

- The shared base preset is importable again at `./config/base`, so a config file can inherit it with `"extends"` instead of restating every setting. The entry had stopped being published, which silently broke any config that inherited from it.

  The command manifest now lists the entry points the installed package actually declares, rather than a list written by hand that could disagree with it.

- A setting given a value it does not allow now says which setting and what it accepts, and stops the run before anything is instrumented. It used to surface the raw decode failure with an internal stack trace, point the reader at a report the run never wrote, and exit as though the run itself had failed rather than the configuration.

  The message names the option and its accepted form, the remediation points at the config file, and the exit code is the one reserved for a configuration mistake.

- Asking the tool for help, asking which version it is, or invoking it with no arguments at all, now prints something. All three were silent: no text on a terminal, and no closing line for a consumer parsing the output. Asking for the version was additionally reported as a usage mistake and exited non-zero.

  Each now renders its text to a terminal as prose, and to a parsed stream as the run's final `help` line carrying exit code 0 and the rendered text. An undeclared option is still refused.

- Asking for a run addressed to a person now gets prose. Every stage, the plan and the closing verdict were written as machine lines whatever the mode, so a reader got a stream of JSON and the count of files being mutated was reported to nobody at all.

  A run addressed to a person reports how many of its files it is about to mutate and writes no machine lines; a run addressed to a program is unchanged.

- A mutation run writes the JSON report the `json` reporter is configured to produce.

  Vitest no longer reprints its full summary for every mutant.

- The closing verdict line carries its findings again. It had shrunk to the score alone, so a consumer reading the stream could no longer see the score limits the run was held to, where the report was written, or which mutants survived — the survivors were reported while the run was in flight and then absent from the summary that closes it.

  The verdict now states the thresholds, the report path, and every surviving mutant with its file, position, mutator and replacement.

- Updated dependencies:
  - @systemfsoftware/effect-cell-types@5.0.0
