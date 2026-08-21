## 0.13.0

### Minor Changes

- cut over to effect v4 (4.0.0-rc.108): public surface derives from effect types; peers flip effect ^3→^4

- The schema-declaration ignorer now treats a `Schema.Class` identifier and a `Schema.brand` name as declaration data, exporting `CLASS_ID_IGNORED` and `BRAND_NAME_IGNORED` and suppressing those string arguments. It also exports `CLASS_FIELDS_IGNORED` for a Class fields object, but no rule emits it: ignoring the fields object would suppress the literals inside it, and a field's accepted value set is behaviour, not data.

- The `workflow-make-boundary` ignorer selects the mutation population mechanically.

  Every mutant whose ancestor chain contains no `Workflow.make(...)` call argument is excised with
  the named reason `NOT_INSIDE_WORKFLOW_MAKE`; mutants inside any make boundary pass through to the
  other ignorers. The boundary is identity-contained through the call's arguments (nested makes
  count), resolves named, aliased, and namespace imports of `Workflow`, and follows module-scope
  function references. Ships as the `./workflow-make-ignorer` subpath wired like
  `./effect-schema-ignorer`, with the AST schemas redeclared locally.

### Patch Changes

- Array types are spelled one way. `Array<T>` and `ReadonlyArray<T>` in emitted
  declarations become `T[]` and `readonly T[]`, which the type checker cannot tell
  apart: no exported type changes, only how it is written.

- New version is published through npm trusted publishing, so it carries a provenance attestation you can verify.

- The `atom` packages publish their own author rather than crediting an upstream they are not downstream of, and `stryker-plugins` no longer pulls Node's ambient types into a package that has no runtime dependency on them.

- Fix two `test:types` scripts that could not pass.

  `tstyche` exits 1 with "No test files were selected using current configuration" when nothing matches
  `testFileMatch`, so a watcher pointed at files that do not exist is a script guaranteed to fail the
  moment anyone runs it. Measured directly: `effect-gherkin-spec`'s `tstyche.json` matched
  `src/**/*.tst.ts` and the package holds no such file, so its `test:types` script is removed rather than
  left as a gate attached to nothing. `stryker-plugins` now pins `TSTYCHE_TYPESCRIPT_MODULE` so its own
  `test:types` resolves the TypeScript module it needs.

  Both packages publish, and both scripts ship in the published `package.json`, so a consumer inspecting
  or running them sees the change — a real patch rather than an empty intent.

- Updated dependencies:
  - @systemfsoftware/stryker-js-plugin-api@2.0.0
