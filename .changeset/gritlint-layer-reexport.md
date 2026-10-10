---
"@systemfsoftware/gritlint": minor
---

`cell-architecture/service-exports-no-layer` now also reports a service module that re-exports a binding named `layer`, `*Layer` or `*Live`, or exports a binding whose value is one: `export const clock = layer`, `export const clock: Layer.Layer<Clock> = ClockDriver.layer`, `export const clock = layer as Layer.Layer<Clock>`, and `export default layer`. Type-only re-exports such as `export type { ClockLayer }` stay allowed. A service module that passed before can fail now; move the Layer into a driver module and import that driver where the program is composed. Names such as `layerCount` no longer match, because the rule now compares the whole name. The report now says what to move and where.
