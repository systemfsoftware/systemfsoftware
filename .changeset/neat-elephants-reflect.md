---
"@systemfsoftware/oxlint-config-recommended": minor
---

Depends on `oxlint` at `~1.89.0` (was `~1.87.0`) and `@effect/tsgo` at `^0.54.1` (was `^0.51.1`). `@effect/tsgo` 0.54 adds `effecttsgo/schema-class-missing-brand`, `effecttsgo/error-payload-shadows-name`, `effecttsgo/flat-map-to-tap` and `effecttsgo/effect-sleep-zero-to-yield-now`, and this preset reports all four as errors, so a lint run can fail on code that passed before.
