## 1.3.0

### Minor Changes

- `runtime-construction-placement` no longer reports `Cell.provide`, which `@systemfsoftware/effect-cell-types` has removed. Its replacement, `Cell.provideContext`, takes a context that was already built, so calling it inside a function rebuilds nothing and is not reported.
