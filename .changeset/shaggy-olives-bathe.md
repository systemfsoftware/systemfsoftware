---
"@systemfsoftware/trace-spec": minor
---

Cases now run on the simulation kernel — the zero-preemption schedule, then the profile's seeded schedules — instead of always on the live clock, and each case draws its own crypto-random salt, so two cases never share a trace id.

- `Suite.make({ it, layer })` → `Suite.make({ it })`.
- A case that must stay live declares a reason on any stage: `.live('...')`, or the new `Suite.live` combinator (`self.pipe(Suite.live(reason))`).
- `withLayer(shared)` rebuilds the shared layer freshly for every case rather than once per suite.
- `Stimulus.traceContext` draws its ids through Effect's `Random`, so a seeded run replays the same trace ids.
