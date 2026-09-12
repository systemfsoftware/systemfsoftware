## 6.0.0

### Major Changes

- Nothing a consumer can observe moved in the four packages above, so no release is warranted.

  `@systemfsoftware/stryker-js-instrumenter` now answers with promises: `transform` and `placeHeader` return `Promise`, and `AstTransformer` is a promise-returning function type. Await them where you call them. The parser is read on first use rather than at import, so importing this package no longer constructs Node's WebAssembly runtime, and `ExperimentalWarning: WASI` no longer appears until something is actually parsed.

### Patch Changes

- Releases the workspace so its published versions track the shared dependency graph this change moves.

- The `@systemfsoftware/source` export condition is gone. It resolved to a package's TypeScript sources for editors and in-repo typechecks; each package now exports only its built entry. If your tsconfig sets `customConditions: ["@systemfsoftware/source"]`, or a bundler config names that condition, remove it — resolution falls back to the built entry, which is what every consumer already got.
