---
title: Verify boundary adapters against real local system oracles with clean lifecycle teardown
applies_when:
  - writing or reviewing integration tests for network adapters, socket clients, or file watchers
  - testing polling mechanisms, health checks, or external retry policies
  - defining boundary conformance suites in tests/
  - adding a scripted check, smoke test, scheduled workflow or CI step that reaches a deployed stage or a remote service
  - writing or reviewing a NixOS `nixosTest` or QEMU machine-image test
  - writing or reviewing an integration test that runs against stand-ins for a cloud or forge service (an instance metadata service, S3, a fake GitHub API)
tags: [boundary, integration, loopback, teardown, oracle, integration-test, vm-test, machine-image, stand-in]
---

When testing boundary adapters, the authoritative oracle is the local operating system (loopback network, local filesystem, in-memory SQLite, subprocess IPC). A VM test or an integration test against cloud or forge stand-ins is configuration, boot and local-service evidence, never evidence about the real provider (`no-mocks-on-internal-glue.md` item 3 sorts the kinds of evidence; the real-job canary is ci-wall-clock's `release-promotes-the-staging-proven-build.md`).

1. **Real System Oracles, Never Fakes**:
   - Test network adapters against real loopback listeners (`127.0.0.1:0`).
   - Test filesystem watchers against real temporary directories.
   - Test process supervisors against real local child processes.
2. **Dual-Condition Verification**: Every boundary test suite must prove both poles of the interaction:
   - **Acceptance**: An active, accepting local endpoint immediately satisfies the boundary.
   - **Refusal**: An absent, closed, or refusing local endpoint generates immediate failure/refusal evidence and never falsely reports success.
3. **Clean Teardown Invariant**: Boundary interactions must release operating system resources deterministically. Every test must prove that closing the local listener, directory, or process resolves immediately without hanging or leaking open handles.
4. **Nothing scripted asks a deployed stage**: No test, CI job or step, scheduled workflow, hook or script takes a verdict from a deployed stage of the product, or from a remote instance of a service the code under test calls. Checking a deployed stage is a QA agent's job, never committed code. Such a run spends CI time and fails on environment drift, and it proves nothing that staging and a QA agent's check do not already prove. The line is the subject's peer: a CI platform API read that orchestrates a run, the job results of a workflow the CI platform itself ran, and fetched build inputs are not checks of a deployed stage, and stay allowed.

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

```yaml
# WRONG: a post-deploy job signs in to staging with a dedicated smoke identity and acts on the answer
smoke:
  needs: deploy-staging
  steps:
    - run: pnpm smoke --base-url https://staging.example.com --user "$SMOKE_USER" --code-from-inbox

# RIGHT: the adapter suite runs against a local test system on loopback (item 1; port-fakes-pass-the-port-contract.md item 4),
# and the release promotes what CI proved
test:
  steps:
    - run: pnpm turbo run test --filter=@app/orders
```

Incident, 2026-10-10: a repo deleted, whole, its CI runs against deployed stages, the dedicated smoke sign-in identity those runs used, and the inbox that received its sign-in codes.

Gate: `review` — verify that boundary integration tests run against real local system endpoints, test refusal explicitly, and cleanly finalize all system resources. Does anything scripted in the diff (a test, a CI job or step, a scheduled workflow, a hook or a script) send a request to a deployed stage of the product, or to a remote instance of a service the code under test calls, and act on the answer?
