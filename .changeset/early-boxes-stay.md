---
"@systemfsoftware/effect-daemon-spec": minor
---

`Supervisor.awaitTerminated` is answered when the supervisor's drain fiber is stopped with a caller still waiting, instead of waiting forever. `Supervisor.FiberMedium.FIBER_CHILD_STOP_WINDOW_MILLIS` is the stop window a fiber child gets by default.
