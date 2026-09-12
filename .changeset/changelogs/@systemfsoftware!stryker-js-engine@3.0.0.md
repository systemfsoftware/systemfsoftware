## 3.0.0

### Major Changes

- The bundled `@noble/hashes` dependency advances from `1.8.0` to `2.4.0`. Hashing and random-byte generation are unchanged — the same digests and the same output. The CLI now requires **Node 20.19 or later**; on an earlier Node it will not start.

### Patch Changes

- Releases the workspace so its published versions track the shared dependency graph this change moves.

- The `@systemfsoftware/source` export condition is gone. It resolved to a package's TypeScript sources for editors and in-repo typechecks; each package now exports only its built entry. If your tsconfig sets `customConditions: ["@systemfsoftware/source"]`, or a bundler config names that condition, remove it — resolution falls back to the built entry, which is what every consumer already got.

- Updated dependencies:
  - @systemfsoftware/stryker-js-instrumenter@6.0.0
