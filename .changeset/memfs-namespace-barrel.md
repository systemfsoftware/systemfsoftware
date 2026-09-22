---
"@systemfsoftware/effect-memfs": major
---

The package now exports a single `MemoryFileSystem` namespace. Build a filesystem with `MemoryFileSystem.make(contents)`, adjust it with `.withContents(...)` and `.withCwd(...)`, and get the platform port from `.layer` or `.effect`.

The top-level `make`, `layer`, and `layerWith` exports are removed:

- `layer` becomes `MemoryFileSystem.make().layer`.
- `layerWith(contents)` becomes `MemoryFileSystem.make(contents).layer`.
- `make(contents, { cwd })`, which returned a `FileSystem` directly, becomes `MemoryFileSystem.make(contents).withCwd(cwd).effect`, an `Effect` that yields the `FileSystem`.

File bodies in `contents` may be any `Uint8Array`, not only a Node `Buffer`. A plain `Uint8Array` body used to become an empty directory; it is now a file holding those bytes. A body keyed by a relative path is placed under the filesystem's working folder, as string bodies already were.

Writing to an open file past the first chunk no longer fails with an out-of-range error, and writes now land at the file position the cursor reports.

`watch` now emits events. It reports `Create`, `Update`, and `Remove` for changes made to the watched path and releases the underlying watcher when the stream's scope closes.
