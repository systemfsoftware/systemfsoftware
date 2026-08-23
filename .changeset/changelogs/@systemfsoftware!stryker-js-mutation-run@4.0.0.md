## 4.0.0

### Major Changes

- The engine no longer judges test contribution, and the verdict envelope no longer includes a `testContribution` field. Install the companion plugin and list it in `plugins` if you want that check. Configs that extend this package's base preset now run the gate for workflow, policy, and kernel property tests; remove the plugin from `plugins` to turn it off.

### Minor Changes

- Declarations that were never meant to be hidden are public again.

- The package now publishes a `test-contribution` entry. Import it to call the functions that decide whether a test file earned its keep on a mutation run.

### Patch Changes

- The peer requirements for `effect` and for the Effect test-runner integration now accept any compatible `4.0.0-rc` release, instead of demanding one exact release candidate.

  Installing alongside a newer release candidate no longer reports an unmet peer dependency or resolves a second copy of `effect` into the dependency tree.
