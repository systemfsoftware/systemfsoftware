## 2.0.0

### Major Changes

- The rule now judges pure phase bodies authored as `Cell.layer` spec properties. Phase bodies written through chained phase-call expressions are no longer detected, because the library no longer produces them — move those bodies into the spec form to stay covered.

### Minor Changes

- The I/O-in-phase-body rule now reads phase bodies handed to the composing constructor, so a description authored as one spec object is judged like the chained form. An I/O call written inside a pure phase of such a description is now reported where it was previously missed.

### Patch Changes

- Re-released to propagate the effect-cell-types and stryker-js workflow-channel migration into their published dependency graphs; no package-local API change

- Updated dependencies:
  - @systemfsoftware/effect-cell-types@6.0.0
