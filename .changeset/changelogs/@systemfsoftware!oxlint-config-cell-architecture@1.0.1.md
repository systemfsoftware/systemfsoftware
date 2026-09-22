## 1.0.1

### Patch Changes

- `ban-unknown` rejects `unknown` except as a generic default (`<A = unknown>`), a type-predicate parameter (`(u: unknown): u is T`), or a catch binding. The recommended config enables it.

- Refactor bare class implementations in npm-package and effect-atom to Effect-native ADT models, delete dead oxlint rules (no-barrels, no-inline-destructured-type), and activate ban-classes and no-bodyless-status-assertion in recommended configs.
