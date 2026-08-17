---
'@systemfsoftware/effect-atom': minor
---

Atoms built from a runtime keep the last good answer again, and four read paths that lost or overwrote a value are fixed.

- A stream-backed atom that emitted values and then completed reported an empty stream and failed with `NoSuchElementError`. It now settles with the value the stream emitted last.
- A failing refresh, retry or reload no longer clears the value already on screen. The previous success is carried across effect, stream, pull, `subscriptionRef` and `fn` atoms, so `Result.previousSuccess` is populated while waiting and after a failure, as documented.
- Reading a `subscriptionRef` atom whose runtime layer failed threw `Result.getOrThrow: no value found` instead of reporting the failure. It now reports the layer's failure like every other atom on that runtime.
- `Atom.kvs` without `mode: 'async'` wrote `defaultValue()` into the store on first read, overwriting a value the store had not finished loading. The fallback is now shown without writing, and the default is stored only once the store reports the key absent.

Surface changes:

- `AtomContext.self` takes the value type as a parameter: `get.self<MyResult>()` returns `Option<MyResult>` where it previously returned `Option<unknown>`.
- `AtomRuntime.subscriptionRef` declares `Cause.NoSuchElementError` in its error channel, which its implementation always could produce.
- The HTTP API client's `mutation` and `query` bound their `Group` and `Endpoint` type parameters to any group and any endpoint. Each is now bound to the group and endpoint its identifier arguments select, so a call that passed one of them explicitly and disagreed with the identifiers no longer compiles.
- `Result.builder` renders a typed value. `orElse` returns the accumulated value or the fallback, `orNull` and `render` add `null`, and `exhaustive` returns the value alone, where all four previously returned `unknown`. Code that relied on assigning a rendered result anywhere now needs the value's real type.
