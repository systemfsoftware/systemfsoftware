## 6.0.0

### Major Changes

- The supervisor now closes each child incarnation's scope after the medium's `stop` returns, including when `stop` fails. A medium's `stop` no longer closes the scope its `start` ran in; effect 4.0.0's `Scope.close` accepts only `Scope.Closeable`, which the ambient `Scope` is not.

- Require `effect` `^4` (stable 4.0.0). Release candidates are no longer supported: imports follow 4.0.0's module layout (`effect/http`, `effect/rpc`, `effect/http-api`, `effect/cluster`, `effect/process`, `effect/socket`, `effect/persistence`, `effect/reactivity`, `effect/encoding`, `effect/Arbitrary`), which does not exist in any 4.0.0 RC.

### Patch Changes

- Updated dependencies:
  - @systemfsoftware/conformance-spec@1.0.0
  - @systemfsoftware/effect-cell-types@12.0.0
