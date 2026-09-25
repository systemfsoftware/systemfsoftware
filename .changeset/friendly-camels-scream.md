---
"@systemfsoftware/effect-daemon-microvm": minor
---

First release. `MicroVMMedium` runs each child of an `effect-daemon-spec` supervisor as a workload in its own microVM sandbox: bind it with `MicroVMMedium.layer` and declare children with `Supervisor.ChildSpecs.on(MicroVMMedium.port)`. A child is ready when its workload signals readiness, its exit code and signal are reported to the supervisor, and a stop follows the declared shutdown mode. Requires a host with hardware virtualization.
