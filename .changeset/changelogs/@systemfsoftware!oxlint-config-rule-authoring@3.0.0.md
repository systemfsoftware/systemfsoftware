# @systemfsoftware/oxlint-config-rule-authoring@3.0.0

Move the toolchain to `@effect/tsgo` 0.67.7 and oxlint `~1.93.0`. The `oxlint-config-*` packages now peer on oxlint `~1.93.0` (was `~1.90.0`), `oxlint-config-recommended` depends on `@effect/tsgo` `^0.67.7` and reports `effecttsgo/match-to-result-or-option` at error, and the `tsconfig` Effect presets set `matchToResultOrOption` to `error`.
