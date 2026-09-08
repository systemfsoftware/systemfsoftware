---
"@systemfsoftware/stryker-js": minor
---

Adds the `./Instrumenter` subpath: the port the engine consumes for
instrumentation — `Instrumenter` service tag, `InstrumenterFailed` error, and
the `InstrumenterFile` / `InstrumenterOptions` / `InstrumenterResult` payload
types. Both port methods return effects; nothing on the surface is an
already-started promise.
