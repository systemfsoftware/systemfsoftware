---
title: Integration test I/O runs in the lightest real engine the test needs, scoped to it, never in containers or on the host
applies_when:
  - writing or reviewing an integration test or Feature that needs a database, broker, cache, HTTP peer or other external resource
  - choosing the engine or runtime that backs an integration test's I/O
  - a test needs Postgres SQL features, several concurrent connections, a service with no embedded engine, or an OS or release-image check
  - a test, fixture or helper reads or writes the host filesystem, binds a host port, starts a child process or uses a container runtime
  - reviewing an integration test for fake-integration smells
tags: [integration, embedded-engine, pglite, miniflare, microvm, effect-microsandbox, containers, testcontainers, io, child-process]
---

An integration test's I/O obeys two separate rules: a hygiene invariant every engine must meet, and an engine choice that follows from what the test exercises.

**Hygiene.** Never use Testcontainers, Docker, Podman or any other container runtime. Nothing runs on the host: never read or write the host filesystem, bind a fixed host port, or spawn an ad-hoc child process (no `git`, package manager, build tool, shell, CLI binary, server or shim script). Acquire every resource in the test's Effect Scope and tear it down when that scope exits, on an ephemeral loopback port.

**Engine choice.** Pick the lightest tier whose real protocol or runtime supports every capability the test exercises, and declare that tier explicitly in the test's Layer. Never downgrade at runtime—no fallback to a lighter engine because `/dev/kvm` is missing.

1. **In-process embedded engines.** Postgres for plain SQL, migrations, constraints and transactions: an in-memory PGlite served over the Postgres wire protocol by `@electric-sql/pglite-socket` on an ephemeral loopback port, driven by the real Postgres client at pool size 1. Filesystem: `@systemfsoftware/effect-memfs`. Hand-built port fakes are never an integration test's backing resource; they belong to unit tests and to the shared contract suites (`port-fakes-share-a-contract-suite.md`).
2. **The platform's local runtime.** A Worker's bundle runs in Miniflare/workerd, acquired in the test's Scope. This is the only process the rule admits.
3. **Scoped KVM microVMs via `@systemfsoftware/effect-microsandbox`.** Use only when a test needs something a lighter tier lacks: an extension PGlite does not have (for example TimescaleDB), several concurrent connections, a service with no embedded engine, or an OS or release-image check. Acquire with `MicroVM.spec(image).withExposedPorts([p]).scoped`, resolve the mapped loopback port with `MicroVM.port(vm, p)`, and verify readiness with a bounded client poll over that port—never a fixed sleep or in-guest `exec`.

How a host filters or skips the microVM tier is not this pack's concern; each repository sets that in its own instructions.

Delete any test labelled as an integration test that does no real I/O (`Layer.empty` over pure fixtures), uses host I/O, child processes or container runtimes, or breaks the `testing` pack's SQL, adapter or Feature rules—replacing covered system behaviour per `failing-tests-are-fixed-not-weakened.md`.

```typescript
// WRONG: container runtime, fixed host port, or an ad-hoc child process
const c = await new GenericContainer('postgres:17-alpine').withExposedPorts(5432).start()
await exec('postgres -D ./data -p 5432')
// RIGHT, tier 1: @electric-sql/pglite-socket serves an in-memory PGlite over the Postgres wire
// protocol on an ephemeral loopback port; the real Postgres client (pool size 1) talks to it
const pg = yield * servePGliteSocket({ dataDir: 'memory://' })
const client = yield * PgClient.make({ host: pg.host, port: pg.port })
// RIGHT, tier 3: scoped KVM microVM + mapped loopback port + bounded client readiness poll
const vm = yield * MicroVM.spec('timescale/timescaledb:latest-pg17').withExposedPorts([5432]).scoped
const port = yield * MicroVM.port(vm, 5432)
yield * ping(port).pipe(Effect.retry(Schedule.spaced('1 second')), Effect.timeout('2 minutes'))
```
