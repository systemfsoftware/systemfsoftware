---
"@systemfsoftware/effect-daemon-spec": major
---

`Supervisor.Medium.Started.ready` is now `Effect.Effect<void, Supervisor.Medium.ChildEndedBeforeReady>`: it fails with `ChildEndedBeforeReady` when the child's run ends before the child signals ready, instead of waiting forever or reporting a readiness that never happened. The fiber medium obeys it, and the supervisor records no `ChildReady` event for such a child. A custom medium must fail `ready` the same way; pass the new type to `Supervisor.Medium.started`. `Supervisor.awaitTerminated` is answered when the supervisor's drain fiber is stopped with a caller still waiting. `Supervisor.FiberMedium.FIBER_CHILD_STOP_WINDOW_MILLIS` is the stop window a fiber child gets by default.
