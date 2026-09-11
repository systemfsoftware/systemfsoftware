## 2.1.0

### Minor Changes

- Generated law suites now also carry the generation laws of every recursive schema the package exports, beside the existing round-trip pair.

  The plugin also materializes the ceilings those schemas declare: a recursion point that states its generation budget gets the derivation that honors it, so registering this plugin alone is enough for the declared laws to hold.

### Patch Changes

- Updated dependencies:
  - @systemfsoftware/effect-schema-law@2.1.0
