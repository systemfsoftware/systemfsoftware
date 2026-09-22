# Boundary Testing Compound Pack

Principles and design law for verifying impure boundaries, drivers, and external protocol interactions without mocking slop, fake properties, or backdoor test exports.

## Core Tenet

In the AI era, unit testing internal I/O glue with mocks produces green suites that certify nothing: language models easily mock bugs away or assert against private implementation details.

Boundary testing enforces that:

1. Pure decisions are extracted into workflows and tested algebraically.
2. Protocol progression is enforced at compile time via staged evidence types.
3. Boundary adapters are verified against real local system oracles (kernel loopback, ephemeral filesystems, local processes), testing both positive and refusal paths with leak-free lifecycle guarantees.
4. Third-party assumptions are pinned with executable contract tests.
5. Public package surfaces remain 100% pure domain contracts—zero test-only exports or subpath backdoors.
