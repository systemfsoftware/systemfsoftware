## 2.0.0

### Major Changes

- Port the library to the effect v4 release candidate (`effect@^4.0.0-rc.108`). `feature(meta, { runtime })` is replaced by `feature(meta, { context })` — v4 removed the Runtime module; the play edge now runs through `Effect.runPromiseExitWith` with an optional `Context` (default `Context.empty()`). Internally: `Either` → `Result`, `Effect.catchAllCause` → `catchCause`, `Exit.isInterrupted` → `hasInterrupts`, `Schema.decodeUnknownEither` → `decodeEffect`, schema captures now type as `ConstraintDecoder` (the v4 no-context view), and tagged errors construct via `.make`.

  BREAKING CHANGE: `FeatureOptions.runtime` is removed; pass `context` instead.

### Minor Changes

- cut over to effect v4 (4.0.0-rc.108): public surface derives from effect types; peers flip effect ^3→^4

### Patch Changes

- New version is published through npm trusted publishing, so it carries a provenance attestation you can verify.

- Each of these packages now has a README, so its registry page says what the package is, how
  to install it, and what to import or register — previously the page was blank. The lint
  plugins show the configuration line that enables what they recommend.

  `@systemfsoftware/stryker-js-mutation-report` also carries its licence text
