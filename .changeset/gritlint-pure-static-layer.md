---
"@systemfsoftware/gritlint": minor
---

`cell-architecture/service-exports-no-layer` now allows a pure `static readonly layer`, `layerTest` or `layerConfig` on the Service class, in the two-argument form `Layer.effect(this, this.make)` and the curried form `Layer.effect(this)(this.make)`, including a layer that leaves a platform service such as `FileSystem` in its `R` channel. It now reports a service module that imports a driver or platform runtime, statically or through `import()`, with or without a Layer: `node:*` and the Node built-ins that reach the operating system, `@effect/platform-*`, `@effect/sql-*`, `@effect/ai-*`, and a short list of database clients and vendor SDKs. A class field that aliases a Layer (`static readonly layer = consoleLayer`) is still reported. A service module that passed before can fail now.
