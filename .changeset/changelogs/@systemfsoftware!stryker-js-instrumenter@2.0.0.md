## 2.0.0

### Major Changes

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

### Patch Changes

- Selecting `workflow-make-boundary` keeps mutants inside `Workflow.make` decision bodies.

  Ignore plugins are asked about each mutant, not about the file root with a subtree latch. An inverted selector that answers "ignore" for everything outside a make body therefore no longer ignores the make body itself. Inner mutants of declaration-style ignore plugins (`effect-schema-declarations`, Angular signal option objects) are still ignored.

- Instrumenting a file that calls a method named after an `Object.prototype`
  member - `toString`, `valueOf`, `constructor` and the rest - no longer fails
  with `Property name expected type of string but got function`. The method
  mutator's replacement table answered such a lookup with the inherited function
  rather than reporting no replacement, and a single `.toString()` call was enough
  to stop the run. Those methods are now left alone, as they always should have
  been.

- Updated dependencies:
  - @systemfsoftware/effect-cell-types@5.0.0
