# Boundary Testing Compound Pack

Principles and design law for verifying impure boundaries, drivers, and external protocol interactions without mocking internal glue, fake properties, or backdoor test exports, and for judging what a test may claim as evidence that it can fail and what it may take as its subject.

Every boundary adapter is an integration seam connecting the pure domain core to the outside world.

Rules in this pack govern:

- A test's expected value never comes from what the code under test wrote (`expected-values-never-come-from-the-subjects-output`).
- A claim that a test or check can fail names a red CI observed through one of three routes (the claimed test red on the unmodified pre-fix commit, a deliberate-red pull request closed unmerged, or a mutant the claimed test kills in a Mutation run on main, named by the mutant id, the run id and the test id its `killedBy` records), or states exactly `red not shown` with each route's reason. It never rests on a hand edit to code, a test, config or a dependency that no CI run observed on a commit a reviewer can open, in a scratch copy or not; a probe that ran is named as withdrawn, never denied; and a planted violation counts only as a committed input of the detector it tests (`can-fail-evidence-is-an-observed-red`).
- A test's subject is declared in a module the package ships, never in a test file or a test-tree helper (a port fake whose contract suite runs beside the real adapter is the exception), and never exported only so the test can reach it (`the-subject-is-shipped-code`).
- Testing boundary adapters against real local system oracles (kernel loopback, ephemeral filesystems, local subprocesses).
- Pinning third-party library semantics with differential parity tests.
- Forbidding mocks on internal glue and private modules.
- Enforcing protocol progressions via staged type-level evidence tokens.
- One shared law suite that a store's in-memory fake and real database adapter both pass, including the unit-of-work laws (`fake-and-real-store-laws`).
- Every port fake is typed to its port and passes one contract suite shared with the port's real adapter (`port-fakes-pass-the-port-contract`).
