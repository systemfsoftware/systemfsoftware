## 2.0.0

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

- effect is now a required peer dependency. Install it alongside these packages. They previously bundled their own copy, which meant two Effect instances in one process and services that could not find each other across the boundary.

- Five entry points that were never API are gone. Each existed because another
  package in this project found the code convenient, not because it was a surface
  anyone should depend on.

  What is left is documented: an entry point is a name you may import and we may
  not move without a major, and everything else is internal whatever file it sits
  in.

- Reporters are constructed by a factory and provided as a layer.

  The exported reporter classes are gone. Replace each `new` with the matching
  factory — `makeClearTextReporter`, `makeHtmlReporter`, `makeJsonReporter`,
  `makeProgressBarReporter`, `makeProgressStreamReporter`.

  Each factory takes the reporter's own options rather than an injected container,
  and each operation returns an `Effect`. If you registered a reporter as a plugin,
  declare it with `declarePlugin` and hand over a layer that provides `Reporter`.

  `drawClearTextScoreTable` is now exported for anyone rendering the score table
  outside a reporter.

### Patch Changes

- New version is published through npm trusted publishing, so it carries a provenance attestation you can verify.

- Peer Effect requirement advances to 4.0.0-rc.112. No API changes.

- A mutation run writes the JSON report the `json` reporter is configured to produce.

  Vitest no longer reprints its full summary for every mutant.

- Each of these packages now has a README, so its registry page says what the package is, how
  to install it, and what to import or register — previously the page was blank. The lint
  plugins show the configuration line that enables what they recommend.

  `@systemfsoftware/stryker-js-html-reporter` also carries its licence text

- Published packages no longer carry build artifacts left over from earlier builds. One package was shipping about a megabyte of bundled test-runner internals this way.

- Updated dependencies:
  - @systemfsoftware/stryker-js@2.0.0
