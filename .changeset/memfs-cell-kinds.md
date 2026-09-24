---
"@systemfsoftware/effect-memfs": minor
---

The file system resource and its handles are built on the `Resource` and `Handle` kinds. `MemoryFileSystem.withContents` and `MemoryFileSystem.withCwd` are now also `dual`s over the resource, so `MemoryFileSystem.make(contents).pipe(MemoryFileSystem.withCwd('/home'))` works beside the method chain, and `isMemoryFileSystemResource` recognises a resource.
