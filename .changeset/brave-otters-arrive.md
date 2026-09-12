---
"@systemfsoftware/effect-daemon-spec": none
"@systemfsoftware/effect-schema-extensions": none
"@systemfsoftware/hex-schema": none
"@systemfsoftware/stryker-js-engine": none
"@systemfsoftware/stryker-js-instrumenter": major
---

Nothing a consumer can observe moved in the four packages above, so no release is warranted.

`@systemfsoftware/stryker-js-instrumenter` now answers with promises: `transform` and `placeHeader` return `Promise`, and `AstTransformer` is a promise-returning function type. Await them where you call them. The parser is read on first use rather than at import, so importing this package no longer constructs Node's WebAssembly runtime, and `ExperimentalWarning: WASI` no longer appears until something is actually parsed.
