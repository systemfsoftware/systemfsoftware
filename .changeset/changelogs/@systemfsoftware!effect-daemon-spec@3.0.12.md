## 3.0.12

### Patch Changes

- The `schema-filter-constructive-generation` rule distinguishes scalar and struct receiver chains: `arbitrary: { candidate }` no longer satisfies the rule on any receiver, struct filters are permitted without annotations because Effect v4 provides no compiler hook for constructive cross-field filter generation, and node `toCodecArbitrary` overrides only silence the rule on `Schema.declare` receivers where the compiler honors them.
