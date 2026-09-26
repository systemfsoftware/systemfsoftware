---
"@systemfsoftware/effect-memfs": minor
---

A failing call on an open file now reports the `PlatformError` reason its driver error code names, with the driver's syscall, instead of `BadResource` for every failure: a missing path is `NotFound`, as on the file system. A closed handle still reports `BadResource`. `MemoryFileSystem.failureOf`, `MemoryFileSystem.shapeFailure` and the `MemoryFileSystemFailure` type are now exported.
