---
"@systemfsoftware/effect-cell-types": minor
---

Add the `Handle` and `Resource` cell kinds.

`Handle.make` builds a handle kind from a `create` that yields a driver and data. Acquiring a handle registers its release in the caller's `Scope` in the same step. Only the definition's own operations, streams, children, release steps, and integration receive the driver; operations come back as duals and die with `Handle.HandleReleased` once release starts. Each release stage escalates until a step succeeds, and an unrecovered stage surfaces as a defect. Typecheck refuses definitions that let the driver reach caller code.

`Resource.make` builds a resource kind over a handle definition, with optional `prepare` and `ready`. `kind.of(spec)` returns an inert resource whose `scoped`, `layer`, and `bind(key)` share one scoped acquisition.
