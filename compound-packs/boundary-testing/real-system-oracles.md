---
title: Verify boundary adapters against real local system oracles with clean lifecycle teardown
applies_when:
  - writing or reviewing integration tests for network adapters, socket clients, or file watchers
  - testing polling mechanisms, health checks, or external retry policies
  - defining boundary conformance suites in tests/
tags: [boundary, integration, loopback, teardown, oracle]
---

When testing boundary adapters without heavy remote infrastructure, the authoritative oracle is the local operating system (loopback network, local filesystem, in-memory SQLite, subprocess IPC).

1. **Real System Oracles, Never Fakes**:
   - Test network adapters against real loopback listeners (`127.0.0.1:0`).
   - Test filesystem watchers against real temporary directories.
   - Test process supervisors against real local child processes.
2. **Dual-Condition Verification**: Every boundary test suite must prove both poles of the interaction:
   - **Acceptance**: An active, accepting local endpoint immediately satisfies the boundary.
   - **Refusal**: An absent, closed, or refusing local endpoint generates immediate failure/refusal evidence and never falsely reports success.
3. **Clean Teardown Invariant**: Boundary interactions must release operating system resources deterministically. Every test must prove that closing the local listener, directory, or process resolves immediately without hanging or leaking open handles.

```ts
// WRONG: Testing only the happy path, leaving sockets open, or using simulated events
it('connects to endpoint', async () => {
  const server = startFakeServer()
  await adapter.connect()
  // No test for what happens when the port refuses!
  // No verification that connections close!
})

// RIGHT: Proves acceptance, proves refusal, proves zero leaks
Feature('Local Socket Boundary')
  .withLayer(NodeSocketLive)
  .scenario('Active listener is accepted', (scenario) => {
    scenario
      .given('a live local loopback listener', ...)
      .when('the boundary adapter executes', ...)
      .then('the adapter reports Connected and server records the connection', ...)
  })
  .scenario('Closed port is refused', (scenario) => {
    scenario
      .given('a closed local port', ...)
      .when('the boundary adapter executes', ...)
      .then('the adapter reports Refused within timeout and never claims Connected', ...)
  })
```

Gate: `review` — verify that boundary integration tests run against real local system endpoints, test refusal explicitly, and cleanly finalize all system resources.
