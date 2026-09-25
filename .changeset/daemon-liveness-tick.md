---
"@systemfsoftware/effect-daemon-spec": minor
---

Add `Supervisor.livenessTick(millis)`, which declares how often the kernel's liveness tick fires for a ready child, beside the other policy knobs. Declare a longer tick when children run on a medium whose lifecycle steps take longer than the default one-second interval.
