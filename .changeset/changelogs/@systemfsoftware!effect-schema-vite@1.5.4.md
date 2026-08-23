## 1.5.4

### Patch Changes

- The peer requirements for `effect` and for the Effect test-runner integration now accept any compatible `4.0.0-rc` release, instead of demanding one exact release candidate.

  Installing alongside a newer release candidate no longer reports an unmet peer dependency or resolves a second copy of `effect` into the dependency tree.

- Updated dependencies:
  - @systemfsoftware/effect-schema-law@0.9.0
