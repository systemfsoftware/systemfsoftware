## 0.1.0

### Minor Changes

- A plugin that fails a mutation run when a required test file kills no mutant that another test file does not also kill. Install the package and list it in `plugins`. Listing the plugin turns the check on; removing it turns the check off. There is no option to configure. The gate polices workflow, policy, and kernel property tests.

### Patch Changes

- Updated dependencies:
  - @systemfsoftware/stryker-js-mutation-run@4.0.0
