## 1.5.2

### Patch Changes

- Array types are spelled one way. `Array<T>` and `ReadonlyArray<T>` in emitted
  declarations become `T[]` and `readonly T[]`, which the type checker cannot tell
  apart: no exported type changes, only how it is written.

- New version is published through npm trusted publishing, so it carries a provenance attestation you can verify.

- Declare the effect-schema-law peer dependency as a workspace range so recursive versioning resolves it.

- Each of these packages now has a README, so its registry page says what the package is, how
  to install it, and what to import or register — previously the page was blank. The lint
  plugins show the configuration line that enables what they recommend.

  `@systemfsoftware/stryker-js-mutation-report` also carries its licence text

- Generated schema law suites no longer fail to load when a module exports a value derived from a schema rather than a schema itself — a type guard from `Schema.is`, a decoder, an encoder, or an arbitrary. Such an export is skipped instead of being handed to the round-trip laws.

- Generated schema laws no longer break when a package exports a value read off a
  codec or JSON-Schema document, such as `Schema.toJsonSchemaDocument(x).schema`.
  Those exports are uses of a schema rather than schemas, and generating
  round-trip laws for one made the whole generated suite fail to load, reporting
  no tests at all. They are now skipped, so the suite runs the laws for the real
  schemas beside them.

  The set of members recognised as uses is also complete now: the encode side was
  missing its `Exit`, `Option`, `Result` and `Promise` variants, so a schema whose
  declaration used one of those was skipped when it should have been law-tested.

- Updated dependencies:
  - @systemfsoftware/effect-schema-law@0.7.0
