# @systemfsoftware/effect-schema-law@6.1.3

Rebuilt against the new `@systemfsoftware/oxlint-config-recommended` and `@systemfsoftware/oxlint-plugin-cell-architecture` releases; the exported API is unchanged.

Move the toolchain to `@effect/tsgo` 0.67.7 and oxlint `~1.93.0`. The `oxlint-config-*` packages now peer on oxlint `~1.93.0` (was `~1.90.0`), `oxlint-config-recommended` depends on `@effect/tsgo` `^0.67.7` and reports `effecttsgo/match-to-result-or-option` at error, and the `tsconfig` Effect presets set `matchToResultOrOption` to `error`.
