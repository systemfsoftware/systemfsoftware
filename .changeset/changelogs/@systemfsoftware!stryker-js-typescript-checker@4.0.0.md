## 4.0.0

### Major Changes

- CheckMutantsDecision is now a branded tagged union CheckFinished|RetestRequired instead of a plain record; consumer dispatch is exhaustive over the tags

### Patch Changes

- Updated dependencies:
  - @systemfsoftware/effect-cell-types@6.0.0
  - @systemfsoftware/stryker-js@1.0.0
