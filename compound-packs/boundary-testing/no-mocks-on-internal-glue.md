---
title: Never author unit tests or mocks for internal I/O glue
applies_when:
  - testing a boundary adapter, driver, client wrapper, or polling loop
  - an AI agent proposes mocking sockets, databases, HTTP clients, or process spawners
  - reviewing unit tests targeting private functions inside boundary modules
  - writing or reviewing a NixOS `nixosTest` or QEMU machine-image test that runs a host's hooks, job scripts or handlers by hand instead of letting the host's entry point start them
  - writing or reviewing an integration or VM test of a hook, job script, handler or task that a host process (a CI runner, daemon, scheduler or supervisor) starts, or a test that boots a machine image
tags: [boundary, testing, anti-slop, no-mocks, purity, integration-test, vm-test, machine-image]
---

In an AI-augmented codebase, allowing unit tests with mocks on internal I/O glue results in hallucinated confidence: language models mock the failure away, invent fake property tests over arbitrary constants, or assert against internal call graphs.

1. **No Mocked Driver Seams**: Never create mock implementations or test doubles for platform drivers (`net`, `fs`, `child_process`, database drivers) when testing internal boundary units.
2. **Pure Core vs. Boundary**:
   - If logic chooses between outcomes, it belongs in a pure `Workflow.make` decision; if it computes over a type's data, it is an operation in the `*.schema.ts` file that declares the type, which the decision may import. Both are tested by algebraic properties in `src/`.
   - If code merely translates data and calls external drivers, it is an impure boundary. It must be verified through real integration against the local environment or at the composition root.
3. **No Intermediate Helper Tests**: Never write dedicated unit tests for private intermediate functions in boundary files (e.g., connection helpers, stream mappers, poll runners). Test the boundary through its executable entry point. Integration and VM tests carry three kinds of evidence, and only the third proves that a host starts the code. A VM test (a NixOS VM test under `nix flake check`, or any QEMU boot of the image) is configuration and boot evidence: the NixOS manual says "A NixOS test usually consists of one or more test machines. Each machine is either a QEMU virtual machine or a `systemd-nspawn` container." (https://github.com/NixOS/nixpkgs/blob/9ea0f380482b4273603af5975b9d91d084536876/nixos/doc/manual/development/writing-nixos-tests.section.md, lines 122-123). It shows the configuration builds, boots and its services come up, and nothing that only the real environment has: a real image boot on the provider, the provider's instance metadata service, networking and IAM, instance storage, or the runner registering and claiming a job. A test that calls a hook, job script, handler or task by hand, with stand-ins for what its host process (a CI runner, a daemon, a scheduler or a supervisor) provides, is evidence of that code's own behaviour only: it skips the host's own rules (file name and extension, path, environment, permissions, exit-code handling). Real-host evidence is the real host taking a real job through its real entry point. Where the host's entry point is built or started in the same repository, the test drives it. For a runner or machine image, that evidence is the canary ci-wall-clock's release rule requires (pack `ci-wall-clock`, `release-promotes-the-staging-proven-build.md`). A VM test or hand-driven test may stay, named for what it shows, and the PR body names the real-host evidence that covers it; neither is presented as proof that the real host takes a job.

```ts
// WRONG: Mocking the driver to unit-test an internal boundary function
test('probeConnection returns true when socket connects', async () => {
  const fakeSocket = { connect: vi.fn().mockResolvedValue(true) }
  const result = await internalProbeHelper(fakeSocket, 8080)
  expect(result).toBe(true) // Proves nothing about whether real sockets dial!
})

// RIGHT: Pure decisions are separated; boundaries run against real system oracles
// File 1: pure decision workflow tested by property laws; it calls operations imported from readiness.schema.ts
export const decideReadiness = Workflow.make({ command: AssessTarget, decision: ReadinessVerdict, error: Schema.Never, decide: ... })

// File 2: boundary tested against a real local listener (127.0.0.1:0) in tests/
```

```ts
// WRONG: a VM test that drives the hook by hand is named as proof that the runner takes jobs
test('runner image takes jobs', async () => {
  const vm = await bootImage(runnerImage)
  expect(await vm.exec('bash /opt/runner/hooks/job-started', { env: fakeJobContext })).toEqual({ exitCode: 0 })
  expect(await vm.exec('bash /opt/runner/jobs/build', { env: { CACHE_URL: stubCache.url } })).toEqual({ exitCode: 0 })
})
// WRONG: a daemon's job handler called with a fake message, and no real-host evidence named in the PR body
test('handles a job', async () => {
  expect(await handleJob(fakeQueueMessage)).toEqual(jobResult)
})

// RIGHT: the VM test is named for the configuration and boot it shows
test('image boots and runner service starts', async () => {
  const vm = await bootImage(runnerImage)
  expect(await vm.serviceState('runner')).toBe('active')
})
// RIGHT: the daemon starts through its CLI and takes a job from a real local queue;
// the PR body names this test as the handler's real-host evidence, and names
// ci-wall-clock's canary as the evidence that the runner image takes jobs
test('daemon runs a submitted job', async () => {
  await using queue = await startLocalQueue()
  await using daemon = await spawnDaemonCli(['--queue', queue.url])
  const job = await queue.submit(buildJob)
  expect(await queue.result(job.id)).toEqual(buildJobResult)
})
```

On 2026-10-12, in a CI runner fleet, an integration test of a runner machine image booted it in a VM and drove the image's job hook and job scripts by hand, with stand-ins for the services the runner provides, instead of letting the real runner take a real job through its real entry point. The test passed. The hook lacked the file extension the runner needs to start it, and the image took the fleet down. GitHub's runner docs state rules only the runner applies: "Your script files must use a file extension for the relevant language, such as `.sh` or `.ps1`, in order to run successfully" (https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/run-scripts), and the hook environment variable "must contain the absolute path to the script" (https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/run-scripts).

Gate: `review` — reject PRs adding mock objects, `vi.fn()` stubs, or unit tests targeting non-exported boundary functions. Does a test, test name, CI step name or the PR body in the diff present a VM test, or a test that runs a hook or job script by hand, as proof that a runner takes a job or that the image works on its provider (a real image boot on the provider, instance metadata service, networking, IAM, instance storage, runner registration)? When a test in the diff calls a host-started hook, job script or handler directly, does the PR body name the real-host evidence that covers it: a test that drives the host's entry point, or ci-wall-clock's canary?
