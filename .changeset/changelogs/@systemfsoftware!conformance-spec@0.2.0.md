## 0.2.0

### Minor Changes

- A rejected report (`Fail`, `Incomplete` or `OverBudget`) now carries its rendered `explanation`, so asserting `_tag: 'Pass'` on it shows which history and step broke. New `failed`, `incomplete` and `overBudget` constructors build rejected reports.

### Patch Changes

- Updated dependencies:
  - @systemfsoftware/effect-sim-kernel@0.2.0
