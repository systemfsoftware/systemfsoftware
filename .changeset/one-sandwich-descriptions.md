---
"@systemfsoftware/effect-cell-types": major
"@systemfsoftware/all": none
"@systemfsoftware/effect-daemon-spec": none
"@systemfsoftware/effect-schema-extensions": none
"@systemfsoftware/hex-schema": none
"@systemfsoftware/omp-agent-discipline": none
"@systemfsoftware/omp-claude-compat": none
"@systemfsoftware/oxlint-plugin-cell-vocabulary": none
"@systemfsoftware/stryker-js": none
"@systemfsoftware/stryker-js-cli": none
"@systemfsoftware/stryker-js-html-reporter": none
"@systemfsoftware/stryker-js-instrumenter": none
"@systemfsoftware/stryker-js-platform-node": none
"@systemfsoftware/stryker-js-typescript-checker": none
"@systemfsoftware/stryker-js-vitest-runner": none
"@systemfsoftware/stryker-plugins": none
"@systemfsoftware/stryker-test-contribution": none
---

A `Cell` description is now exactly one sandwich: read, decode, decide, encode, write. The `layers` member and the `Layer` type are deleted, `Cell.read` no longer accepts a `previous` argument, and `Cell.apply` runs that single fold; multi-layer replay no longer exists.

`Cell.layer(spec)` is new: the same description built from one object. `{ read, decide, write }` composes with identity decode and encode; `{ read, decode, decide, encode, write }` is the full form. A spec with only one of decode/encode, or a short-form write that cannot receive the decide outcome, is a compile error.

Migrating: two layers become two descriptions applied in sequence in the calling `Effect.gen`; a write already receives the read's value as its second parameter.
