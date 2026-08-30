## 0.1.2

### Patch Changes

- Re-published against the oxc-based instrumenter: workspace dependency ranges move to the new instrumenter major; no package's own behavior changes in this release.

- The package now declares a runtime dependency on `mutation-testing-metrics` instead of shipping the code inline. Installing the package pulls that dependency in explicitly; nothing in the public API changes.

- Updated dependencies:
  - @systemfsoftware/stryker-js-instrumenter@3.0.0
