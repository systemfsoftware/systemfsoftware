---
"@systemfsoftware/effect-microsandbox": major
---

The layer, scoped and run entry points now require `Readiness.HostProber` instead of providing the Node prober themselves, and the exported functions that took their subject first, such as `MicroVM.layer` and `MicroVM.job`, can now also be called data-last. Provide `Readiness.NodeHostProber` where you provide the microsandbox layer or run a job.
