---
'@systemfsoftware/oxlint-plugin-effect-native': minor
'@systemfsoftware/oxlint-plugin-tag-discipline': minor
'@systemfsoftware/oxlint-plugin-structure': minor
---

First public release of the three former private leaf packages, each at its own version 1.0.0 with a self-registering `./preset` fragment:

- `@systemfsoftware/oxlint-plugin-effect-native` — Effect-runtime purity rules (native collections, timers, promises, workers, logging).
- `@systemfsoftware/oxlint-plugin-tag-discipline` — `@ Effect` tag integrity rules (tag access, alias assertions, I/O boundary tests).
- `@systemfsoftware/oxlint-plugin-structure` — structural rules (class bans, barrel bans, internal JSDoc placement).

Extend a package's `./preset` fragment and its plugin loads with its recommended rules; no hand-copied rule list.
