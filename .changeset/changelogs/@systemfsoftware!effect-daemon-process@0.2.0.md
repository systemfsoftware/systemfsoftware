## 0.2.0

### Minor Changes

- First release. `ProcessMedium` supervises operating-system child processes as children of an `effect-daemon-spec` supervisor: bind it with `ProcessMedium.layer` and declare children with `Supervisor.ChildSpecs.on(ProcessMedium.port)`. A child is ready when its declared readiness line appears, its exit code and terminating signal are reported as observed, and a graceful stop sends `SIGTERM` before forcing `SIGKILL`.

### Patch Changes

- Updated dependencies:
  - @systemfsoftware/effect-daemon-conformance@0.2.0
  - @systemfsoftware/effect-daemon-spec@5.0.0
