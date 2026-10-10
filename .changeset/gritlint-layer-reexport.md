---
"@systemfsoftware/gritlint": minor
---

`cell-architecture/service-exports-no-layer` now also reports a service module that re-exports a binding named `layer`, `*Layer` or `*Live`, or exports a const bound to one, such as `export const clock = layer` or `export const clock = ClockDriver.layer`. A service module that passed before can fail now; move the Layer into a driver module and import that driver where the program is composed. Names such as `layerCount` no longer match, because the rule now compares the whole name. The report now says what to move and where.
