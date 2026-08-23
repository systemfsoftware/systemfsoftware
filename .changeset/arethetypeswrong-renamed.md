---
"@systemfsoftware/arethetypeswrong": major
---

Renamed from `@systemfsoftware/arethetypeswrong-core`; the first release under the new name is `4.0.0`, continuing the old package's history.

`Package`, `createPackage`, `createPackageFromTarballData`, `toDirectoryJSON`, `packPackage`, `packTree` and `DirectoryJSON` now come from `@systemfsoftware/npm-package`. `checkPackage` still accepts the `Package` it builds.

`Package` no longer carries the `@types` companion — `typesPackage`, `containsTypes` and `mergedWithTypes` are gone from it. Build the pair with `withTypesCompanion(pkg, typesPkg)` and pass it to `checkPackage`; for declaration-file detection call the standalone `containsTypes(pkg)`.

`PackageStoreAdapter` is now `PackageStore` (`PackageStoreLive`, `PackageStoreStub`). `TarballAdapter`, `TypescriptAdapter`, `LexerAdapter`, `ResolverAdapter` and `recipes` are no longer exported; nothing replaces `recipes`.
