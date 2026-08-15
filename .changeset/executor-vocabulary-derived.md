---
'@systemfsoftware/oxlint-plugin-effect-executor': minor
---

`executor-no-io-in-filling` and `executor-requires-description` no longer declare their own phase vocabulary. The pure-phase set, the description module name, the I/O-cell classification and the description-method list are rendered into `src/rules/vocabulary.generated.ts` by walking a Cell description, and `pnpm check:executor-vocabulary` fails when that file does not reproduce byte-for-byte from a fresh walk.

Neither rule changes what it decides, and neither is delivered any differently — both stay at `error` in `configs.recommended`, reaching every package that extends the aggregate. What changed is where their vocabulary comes from: adding a phase or reclassifying a cell now moves both rules with no edit in this package.

The vocabulary arrives as a generated module rather than an import because this package cannot depend on the description. Turbo reports the cycle `effect-executor -> effect-cell-types -> effect-gherkin-spec -> oxlint-config -> effect-dmmf -> effect-executor` and names that first edge as the only breakable one.
