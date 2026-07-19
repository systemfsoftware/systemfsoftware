# AGENTS.md — `@systemfsoftware/rx-effect`

> **Delta**: Bridge RxJS Observables into Effect-TS Streams. Root AGENTS.md governs.

Converts `Observable<T>` → `Stream<never, Cause, T>` with backpressure and proper interruption via `Scope`.

**Key invariants:**

- Subscription lifecycle is managed by `Scope` — never leak an Rx subscription
- Backpressure: use `Stream.buffer` / `Stream.chunk` to control Rx emission rate
- Errors: Rx errors become `Cause.Die` — catch and map at the bridge boundary
- Completing Observable → `Stream.end` — don't add synthetic infinite signals
