---
"@systemfsoftware/effect-daemon-spec": major
---

The package now exports a single `Supervisor` namespace that builds Erlang/OTP supervision trees: `Supervisor.make(name)` with `strategy`, `intensity`, `autoShutdown`, `coolDown`, `backoff`, `dynamic` and `children`, acquired through `.scoped` or `.layer`. Restart strategies, restart types, restart intensity and shutdown modes follow OTP's `supervisor`, and exhausting the intensity now terminates the supervisor unless `coolDown` is declared. `Daemon`, `LeaderLock`, `LockPrimitive` and the `run` entry points are removed; declare a supervisor with `Supervisor.make` and its children with `Supervisor.ChildSpecs.make` instead. A running supervisor's decisions are observable through `Supervisor.traceOf`.
