---
title: An integration test never starts a child process; a behaviour that needs real processes is an E2E test in the project's own E2E suite
applies_when:
  - an integration test, Feature, fixture or helper starts a process (child_process, Bun.spawn, Deno.Command, an effect platform Command, execa, a shell)
  - a test runs git, a package manager, a build tool, the package's own CLI binary or a server process, or writes a shim script for one
  - deciding where a test of a command-line tool, a server, or several services together belongs
tags: [testing, integration, e2e, child-process, cli, process-compose, microvm]
---

Integration and E2E are separate tiers, and E2E never goes in an integration test.

An integration test (a `*.integration.test.ts` file, or a Feature inside a package) runs the code under test in the test's own process. It starts no child process: not git, not a package manager or build tool, not a shell, not the package's own CLI binary, not a server, and not a shim script standing in for one. The real local resources it may use are a loopback listener on 127.0.0.1:0, a real temporary directory, an embedded engine, the platform's local runtime, and a service in a microVM acquired in a Scope through `@systemfsoftware/effect-microsandbox` (a database, a broker). A command-line tool's entry function is called in-process through the package's published surface.

A behaviour that needs the real binary, a real server process, or several services running together is an end-to-end test. It lives in the project's own E2E suite, a package of its own (such as `apps/<service>-e2e`), run by the `@systemfsoftware/effect-e2e` runner (`effect-e2e run`), against services the project starts with a process-compose file whose processes declare readiness probes. It is never written into an integration test file, and it never fakes a service with a shim that replays a recorded capture.

Decision: the judge fails an integration test, Feature, fixture or helper that starts a process, runs git or a CLI or server binary, or writes an executable shim (a chmod +x on a fixture counts), whatever the Feature is called (`.live` included). It fails an E2E behaviour placed outside the project's E2E suite. An uncertain case escalates.

Defect it prevents: an integration test that spawns git or a build tool passes or fails with the host's binaries, their versions and their output format, and a shim that replays a recorded capture pins a third party's wire format inside the fixture. Mixing the tiers leaves the integration suite slow and host-dependent, and the system is never tested end to end with its real processes.

```typescript
// WRONG: E2E work inside an integration Feature
Feature('Reading the affected plan')
  .live('the plan command runs git and the build tool as child processes')
// with a fixture that writes .fixture-shims/<tool> and runs chmod +x on it
```

```typescript
// RIGHT, integration: the entry runs in-process; what it reads from outside is a port with a scenario layer
When('the affected plan is read')('plan', () => Plan.affected({ base }).pipe(Effect.result)),
Then('only the changed packages are planned')((s, expect) => expect(s.plan).toEqual(Result.succeed(['answer']))),
// RIGHT, E2E: the real binary against real services, in apps/<service>-e2e, run by effect-e2e,
// with the services started from the project's process-compose file
```

Source: owner rulings, 2026-10-28: "NO GIT AS CHILD PROCESS. ANYTHING THAT RUNS A CHILD PROCESS IS AUTOMATIC FAIL", "NOT A BDD TEST", "STOP PUTTING E2E IN INTEGRATION". Prior art: a service whose E2E suite is its own `apps/<service>-e2e` package run with `vitest run tests`, and a monorepo whose process-compose file starts each service (database, broker) with a readiness probe.

Gate: judge
