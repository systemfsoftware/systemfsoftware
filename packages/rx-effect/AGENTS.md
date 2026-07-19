# AGENTS.md — `@systemfsoftware/rx-effect`

> **Location:** `packages/rx-effect/` — bridge RxJS Observables into Effect-TS Streams. Universal agent rules live in the root `AGENTS.md`; this file carries only `rx-effect/`-specific deltas.

Converts `Observable<T>` → `Stream<never, Cause, T>` with backpressure and proper interruption via `Scope`.

## Key invariants

- Subscription lifecycle is managed by `Scope` — never leak an Rx subscription.
- Backpressure: use `Stream.buffer` / `Stream.chunk` to control Rx emission rate.
- Errors: Rx errors become `Cause.Die` — catch and map at the bridge boundary.
- Completing Observable → `Stream.end` — don't add synthetic infinite signals.
