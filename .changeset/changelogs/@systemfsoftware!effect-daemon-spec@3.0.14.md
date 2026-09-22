## 3.0.14

### Patch Changes

- Unconstrained type holes are defaulted type parameters (`<A = unknown>`) instead of a type argument `unknown`. Calls that omit those arguments are unchanged.

- Updated dependencies:
  - @systemfsoftware/effect-cell-types@9.0.0
