---
"@systemfsoftware/effect-sim-kernel": patch
---

A fiber resumed under Effect 4.0.1 now costs one kernel step again. Effect 4.0.1 restores a fiber's async context by re-entering `evaluate` from inside itself, and the kernel queued that nested call as a second resume, so every slice took one extra step. Long runs that fit the 50,000-step bound under Effect 4.0.0 hit it under 4.0.1 and reported `Incomplete`. The kernel now runs the nested call as part of the resume already in flight.
