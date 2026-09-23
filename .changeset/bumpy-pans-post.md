---
"@systemfsoftware/oxlint-config-recommended": major
---

The default export no longer enables any Effect rule. Effect linting now comes from two named exports you add after a base preset. `effect` is for libraries: source files get the full Effect rule set, and tests, type tests and examples get the same set without `strict-effect-provide` and `node-builtin-import`. `effectComposition` is for packages that provide layers to caller code and applies the reduced set everywhere. Both turn on `strict-boolean-expressions`, `missing-pipeable-signature`, `missed-pipeable-opportunity`, `process-env`, `any-unknown-in-error-context`, `global-date` and `global-timers` at error. Replace `extends: [recommended]` with `extends: [recommended, effect]` or `extends: [recommended, effectComposition]` to keep Effect linting.
