---
'@systemfsoftware/stryker-js': major
'@systemfsoftware/stryker-js-html-reporter': major
'@systemfsoftware/stryker-js-cli': major
'@systemfsoftware/stryker-js-instrumenter': major
'@systemfsoftware/stryker-js-typescript-checker': major
'@systemfsoftware/stryker-js-vitest-runner': major
'@systemfsoftware/stryker-plugins': major
'@systemfsoftware/stryker-test-contribution': major
---

The packages are renamed. `plugin-api` is now `@systemfsoftware/stryker-js`, the
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
