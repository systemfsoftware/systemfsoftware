## 0.2.0

### Minor Changes

- First release. `ClusterMedium` supervises Effect cluster singletons and entities as children of an `effect-daemon-spec` supervisor: bind it with `ClusterMedium.layer` and declare children with `Supervisor.ChildSpecs.on(ClusterMedium.port)`. A child is ready once it is registered, its death is inferred from failed liveness calls, and a group stop completes on the cluster's own schedule.

### Patch Changes

- Updated dependencies:
  - @systemfsoftware/effect-daemon-conformance@0.2.0
  - @systemfsoftware/effect-daemon-spec@5.0.0
