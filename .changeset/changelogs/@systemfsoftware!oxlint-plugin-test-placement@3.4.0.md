## 3.4.0

### Minor Changes

- Two new lint rules ship enabled and blocking. An in-source test may now contain only property tests, and every property-test generator must be derivable from a declared schema: generators assembled by hand from raw primitives fail lint, and example-style blocks fail lint outright. Upgrading surfaces new errors wherever your codebase still uses those shapes; each diagnostic states the fix — derive the generator from a schema, or delete the block.

- cut over to effect v4 (4.0.0-rc.108): public surface derives from effect types; peers flip effect ^3→^4

### Patch Changes

- New version is published through npm trusted publishing, so it carries a provenance attestation you can verify.

- Peer Effect requirement advances to 4.0.0-rc.112. No API changes.
