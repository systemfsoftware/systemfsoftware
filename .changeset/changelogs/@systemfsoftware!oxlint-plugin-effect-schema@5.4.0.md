## 5.4.0

### Minor Changes

- A `recursionBudget` annotation materializes as `toCodecArbitrary`. Replace a hand-written `toArbitrary` derivation with `toCodecArbitrary`. Generation depth follows `maxDepth`.
