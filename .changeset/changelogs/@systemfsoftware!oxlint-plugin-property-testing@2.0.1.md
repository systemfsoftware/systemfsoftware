## 2.0.1

### Patch Changes

- A `recursionBudget` annotation materializes as `toCodecArbitrary`. Replace a hand-written `toArbitrary` derivation with `toCodecArbitrary`. Generation depth follows `maxDepth`.
