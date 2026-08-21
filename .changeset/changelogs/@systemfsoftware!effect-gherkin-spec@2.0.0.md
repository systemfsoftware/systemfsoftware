## 2.0.0

### Major Changes

- Collapse projection tags into the ports they projected

  A `*ExecutorDeps` tag whose service type was indexed off other ports recorded which members
  one operation happened to reach for. Exporting it turned internal composition into a surface
  commitment: a consumer had to discover and provide an aggregator for each operation, where the
  port it came from already served. The tags rode the `R` channel of exported signatures, so a
  consumer met them only at their own call site.

  Each was removed the way its evidence directed — no tag was renamed, and none was replaced:

  - `AttwCliExecutorDeps`, `CheckPackageExecutorDeps` — deleted. Zero consumers, no Live layer;
    callers already required the real capabilities directly.
  - `HookDispatcherExecutorDeps` — was a 1:1 alias of `Scope.Scope`. Requiring `Scope` names the
    same service.
  - `InjectInstructionsExecutorDeps` — packed `FileSystem`, `Path` and `TomlLoader` with no logic.
    Consumers require the three ports.
  - `EffectVitestDeps` → `EffectVitestBindings`. Never a `Context.Tag`: a plain type alias already
    passed as an ordinary parameter, so only the name misdescribed it. A stale api report that no
    `api-extractor` regenerates was deleted with it.

  A consumer providing a port instead of an aggregator provides no more than before, since a
  service `{ a, b }` is assignable to a requirement `{ a }`.

### Minor Changes

- cut over to effect v4 (4.0.0-rc.108): public surface derives from effect types; peers flip effect ^3→^4

### Patch Changes

- Array types are spelled one way. `Array<T>` and `ReadonlyArray<T>` in emitted
  declarations become `T[]` and `readonly T[]`, which the type checker cannot tell
  apart: no exported type changes, only how it is written.

- New version is published through npm trusted publishing, so it carries a provenance attestation you can verify.

- Fix two `test:types` scripts that could not pass.

  `tstyche` exits 1 with "No test files were selected using current configuration" when nothing matches
  `testFileMatch`, so a watcher pointed at files that do not exist is a script guaranteed to fail the
  moment anyone runs it. Measured directly: `effect-gherkin-spec`'s `tstyche.json` matched
  `src/**/*.tst.ts` and the package holds no such file, so its `test:types` script is removed rather than
  left as a gate attached to nothing. `stryker-plugins` now pins `TSTYCHE_TYPESCRIPT_MODULE` so its own
  `test:types` resolves the TypeScript module it needs.

  Both packages publish, and both scripts ship in the published `package.json`, so a consumer inspecting
  or running them sees the change — a real patch rather than an empty intent.
