---
"@systemfsoftware/oxlint-plugin-effect-entrypoint": minor
---

`runtime-construction-placement` is a new rule. It reports two shapes:

- `ManagedRuntime.make`, `Layer.provide`, or `Cell.provide` called inside a function body — wiring rebuilt per call is a runtime per call.
- `ManagedRuntime.make` evaluated at module scope — importing the module starts work before anything interprets it.

Lawful and unreported: construction inside a module-scope closure deferred to first use, the lazy memoized bootstrap —

```ts
let runtime
export const getRuntime = () => (runtime ??= ManagedRuntime.make(AppLive))
```

— module-scope `Layer.provide`/`Cell.provide` layer graphs, and `cell.run(input)` arrow application anywhere, inside an `Effect.gen` body or not. Callers are resolved through their import specifier, so an aliased import (`import { ManagedRuntime as M }`) and a namespace import (`import * as Eff`) report the same. Every file is judged by shape, tests included — except a `.tst.ts` type-test file, which runs nowhere and is out of scope.

The rule ships in `configs.recommended`, so the standard recommended spread enables it at `error`. The module-scope lazy memoized bootstrap — a runtime constructed once on first use — and every `cell.run(input)` arrow application are lawful, so a clean codebase reports nothing.
