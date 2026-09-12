---
"@systemfsoftware/oxlint-plugin-effect-entrypoint": minor
---

`runtime-construction-placement` is a new rule reporting two shapes in runtime code — a file in the package's source directory, or a test file: `ManagedRuntime.make`, `Layer.provide`, or `Cell.provide` inside a function body, where wiring rebuilt per call is a runtime per call; and `ManagedRuntime.make` at module scope, where importing the module starts work nothing can interrupt. A package-root hook, config, or setup file is outside the rule's subject: a test runner's hook module may compose at module scope.

Unreported in scope: a module-scope closure that writes the construction into a cache binding (`runtime ??= ManagedRuntime.make(AppLive)`); module-scope `Layer.provide`/`Cell.provide` graphs; `cell.run(input)` at any depth; and the process entry, exempt from the module-scope verdict.

A call reached through a re-export chain is not seen.
