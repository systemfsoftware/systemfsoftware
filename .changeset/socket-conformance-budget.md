---
"@systemfsoftware/effect-daemon-socket": patch
---

`SocketMedium.conformanceDriver` now declares a scenario budget (10 s per scenario, a 1 s start timeout and a 10 s liveness tick), so `Conformance.prove` no longer reports a spurious divergence when a loaded host delays a loopback dial past the catalogue's in-process timers.
