---
"@systemfsoftware/vitest": patch
---

A property whose recorded seed-store failure no longer reproduces now passes and is decided by its novel draws. It used to fail as `PropertyRefuted` with an undefined counterexample. A recorded draw that still fails, but whose recorded shrink steps no longer replay, now reports that draw as the counterexample. A stale recorded draw no longer counts as refuting the constant impostor.
