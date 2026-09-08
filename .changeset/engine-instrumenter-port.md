---
"@systemfsoftware/stryker-js-engine": major
---

The engine consumes instrumentation through the `Instrumenter` port from
`@systemfsoftware/stryker-js/Instrumenter` instead of importing the
instrumenter product.

BREAKING CHANGE: `EnginePorts` now includes `Instrumenter`. Hosts composing
engine cells must bind `instrumenterLayer` (or their own implementation of the
port) into the provided layer; a layer without it no longer type-checks.
