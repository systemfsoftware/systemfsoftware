## 3.0.1

### Patch Changes

- When two or more mutants in one TypeScript project file produce a compiler error that cannot be blamed on exactly one of them, `check` now rechecks each mutant alone. A mutant that typechecks by itself is reported `passed`. A mutant that fails typecheck by itself is reported `compileError`.

- Peer Effect requirement advances to 4.0.0-rc.112. No API changes.
