---
"@systemfsoftware/arethetypeswrong": major
---

This package was published as `@systemfsoftware/arethetypeswrong-core`. Depend on `@systemfsoftware/arethetypeswrong` instead — the first release under the new name is `4.0.0`, continuing the version history of the old one.

The in-memory package model now installs separately. `Package`, `createPackage`, `createPackageFromTarballData`, `toDirectoryJSON`, `packPackage` and `packTree` are no longer exported here. Add `@systemfsoftware/npm-package` and import them from there; `checkPackage` still accepts the `Package` it builds.

`PackageStoreAdapter` is now `PackageStore`, and its layers are `PackageStoreLive` and `PackageStoreStub`. `TarballAdapter`, `TypescriptAdapter`, `LexerAdapter`, `ResolverAdapter` and the ready-made example packages are no longer exported.
