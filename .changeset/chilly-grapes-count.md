---
"@systemfsoftware/oxlint-config-recommended": patch
"@systemfsoftware/tsconfig": patch
---

Both presets stop enabling `strict-effect-provide` (`strictEffectProvide` in the language service), so an `Effect.provide` with a Layer passes without an opt-out. You can delete any `overrides` entry or `@effect-diagnostics` directive you added to turn the rule off. To keep the check, set `effecttsgo/strict-effect-provide` to `error` in your lint configuration, or `strictEffectProvide` to `error` in your tsconfig's `diagnosticSeverity`.
