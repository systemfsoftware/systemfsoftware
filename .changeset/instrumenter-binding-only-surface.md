---
"@systemfsoftware/stryker-js-instrumenter": major
---

The package now publishes its binding layer and plugin artifacts only. The
raw instrumentation entry points are no longer exported; instrumentation runs
through the bound service the layer provides, and type-check disabling rides
that service's effect-returning method instead of a raw promise.

Migration: replace direct calls to the removed entry points with a build of
the binding layer; call the instrumentation method and the type-check
disabling method on the service it provides.
