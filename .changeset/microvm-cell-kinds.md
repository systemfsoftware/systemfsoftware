---
"@systemfsoftware/effect-microsandbox": major
---

MicroVMs and running VMs are built on the `Resource` and `Handle` kinds. The combinator `dual`s such as `MicroVM.withEnv` and `MicroVM.withWorkdir` now take the resource rather than its spec, so `pipe(MicroVM.job(image, cmd), MicroVM.withEnv(env))` returns a job. The standalone `MicroVM.scoped(spec)` and `MicroVM.layer(key, spec)` are removed; use the resource's `scoped` and `layer(key)`. `MicroVM.TypeId` is now a symbol.
