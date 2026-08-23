## 3.0.0

### Major Changes

- Published types no longer include names tagged `@internal`. If you imported one of those names from the package, switch to a public export or stop using it.

### Patch Changes

- The peer requirements for `effect` and for the Effect test-runner integration now accept any compatible `4.0.0-rc` release, instead of demanding one exact release candidate.

  Installing alongside a newer release candidate no longer reports an unmet peer dependency or resolves a second copy of `effect` into the dependency tree.
