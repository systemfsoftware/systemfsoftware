---
title: The e2e stack runs the artifacts the system ships, under one supervisor that holds every process behind a readiness probe, with third parties as local emulators
applies_when:
  - starting the services an e2e run needs, locally or in CI
  - an e2e run reaches a third-party service
  - several e2e workers share one stack
  - an e2e failure leaves no logs or traces to read
tags: [e2e, stack, readiness, emulator, isolation, observability, compose]
---

The run starts the same images or binaries production runs, with production's configuration contract (the same variables, schema setup and queue names), from one command, without cloud credentials. Substitute only what cannot run locally, and name the coverage that substitution loses.

One supervisor owns every long-running process (a compose environment, process-compose, or a test-container compose stack). Every process declares a readiness probe (a health check, the service's own CLI, an HTTP GET), and the suite starts only once every probe passes. Never a fixed delay. Publish ports on loopback.

A third party runs as a local emulator or fork that speaks its real protocol (a payment sandbox emulator, a mail catcher, a chain fork), never as a mock inside the system's process. The test drives the third party only through what the emulator exposes.

Parallel workers never share mutable state: each gets its own stack, database or tenant. Every process writes logs, and traces where the system emits them, to a place the run keeps as evidence for a failure.

Assertions read what a person or a calling system observes, including state read back through the system's own API. Never query the stack's database to check an outcome (testing pack: scenarios-drive-the-consumer-entry-and-read-what-it-observes.md).

```yaml
# WRONG: the suite starts after a sleep, and the payment provider is a stub compiled into the API
api: { command: "node dist/api.js --payments=stub", depends_on: [db] }
# RIGHT: the shipped image, held behind a probe, talks to a payment emulator over its real protocol
processes:
  api:
    command: podman run --rm -p 127.0.0.1:4000:4000 -e PAYMENTS_URL=http://payments-emulator:4100 hotel-api:release
    readiness_probe: { http_get: { host: 127.0.0.1, port: 4000, path: /health } }
    depends_on: { db: { condition: process_healthy }, payments-emulator: { condition: process_healthy } }
```
