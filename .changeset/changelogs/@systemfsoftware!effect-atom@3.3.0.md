## 3.3.0

### Minor Changes

- Unconstrained type holes are defaulted type parameters (`<A = unknown>`) instead of a type argument `unknown`. Calls that omit those arguments are unchanged.

### Patch Changes

- Refactor bare class implementations in npm-package and effect-atom to Effect-native ADT models, delete dead oxlint rules (no-barrels, no-inline-destructured-type), and activate ban-classes and no-bodyless-status-assertion in recommended configs.
