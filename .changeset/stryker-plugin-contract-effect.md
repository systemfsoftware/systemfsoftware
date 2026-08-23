---
"@systemfsoftware/stryker-js-plugin-api": major
---

Plugins are written against Effect instead of Promise.

`Checker`, `TestRunner`, `Reporter`, `Ignorer` and `Evaluator` are capability services whose operations return an `Effect`. Provide your plugin as a `Layer` through `declarePlugin`; the class, factory and value declarations are gone, along with the `typed-inject` dependency. Implement the operations that were optional — return `Effect.void` where there is nothing to do, and one group per mutant from `group` if you have no grouping opinion.

Each capability fails with a tagged error. Outcomes are not failures: a killed mutant, a survivor and a compile error in the code under test are successful results.

Read the sandbox path from `SandboxDirectory`. `commonTokens`, `tokens` and the plugin context types are removed. `determineHitLimitReached` returns an `Option`.
