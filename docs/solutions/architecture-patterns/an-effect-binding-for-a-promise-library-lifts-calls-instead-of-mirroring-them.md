---
title: An Effect binding for a promise library lifts calls instead of mirroring them
date: "2026-09-25"
category: architecture-patterns
module: effect-playwright
problem_type: architecture_pattern
component: tooling
severity: high
applies_when:
  - "Adopting or porting a library that wraps a promise-based SDK (Playwright, a cloud SDK, a database driver) for Effect"
  - "A wrapper module is mostly one-line methods of the form `(args) => Effect.tryPromise(() => raw.method(args))`"
  - "Wrapper modules construct each other and trip import/no-cycle"
related_components:
  - packages/effect-playwright/src/lift.ts
  - packages/effect-playwright/src/events.ts
  - packages/effect-playwright/src/expose.ts
tags:
  - effect-ts
  - port
  - pass-through
  - api-design
---

# An Effect binding for a promise library lifts calls instead of mirroring them

## Context

The first cut of `@systemfsoftware/effect-playwright` ported upstream Jobflow-io/effect-playwright 0.8.0-2: about 200 hand-written methods on `Page`, `Locator`, `Frame`, `BrowserContext`, and friends, each `use((raw) => raw.method(...))`. Every one was pass-through (`CONST-B3`). The wrappers built each other, so the module graph was cyclic and needed a dependency-injection record to pass `import/no-cycle`. The mirror still lacked methods, so every wrapper carried a `use` escape hatch back to the raw object. Review then found the two real defects in the package (a stream on an already-closed page never ended; an exposed callback kept running after its services were released) in the few functions that were not forwarding, hidden among the ones that were.

## Guidance

Keep the library's objects and types. Add two lifts and nothing that forwards:

- `attempt(() => raw.call(...))`: `Effect<A, TypedError>`, deferred until run. One function covers every method, every overload, every option, including methods added in the next release.
- `acquire(() => raw.open(...))`: `acquireRelease` over the library's own disposal protocol (Playwright objects implement `Symbol.asyncDispose`). One function covers browsers, contexts, pages, routes, and init scripts.

Then write code only where the library lacks a behaviour an Effect program needs: event streams that end with their source, callbacks that run an Effect with the caller's services and are removed with its scope, services for dependency injection, and a test-runner entry. Those functions are small enough to test directly against the real library (`packages/effect-playwright/tests/*.integration.test.ts`).

A mapped type over the raw object (`{ [K in keyof Page]: Lifted<Page[K]> }`) with a `Proxy` looks like the middle ground. It is not: a mapped type over an overloaded method keeps only the last overload, so `evaluate`, `waitForEvent`, and `on` lose their types silently, and the proxy needs unchecked casts (`CONST-B5`).

## Architectural Invariants

- **No export forwards one call.** If an export's body is a single call on the raw object, delete it; `attempt` already expresses it. (`packages/effect-playwright/AGENTS.md` PW1.)
- **Errors are variants, not reasons.** One tagged error per failure the library distinguishes (`PlaywrightTimeout`, `PlaywrightFailure`), never a `reason` field (`CONST-D2`).
- **Lifetimes go through the library's disposal protocol,** so one `acquire` covers every resource kind.

## Applicability

Use this for any promise-based SDK whose objects the caller already knows how to use. It does not apply where the Effect layer must change the protocol itself (retries, batching, decoding a wire format), because those wrappers carry their own read, transform, and write and are not pass-through.
