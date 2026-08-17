---
'@systemfsoftware/oxlint-plugin-test-placement': minor
'@systemfsoftware/oxlint-plugin-effect-dmmf': minor
---

A new rule, `no-io-module-in-source-test`, reports an in-source test block in a module that performs I/O.

It decides that a module performs I/O from the module's own syntax: a binding imported from a filesystem, process or network module and then called. A type-only import is ignored, on both the statement and the inline form, because nothing it names survives to run. A binding that is imported but never called is ignored too. The report lands on the in-source test guard.

The rule reads nothing but the module you give it — not its name, not its directory. A module whose tests live in separate files is a no-op for this rule, whatever it imports, so enabling it changes nothing for a project that keeps tests outside source.

It is enabled at error severity in the recommended set of both packages, so spreading that set is all it takes.
