# Boundary Testing Compound Pack

Principles and design law for verifying impure boundaries, drivers, and external protocol interactions without mocking internal glue, fake properties, or backdoor test exports.

Every boundary adapter is an integration seam connecting the pure domain core to the outside world.

Rules in this pack govern:

- A test's expected value never comes from what the code under test wrote (`expected-values-never-come-from-the-subjects-output`).
- A claim that a test can fail names an observed red by its run or mutant id, or states `red not shown`, and never rests on a mutant applied by hand (`can-fail-evidence-is-an-observed-red`).
- A test's subject is shipped code, never a function, table or literal the test file declares (`the-subject-is-shipped-code`).
- Testing boundary adapters against real local system oracles (kernel loopback, ephemeral filesystems, local subprocesses).
- Pinning third-party library semantics with differential parity tests.
- Forbidding mocks on internal glue and private modules.
- Enforcing protocol progressions via staged type-level evidence tokens.
- One shared law suite that a store's in-memory fake and real database adapter both pass, including the unit-of-work laws (`fake-and-real-store-laws`).
- Every port fake is typed to its port and passes one contract suite shared with the port's real adapter (`port-fakes-pass-the-port-contract`).
