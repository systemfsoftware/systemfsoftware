## 3.0.0

### Major Changes

- MicroVMs are `Blueprint`s and running VMs are `Handle`s.

  - `MicroVMResource` and `JobResource` are renamed `MicroVMBlueprint` and `JobBlueprint`.
  - Step `dual`s such as `MicroVM.withEnv` take the blueprint rather than its spec, so `pipe(MicroVM.job(image, cmd), MicroVM.withEnv(env))` returns a job.
  - `MicroVM.scoped(spec)` and `MicroVM.layer(key, spec)` are removed; use the blueprint's `scoped` and `layer(key)`.
  - `MicroVM.TypeId` is now a symbol.

### Patch Changes

- Updated dependencies:
  - @systemfsoftware/effect-readiness@0.3.0
