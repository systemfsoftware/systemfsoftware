## 4.0.0

### Major Changes

- checkPackage now returns an Effect. Run the Effect instead of awaiting a Promise. The package no longer installs lru-cache.

- `PackageSpecParseError` is a class you construct rather than a function you call.

  Build one with `new PackageSpecParseError({ message })` where you previously called
  `PackageSpecParseError(message)`. The tag and the `message` field are unchanged, and
  `parsePackageSpec` still fails with it — code that only reads the failure needs no edit.

### Minor Changes

- `checkPackage` can now analyse a package built entirely in memory. `createPackage` builds a `Package` from an authored file tree without a tarball, `toDirectoryJSON` renders the same tree for an in-memory filesystem, and `recipes` provides ready-made example packages covering each kind of type-resolution problem the tool reports. `packPackage` and `packTree` turn a built package back into tarball bytes without invoking `npm pack`.

- The `Package` class is now a public export. Construct it directly when a test or tool needs a package fixture without going through a tarball.
