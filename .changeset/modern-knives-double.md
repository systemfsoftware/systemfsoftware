---
"@systemfsoftware/effect-daemon-cluster": minor
---

First release. `ClusterMedium` supervises Effect cluster singletons and entities as children of an `effect-daemon-spec` supervisor: bind it with `ClusterMedium.layer` and declare children with `Supervisor.ChildSpecs.on(ClusterMedium.port)`. A child is ready once it is registered, its death is inferred from failed liveness calls, and a group stop completes on the cluster's own schedule.
