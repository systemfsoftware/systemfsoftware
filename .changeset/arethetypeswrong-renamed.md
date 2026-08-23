---
"@systemfsoftware/arethetypeswrong": major
---

Renamed from `@systemfsoftware/arethetypeswrong-core`, which stopped at `4.0.0`. The first release under the new name is `5.0.0`, continuing that sequence.

`Package`, `createPackage`, `createPackageFromTarballData`, `toDirectoryJSON`, `packPackage`, `packTree` and `DirectoryJSON` now come from `@systemfsoftware/npm-package`. `checkPackage` still accepts the `Package` it builds.

`Package` no longer carries the `@types` companion — `typesPackage`, `containsTypes` and `mergedWithTypes` are gone from it. Build the pair with `withTypesCompanion(pkg, typesPkg)` and pass it to `checkPackage`; for declaration-file detection call the standalone `containsTypes(pkg)`.

`PackageStoreAdapter` is now `PackageStore` (`PackageStoreLive`, `PackageStoreStub`). `TarballAdapter`, `TypescriptAdapter`, `LexerAdapter`, `ResolverAdapter` and `recipes` are no longer exported; nothing replaces `recipes`.
