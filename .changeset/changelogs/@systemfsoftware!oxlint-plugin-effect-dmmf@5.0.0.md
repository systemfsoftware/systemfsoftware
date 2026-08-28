## 5.0.0

### Major Changes

- The extra entry that asserted a schema rejects invalid input is gone. If you imported it to declare those assertions, drop that import — the package now ships only the round-trip laws.

  The lint rule that forbade restating those round-trip laws in a schema property test is also gone. If you still listed no-schema-law-duplicate among your rules, delete that name.

### Patch Changes

- Peer Effect requirement advances to 4.0.0-rc.112. No API changes.

- Updated dependencies:
  - @systemfsoftware/oxlint-plugin-effect-schema@5.0.0
