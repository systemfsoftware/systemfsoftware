## 5.3.0

### Minor Changes

- Two new lint rules ship enabled and blocking. An in-source test may now contain only property tests, and every property-test generator must be derivable from a declared schema: generators assembled by hand from raw primitives fail lint, and example-style blocks fail lint outright. Upgrading surfaces new errors wherever your codebase still uses those shapes; each diagnostic states the fix — derive the generator from a schema, or delete the block.

### Patch Changes

- New version is published through npm trusted publishing, so it carries a provenance attestation you can verify.

- Peer Effect requirement advances to 4.0.0-rc.112. No API changes.

- Updated dependencies:
  - @systemfsoftware/oxlint-plugin-effect-workflow@5.0.0
