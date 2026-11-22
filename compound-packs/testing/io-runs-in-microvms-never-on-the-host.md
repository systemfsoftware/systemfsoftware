---
title: Integration test I/O runs in scoped KVM microVMs via effect-microsandbox, never in containers or on the host
applies_when:
  - writing or reviewing an integration test or Feature that needs a database, broker, cache, HTTP peer or other external resource
  - a test, fixture or helper reads or writes the host filesystem, binds a host port, starts a child process or uses a container runtime
  - reviewing an integration test for fake-integration smells
tags: [integration, microvm, effect-microsandbox, containers, testcontainers, io, child-process]
---

Every external resource an integration test talks to runs in a KVM microVM booted in the test's Effect scope using `@systemfsoftware/effect-microsandbox`: acquire with `MicroVM.spec(image).withExposedPorts([p]).scoped`, resolve the mapped loopback port with `MicroVM.port(vm, p)`, and verify readiness via a bounded retry poll from the test's own client over that mapped port—never a fixed sleep or in-guest `exec`.

Never use Testcontainers, Docker, Podman, or any container runtime. Nothing runs on the host: never bind a host port, read or write the host filesystem (use `@systemfsoftware/effect-memfs` or a microVM mount), or spawn a child process (no `git`, package manager, build tool, shell, CLI binary, server, or shim script). A service under test runs in its platform's local runtime (a Cloudflare Worker's bundle in Miniflare, the one process this rule admits) or as its release image in a microVM, so a multi-service Feature needs nothing else.

Delete any test labelled as an integration test that does no real I/O (`Layer.empty` over pure fixtures), uses host I/O, child processes, or container runtimes, or breaks the `testing` pack's SQL, adapter, or Feature rules—replacing covered system behaviour per `testing` pack `failing-tests-are-fixed-not-weakened.md`.

```typescript
// WRONG: container runtime or host I/O / child process
const c = await new GenericContainer('postgres:17-alpine').withExposedPorts(5432).start()
// RIGHT: scoped KVM microVM + mapped loopback port + bounded client readiness poll
const vm = yield * MicroVM.spec('postgres:17-alpine').withExposedPorts([5432]).scoped
const port = yield * MicroVM.port(vm, 5432)
yield * ping(port).pipe(Effect.retry(Schedule.spaced('1 second')), Effect.timeout('2 minutes'))
```
