---
'@systemfsoftware/effect-atom': minor
---

`Registry.make` and `Registry.layerOptions` accept `now` and `scheduleTimer`, so every time-dependent atom can be driven without waiting in real time.

- `now?: () => number` supplies the clock.
- `scheduleTimer?: (f: () => void, delayMillis: number) => () => void` arms a delayed callback and returns its canceller.

Both default to the platform's wall clock and timer, so existing callers are unaffected. One substitution now drives all three time-dependent behaviours together: idle-TTL eviction, `Atom.debounce`, and `Atom.swr` staleness. Previously each read the clock and armed timers itself, so testing any of them meant real elapsed time.

`Registry` exposes `now` and `scheduleTimer` as members, alongside `scheduler` and `schedulerAsync`.
