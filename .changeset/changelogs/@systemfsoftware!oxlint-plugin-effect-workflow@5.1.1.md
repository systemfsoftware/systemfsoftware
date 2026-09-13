## 5.1.1

### Patch Changes

- `workflow-variant-constructed` no longer reports a workflow whose decision annotation names
  a local bound to a constructed value, such as `Result.Result<accepted, never>` where
  `const accepted = new Admitted({})`. That name is a value rather than a variant class the
  file declares, and the annotation writes it where the compiler expects a type, so the
  report no longer speaks for it.

  A variant class the file declares with no construction site still fails the run: construct
  it with `new X(…)` or `X.make(…)`, or remove it from the union and from every dispatch over
  it.
