## 0.2.0

### Minor Changes

- `MicroVMWorkload` is a schema struct instead of a class. Its encoded shape is unchanged; build it with `MicroVMWorkload.make(...)` instead of `new`.

- First release. `MicroVMMedium` runs each child of an `effect-daemon-spec` supervisor as a workload in its own microVM sandbox: bind it with `MicroVMMedium.layer` and declare children with `Supervisor.ChildSpecs.on(MicroVMMedium.port)`. A child is ready when its workload signals readiness, its exit code and signal are reported to the supervisor, and a stop follows the declared shutdown mode. Requires a host with hardware virtualization.

### Patch Changes

- Updated dependencies:
  - @systemfsoftware/effect-daemon-conformance@0.2.0
  - @systemfsoftware/effect-daemon-spec@5.0.0
  - @systemfsoftware/effect-microsandbox@4.0.0
  - @systemfsoftware/effect-readiness@0.4.0
