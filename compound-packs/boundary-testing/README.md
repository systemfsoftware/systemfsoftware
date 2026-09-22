# Boundary Testing Compound Pack

Principles and design law for verifying impure boundaries, drivers, and external protocol interactions without mocking internal glue, fake properties, or backdoor test exports.

Every boundary adapter is an integration seam connecting the pure domain core to the outside world.

Rules in this pack govern:

- Testing boundary adapters against real local system oracles (kernel loopback, ephemeral filesystems, local subprocesses).
- Explicit negative refusal testing beside generated schema laws.
- Bounded arbitrary generators that avoid fast-check rejection traps (`fc.pre`).
- Pinning third-party library semantics and differential parity with contract suites.
- Forbidding mocks on internal glue and private modules.
- Enforcing protocol progressions via staged type-level evidence tokens.
