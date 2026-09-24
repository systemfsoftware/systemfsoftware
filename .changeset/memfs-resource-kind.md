---
"@systemfsoftware/effect-memfs": major
---

The in-memory file system is now a `Resource` and `Handle` cell kind, and an open file is a handle released with the scope that opened it. An operation on an open file after it closed now dies with `HandleReleased` instead of failing with `BadResource`.

- `MemoryFileSystem.make` now requires the initial contents: pass `{}` for an empty volume.
- The resource's `effect` projection and the standalone `effect(spec)` and `layer(spec)` are removed; acquire the volume with the resource's `scoped` or provide its `layer`.
- `resource.withContents(...)` and `resource.withCwd(...)` are now `pipe` combinators: `MemoryFileSystem.make(contents).pipe(MemoryFileSystem.withCwd('/home'))`.
- The exported `TypeId` is removed.
