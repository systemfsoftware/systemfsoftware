---
"@systemfsoftware/effect-microsandbox": major
---

MicroVMs are now `Resource` and `Handle` cell kinds. A failed destroy, or a failed kill after a failed stop, now surfaces as a defect in the scope's exit, and an operation called after release has started dies with `HandleReleased`.

- `MicroVM.use` is removed; call `exec`, `ping`, `port`, `url`, and `logs` on the handle instead.
- The chained `with*` methods are removed; configure through `pipe(MicroVM.service(image), MicroVM.withExposedPorts([6379]))`.
- `withExposedPorts` and `withWaitStrategy` accept only service resources; `withHostAccess` and `withWorkdir` accept only job resources.
- `MicroVM.scoped(spec)` and `MicroVM.layer(key, spec)` are removed; use the resource's `scoped`, `layer`, or `bind(key)`.
