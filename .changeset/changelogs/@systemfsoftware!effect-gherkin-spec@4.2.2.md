## 4.2.2

### Patch Changes

- Unconstrained type holes are defaulted type parameters (`<A = unknown>`) instead of a type argument `unknown`. Calls that omit those arguments are unchanged.
