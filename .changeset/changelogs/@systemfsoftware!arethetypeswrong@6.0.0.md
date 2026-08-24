## 6.0.0

### Major Changes

- Renamed from `@systemfsoftware/arethetypeswrong-core`, which stopped at `4.0.0`. The first release under the new name is `5.0.0`, continuing that sequence.

  `Package`, `createPackage`, `createPackageFromTarballData`, `toDirectoryJSON`, `packPackage`, `packTree` and `DirectoryJSON` now come from `@systemfsoftware/npm-package`. `checkPackage` still accepts the `Package` it builds.

  `Package` no longer carries the `@types` companion — `typesPackage`, `containsTypes` and `mergedWithTypes` are gone from it. Build the pair with `withTypesCompanion(pkg, typesPkg)` and pass it to `checkPackage`; for declaration-file detection call the standalone `containsTypes(pkg)`.

  `PackageStoreAdapter` is now `PackageStore` (`PackageStoreLive`, `PackageStoreStub`). `TarballAdapter`, `TypescriptAdapter`, `LexerAdapter`, `ResolverAdapter` and `recipes` are no longer exported; nothing replaces `recipes`.

- checkPackage now returns an Effect. Run the Effect instead of awaiting a Promise. The package no longer installs lru-cache.

- `PackageSpecParseError` is a class you construct rather than a function you call.

  Build one with `new PackageSpecParseError({ message })` where you previously called
  `PackageSpecParseError(message)`. The tag and the `message` field are unchanged, and
  `parsePackageSpec` still fails with it — code that only reads the failure needs no edit.

- Aggregated dependency tags are removed. `AttwCliExecutorDeps`, `CheckPackageExecutorDeps`, `HookDispatcherExecutorDeps` and `InjectInstructionsExecutorDeps` are gone; provide the capabilities themselves instead of an aggregate that bundled them. `HookDispatcherExecutorDeps` was only ever `Scope`, so require `Scope` directly.

  `EffectVitestDeps` is renamed to `EffectVitestBindings`. It was never a tag — it is an ordinary type you pass as a parameter, and only its name suggested otherwise.

  Providing a capability where an aggregate was expected costs you nothing: a value carrying more members than a requirement asks for still satisfies it.

### Minor Changes

- `checkPackage` can now analyse a package built entirely in memory, with no tarball and no files on disk.

- cut over to effect v4 (4.0.0-rc.108): public surface derives from effect types; peers flip effect ^3→^4

### Patch Changes

- New version is published through npm trusted publishing, so it carries a provenance attestation you can verify.

- Updated dependencies:
  - @systemfsoftware/npm-package@0.2.0
