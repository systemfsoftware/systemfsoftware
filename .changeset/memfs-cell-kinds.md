---
"@systemfsoftware/effect-memfs": major
---

The file system is a `Blueprint` and its open files are `Handle`s.

- `MemoryFileSystemResource` and `isMemoryFileSystemResource` are renamed `MemoryFileSystemBlueprint` and `isMemoryFileSystemBlueprint`.
- `MemoryFileSystem.withContents` and `MemoryFileSystem.withCwd` are also `dual`s, so `MemoryFileSystem.make(contents).pipe(MemoryFileSystem.withCwd('/home'))` works beside the method chain.
