---
title: An integration test's IO runs in a container it starts, never on the host, and the test never starts a child process
applies_when:
  - an integration test or Feature needs a database, broker, cache, HTTP peer or other service
  - a test, fixture or helper reads or writes the host filesystem, listens on a host port, or starts a process
  - choosing between Testcontainers, a microVM, a compose stack or a host resource for a test
tags: [integration, containers, testcontainers, io, child-process, bare-metal]
---

Every resource an integration test does IO against runs in a container the test starts in its own scope and stops when it ends: a database, broker, cache or HTTP peer, started through Testcontainers (`GenericContainer` or a module such as `PostgreSqlContainer`) with a wait strategy. Testcontainers finds the engine through `DOCKER_HOST`, never a hardcoded `/var/run/docker.sock`: a rootless podman socket on a developer machine, Docker on a CI runner. The code under test runs in the test's own process and reaches the container through the port Testcontainers maps.

Nothing runs on the host. A test never listens on a host port of its own, never reads or writes the host filesystem (a filesystem the code needs is an in-memory one, such as `@systemfsoftware/effect-memfs`, or a volume inside the container), and never starts a child process: not git, not a package manager or build tool, not a shell, not the package's own CLI binary, not a server, and not a shim script standing in for one.

A behaviour that needs a real binary, a real server process or several services running together is not an integration test: it belongs to the e2e-testing pack.

Decision: the judge fails an integration test, Feature, fixture or helper that starts a process, runs git or a CLI or server binary, writes an executable shim, listens on a host port, touches the host filesystem, or reaches a service not started as a container in the test's own scope (a shared dev stack, a developer's local database). An uncertain case escalates.

Defect it prevents: IO on the host makes a test pass or fail with the machine it runs on, its binaries, their versions and whatever state the last run left; a container started per test gives every run the same clean resource, on a developer machine and in CI alike.

```typescript
// WRONG: IO on the host
const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'plan-'))
yield* ChildProcess.make('git', ['init'], { cwd: dir })
```

```typescript
// RIGHT: the database runs in a container the scenario starts and stops
const postgres = yield* Effect.acquireRelease(
  Effect.promise(() =>
    new GenericContainer('postgres:17-alpine')
      .withEnvironment({ POSTGRES_PASSWORD: 'test' })
      .withExposedPorts(5432)
      .withWaitStrategy(Wait.forLogMessage(/ready to accept connections/, 2))
      .start()
  ),
  (c) => Effect.promise(() => c.stop()),
)
```

Source: owner rulings, 2026-10-28: "integration tests CAN use testcontainers like identity backend community but no fucking io runs on the bare metal", "ANYTHING THAT RUNS A CHILD PROCESS IS AUTOMATIC FAIL". Measured on a rootless podman 6.1 host the same day: Testcontainers for Node 12.2 started `postgres:17-alpine` through the user podman socket via `DOCKER_HOST`, with Ryuk enabled, and the host process queried it through the mapped port.

Gate: judge
