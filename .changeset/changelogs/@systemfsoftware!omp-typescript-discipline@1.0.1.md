## 1.0.1

### Patch Changes

- TypeScript discipline now guides the agent toward standard libraries instead of hand-rolled helpers — `jsr:@std/encoding`, `jsr:@std/async`, `jsr:@std/bytes`, `jsr:@std/path`, and, when you already import from `effect`, the Effect-native `Effect.sleep` and `Schedule` primitives. The guidance appears as an inline hint while the agent writes code.
