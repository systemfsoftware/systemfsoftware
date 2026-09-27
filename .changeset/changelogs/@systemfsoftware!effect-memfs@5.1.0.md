## 5.1.0

### Minor Changes

- A failing call on an open file now reports the `PlatformError` reason its driver error code names, with the driver's syscall and path, instead of `BadResource` with the method name and an empty path for every failure: a missing path is `NotFound`, as on the file system. A closed handle still reports `BadResource`. `MemoryFileSystem.failureOf`, `MemoryFileSystem.shapeFailure` and the `MemoryFileSystemFailure` type are now exported.
