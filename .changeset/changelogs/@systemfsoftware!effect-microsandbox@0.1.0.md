## 0.1.0

### Minor Changes

- Add @systemfsoftware/effect-microsandbox: Effect-native microVM integration-test containers over the microsandbox SDK — pure-data MicroVMSpec specs, Scope/Layer lifecycle, host-side readiness probes, argv-only exec, log streams, and fail-closed loopback port mapping.

### Patch Changes

- Publish initial release of `@systemfsoftware/effect-readiness` for polling network port, HTTP, and log-stream readiness.

- effect-microsandbox now builds its virtualization preflight on @systemfsoftware/effect-cell-types, adding it as a runtime dependency; verdict selection and remediation rendering are decided by a typed virtualization-verdict cell. Plan rendering and wait defaults are unchanged.

- Updated dependencies:
  - @systemfsoftware/effect-cell-types@9.0.0
