---
title: An integration test's IO runs in a container it starts, never on the host, and a test with any fake-integration smell is not an integration test
applies_when:
  - an integration test or Feature needs a database, broker, cache, HTTP peer or other service
  - a test, fixture or helper reads or writes the host filesystem, listens on a host port, or starts a process
  - reviewing an integration test that passes but whose caught behaviour nobody can name
tags: [integration, containers, testcontainers, io, child-process, smells, mocks]
---

Every resource an integration test does IO against runs in a container the test starts in its own scope and stops when it ends (Testcontainers, with a wait strategy). The code under test runs in the test's own process and reaches the container through the mapped port.

Nothing runs on the host. A test never listens on a host port of its own, never reads or writes the host filesystem (use an in-memory one such as `@systemfsoftware/effect-memfs`, or a volume inside the container), and never starts a child process: not git, a package manager, a build tool, a shell, the package's own CLI, a server, or a shim script standing in for one.

A behaviour that needs a real binary, a real server process or several services running together is not an integration test; it belongs to the e2e-testing pack.

Any one of these marks a fake integration test and fails it:

- It starts a child process, or writes an executable shim or replays a recorded capture of a third party through one.
- It does IO on the host (temp directory, host port, a developer's running service).
- It replaces a driver, binding or client with a mock, spy, `vi.fn` or hand-built object.
- Its Then reads what a stand-in received instead of what our caller gets back.
- Its subject is a third party's API or wire format, not our system's behaviour.
- It is named live, real or end-to-end but runs nothing a person or caller would.
- It was deleted with its test target and the package it covered stayed (testing pack: failing-tests-are-fixed-not-weakened.md).

```typescript
// WRONG: IO on the host
const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'plan-'))
yield * ChildProcess.make('git', ['init'], { cwd: dir })
// RIGHT: a container the scenario starts and stops
const postgres = yield * Effect.acquireRelease(
  Effect.promise(() => new GenericContainer('postgres:17-alpine').withExposedPorts(5432).start()),
  (c) => Effect.promise(() => c.stop()),
)
```
