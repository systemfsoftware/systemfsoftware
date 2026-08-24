## 0.2.0

### Minor Changes

- Build an npm package as an in-memory file tree, pack it to tarball bytes, and read a tarball back — without touching the filesystem, shelling out to `npm pack`, or installing a compiler.

  `createPackage` builds a package from an authored file map, giving you `readFile`, `fileExists`, `directoryExists` and `listFiles` over it. `packPackage` and `packTree` turn a tree into tarball bytes, and `createPackageFromTarballData` reads those bytes back into a package. `toDirectoryJSON` renders the same tree for an in-memory filesystem, and `withOverlay` merges one package's files over another's.
