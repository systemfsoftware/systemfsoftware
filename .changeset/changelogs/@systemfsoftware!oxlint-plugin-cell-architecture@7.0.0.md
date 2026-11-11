# @systemfsoftware/oxlint-plugin-cell-architecture@7.0.0

Removes the `no-context-generic-tag` rule and its entry in `configs.recommended`. Effect 4 has no `Context.GenericTag`, so `tsc` already refuses every use of it; declare services with `Context.Service`. A config that names `@systemfsoftware/oxlint-plugin-cell-architecture/no-context-generic-tag` must drop the entry.

Move the toolchain to `@effect/tsgo` 0.67.7 and oxlint `~1.93.0`. The `oxlint-config-*` packages now peer on oxlint `~1.93.0` (was `~1.90.0`), `oxlint-config-recommended` depends on `@effect/tsgo` `^0.67.7` and reports `effecttsgo/match-to-result-or-option` at error, and the `tsconfig` Effect presets set `matchToResultOrOption` to `error`.
