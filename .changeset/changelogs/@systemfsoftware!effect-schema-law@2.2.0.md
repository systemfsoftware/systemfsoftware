## 2.2.0

### Minor Changes

- A `recursionBudget` annotation materializes as `toCodecArbitrary`. Replace a hand-written `toArbitrary` derivation with `toCodecArbitrary`. Generation depth follows `maxDepth`.

- These packages now peer-depend on Vitest 5. Install `vitest` ^5; Vitest 4 is unsupported.
