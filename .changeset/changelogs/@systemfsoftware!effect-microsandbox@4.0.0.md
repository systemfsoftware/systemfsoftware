## 4.0.0

### Major Changes

- `ExposedPort`, `ServiceSpec`, `JobSpec` and `JobCompletion` are schema structs (`ServiceSpec` and `JobSpec` tagged) instead of classes. Their encoded shapes are unchanged; build values with `.make(...)` instead of `new`.

### Patch Changes

- Every tagged error class now has a one-line message built from its fields, so a failure shows what went wrong instead of an empty message.

- Updated dependencies:
  - @systemfsoftware/effect-readiness@0.4.0
