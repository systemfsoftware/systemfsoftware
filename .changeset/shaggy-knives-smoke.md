---
"@systemfsoftware/vitest": minor
---

A property whose recorded seed-store failure no longer reproduces now passes and is decided by its novel draws. It used to fail as `PropertyRefuted` with an undefined counterexample. A recorded draw that still fails, but whose recorded shrink steps no longer replay, now reports that draw as the counterexample. A stale recorded draw no longer counts as refuting the constant impostor. `ReplayNoLongerReproduces` is a new exported property-channel error: an explicit `CONFORMANCE_REPLAY` replay that no longer reproduces its failure now fails with it — carrying the property and the replay text fed back — instead of passing.
