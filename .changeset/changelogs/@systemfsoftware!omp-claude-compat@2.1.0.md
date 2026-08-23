## 2.1.0

### Minor Changes

- The packages now publish an `/api` entry with the named handlers and constants that tests and other in-process callers import. The host entry stays the default export only, so startup still pays only for registration.

### Patch Changes

- The peer requirements for `effect` and for the Effect test-runner integration now accept any compatible `4.0.0-rc` release, instead of demanding one exact release candidate.

  Installing alongside a newer release candidate no longer reports an unmet peer dependency or resolves a second copy of `effect` into the dependency tree.

- Updated dependencies:
  - @systemfsoftware/effect-cell-types@4.0.0
