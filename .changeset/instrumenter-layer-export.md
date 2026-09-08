---
"@systemfsoftware/stryker-js-instrumenter": minor
---

Adds the `instrumenterLayer` export: an Effect layer providing the language
`Instrumenter` port from this package's instrumentation. Type-check disabling
on the port returns an effect and reports failures as `InstrumenterFailed`
instead of a raw promise.
