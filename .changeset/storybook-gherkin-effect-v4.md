---
"@systemfsoftware/storybook-gherkin": major
---

Port the library to the effect v4 release candidate (`effect@^4.0.0-rc.108`). `feature(meta, { runtime })` is replaced by `feature(meta, { context })` — v4 removed the Runtime module; the play edge now runs through `Effect.runPromiseExitWith` with an optional `Context` (default `Context.empty()`). Internally: `Either` → `Result`, `Effect.catchAllCause` → `catchCause`, `Exit.isInterrupted` → `hasInterrupts`, `Schema.decodeUnknownEither` → `decodeEffect`, schema captures now type as `ConstraintDecoder` (the v4 no-context view), and tagged errors construct via `.make`.

BREAKING CHANGE: `FeatureOptions.runtime` is removed; pass `context` instead.
