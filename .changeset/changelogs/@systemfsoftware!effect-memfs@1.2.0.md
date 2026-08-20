## 1.2.0

### Minor Changes

- cut over to effect v4 (4.0.0-rc.108): public surface derives from effect types; peers flip effect ^3→^4

### Patch Changes

- Array types are spelled one way. `Array<T>` and `ReadonlyArray<T>` in emitted
  declarations become `T[]` and `readonly T[]`, which the type checker cannot tell
  apart: no exported type changes, only how it is written.

- New version is published through npm trusted publishing, so it carries a provenance attestation you can verify.

- The published package no longer advertises an export target it does not ship. Its exports map
  carried a `@systemfsoftware/source` condition pointing at `./src/index.ts`, while the package
  contains only `dist/`. Plain Node never selects that condition, so imports worked; a consumer
  whose TypeScript configuration or bundler enables it resolved to a file that was not there

- `memory-file-system.shape.ts` has its `memfs` import at the top of the file rather than the bottom. The declared types are unchanged.

- Each of these packages now has a README, so its registry page says what the package is, how
  to install it, and what to import or register — previously the page was blank. The lint
  plugins show the configuration line that enables what they recommend.

  `@systemfsoftware/stryker-js-mutation-report` also carries its licence text
