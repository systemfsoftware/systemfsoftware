# Boundary Testing Compound Pack

Principles and design law for verifying impure boundaries, drivers, and external protocol interactions without mocking internal glue, fake properties, or backdoor test exports.

Every boundary adapter is an integration seam connecting the pure domain core to the outside world.

Rules in this pack govern:

- A test's expected value never comes from what the code under test wrote (`expected-values-never-come-from-the-subjects-output`).
- A claim that a test can fail names an observed red through one of four routes (a failed generated-input property run, a mutant id in main's latest CI Mutation report, a closed deliberate-red CI change, or the new test red on the real pre-fix commit), or states `red not shown`, and never rests on a mutant applied by hand (`can-fail-evidence-is-an-observed-red`).
- A test's subject is declared in a module the package ships, never in a test file or a test-tree helper, and never exported only so the test can reach it (`the-subject-is-shipped-code`).
- Testing boundary adapters against real local system oracles (kernel loopback, ephemeral filesystems, local subprocesses).
- Pinning third-party library semantics with differential parity tests.
- Forbidding mocks on internal glue and private modules.
- Enforcing protocol progressions via staged type-level evidence tokens.
- One shared law suite that a store's in-memory fake and real database adapter both pass, including the unit-of-work laws (`fake-and-real-store-laws`).
- Every port fake is typed to its port and passes one contract suite shared with the port's real adapter (`port-fakes-pass-the-port-contract`).
