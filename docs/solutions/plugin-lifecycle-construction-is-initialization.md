---
area: architecture-patterns
problem_type: design
category: architecture-patterns
---

# Plugin Lifecycle: Construction Is Initialization

## Problem

Plugin ports declared `init` and `dispose` members alongside their real
operations (`dryRun`, `mutantRun`, `check`). The lifecycle members invited
three defect classes:

1. **Dispose-time registration** — teardown handlers were subscribed during
   `dispose` itself, after the resource they guarded had already stopped
   accepting work. The cleanup ran outside the Effect runtime as a bare
   promise: unsupervised, untyped, swallowed failures.
2. **The typed-channel lie** — a port declared `Effect<A, never>` while the
   construction path could fail (options decode, worker spawn, dependency
   resolution). The lie forced implementers to swallow real failures into
   opaque defect strings or fake success values.
3. **Leak on interruption** — if a fiber died between acquiring a resource
   and reaching the dispose call, nothing released it. `dispose` is a
   method someone must remember to call; interruption is nobody calling
   anything.

## Mechanism

The lifecycle contract creates an ordering inversion: work that belongs to
the construction phase (acquire, verify, bind) is deferred to an explicit
call, so every caller between build and init observes a half-constructed
service. If $A$ = acquire, $V$ = verify, $U$ = first use, the contract
permits the interleaving $A \rightarrow U \rightarrow V$, where $U$ on an
unverified resource is undefined behavior.

Meanwhile the deferred cleanup is registered on an event bus owned by the
underlying library (`ctx.onClose`-style hooks), not on the runtime's scope.
Release then runs at the whim of the library's event loop with no
supervision, no finalizer ordering, and no error channel — the cleanup's
failure mode is invisible to the system's cause tracking.

## Architectural Invariants

**Construction is initialization.** All acquire-and-verify work happens in
the layer's build effect. The build effect uses `Effect.acquireRelease` so
every resource's release is registered on the build scope before the build
can fail or be interrupted. `Layer.effect` strips `Scope` from the layer's
requirement channel, so consumers never see the scope.

**Scope owns teardown; the type owns failure.** Cleanup runs as finalizers
(LIFO, uninterruptible, supervised). A data flag distinguishes explicit
close from scope-driven close, making double release a no-op. Construction
failures are typed per phase: a plugin that cannot build fails with a
dedicated `PluginBuildError`; runtime operation failures keep their own
tagged errors. The port's error channel then only ever carries what can
actually happen at that phase.

```text
Layer.effect(Tag, Effect.gen*:
  acquireRelease(
    construct,            // may fail: PluginBuildError
    (resource) => release // runs on scope close, guarded, never throws
  )
  return Tag.of({ ...operations only })
)
```

**Defects die; failures translate.** A wrapper that catches defects into
success values forges the result channel. Catch failures to translate them
into the phase's typed error; let defects propagate to the supervisor.

## Code Smells

- `init`/`dispose` members on a service whose construction is already a
  layer build.
- `Effect.runPromise` inside a teardown hook — execution escaping the
  runtime.
- `Effect.catchCause((cause) => Effect.succeed({ failure: cause }))` — the
  cause-capturing success that turns every failure channel into `unknown`.
- `per-operation Effect.provideService` of an impl captured in the same
  closure, outside a documented composition edge.
- `Reflect.get` + `typeof` ladders to read a config section the plugin's
  own schema could decode.

## Verification

- Paste the forbidden shape back: re-adding an `init` member to the port
  must fail the type check at every implementation site.
- Interruption drill: cancel a fiber between layer build and first use;
  the scope's finalizers must release all resources (no temp-file or
  process survivors).
- Sabotage: make the build's acquire fail; the engine must surface the
  typed build error, not a silent empty context.
