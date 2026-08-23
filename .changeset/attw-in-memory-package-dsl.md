---
"@systemfsoftware/arethetypeswrong-core": minor
---

`checkPackage` can now analyse a package built entirely in memory. `createPackage` builds a `Package` from an authored file tree without a tarball, `toDirectoryJSON` renders the same tree for an in-memory filesystem, and `recipes` provides ready-made example packages covering each kind of type-resolution problem the tool reports. `packPackage` and `packTree` turn a built package back into tarball bytes without invoking `npm pack`.
