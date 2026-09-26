## 5.0.0

### Major Changes

- `MemoryFileSystemSpec` is a schema struct instead of a class. Its encoded shape is unchanged; build it with `MemoryFileSystemSpec.make(...)` instead of `new`.

### Patch Changes

- Every tagged error class now has a one-line message built from its fields, so a failure shows what went wrong instead of an empty message.
