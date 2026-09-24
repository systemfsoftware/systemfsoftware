---
"@systemfsoftware/effect-atom": minor
---

A registry built inside an Effect program now takes its default clock, task scheduling and timers from that program's `Clock` and `Scheduler`, so idle cleanup and refresh timers follow a `TestClock` or custom scheduler instead of the host's. A registry built outside any program keeps the host defaults, and `now`, `scheduleTask` and `scheduleTimer` passed to `Registry.make` still take precedence. `Atom.withRefresh` now schedules through the registry's `scheduleTimer`, and `Hydration.dehydrate` stamps saved values with `registry.now()`. Values seeded with `initialValues` or `setInitialValue` for an atom nobody has used yet now wait until that atom is first read or subscribed; before, the next scheduled cleanup could drop them first.
