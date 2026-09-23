## 2.0.0

### Major Changes

- The `effect` preset now reports `strictBooleanExpressions`, `missingPipeableSignature`, `missedPipeableOpportunity`, `strictEffectProvide`, `processEnv`, `nodeBuiltinImport` and `anyUnknownInErrorContext` as errors instead of leaving them off. A new `effect/entrypoint` preset carries the same policy without `strictEffectProvide` and `nodeBuiltinImport`, for tests, runnable examples and code whose job is to provide layers. Extend `@systemfsoftware/tsconfig/effect/entrypoint` from those projects, and fix or restructure the newly reported sites in the rest.
