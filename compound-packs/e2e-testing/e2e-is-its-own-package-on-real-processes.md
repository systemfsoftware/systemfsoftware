---
title: An end-to-end test lives in the project's own E2E package and drives real processes started from a process-compose stack
applies_when:
  - a behaviour needs the real CLI binary, a real server process, or several services running together
  - deciding where a test that starts processes belongs
  - adding services an E2E run needs
tags: [e2e, process-compose, effect-e2e, real-processes, tiers]
---

End-to-end tests live in a package of their own (such as `apps/<service>-e2e`) and nowhere else: never in a package's `tests/` beside its integration tests, and never named or shaped as an integration test. The suite is run by `@systemfsoftware/effect-e2e` (`effect-e2e run`), scaffolded by `effect-e2e init`.

The processes and services an E2E run drives are started from the project's process-compose file. Each process declares a readiness probe, the run waits for every probe before the first test, and the stack is torn down after the run. Services run as containers (podman or Docker); the system under test runs as the real binary or server it ships as. On rootless podman with pasta networking, a container that reaches another container's port dials `host.containers.internal`, and that port publishes on all interfaces.

An E2E test asserts what a person or a calling system observes from the running system: an HTTP response, a page, a CLI's output and exit, a row a reader can query. It never imports the code under test's internals.

Decision: the judge fails a test that starts real processes outside the project's E2E package, an E2E suite whose services are not started from the process-compose file with readiness probes, and an E2E test that imports internals. An uncertain case escalates.

Defect it prevents: E2E work hidden in integration files makes the integration tier slow and host-dependent, while the system is never run end to end the way it ships.

Source: owner rulings, 2026-10-28: "Where is the E2E library? ... Where is process compose for actual e2e? STOP PUTTING E2E IN INTEGRATION". Prior art: a service whose E2E suite is its own `apps/<service>-e2e` package, and a monorepo whose process-compose file starts its database and broker under podman, each with a readiness probe.

Gate: judge
