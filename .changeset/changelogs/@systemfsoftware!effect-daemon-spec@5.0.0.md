## 5.0.0

### Major Changes

- A supervisor that exhausts its restart intensity now stops every child and then fails `Supervisor.awaitTerminated` and `Supervisor.shutdown` with `Supervisor.SupervisorTerminated`. The error's `cause` is the failure of the child that exhausted it. A supervisor running as another supervisor's child ends abnormally when it gives up, so its parent counts it against its own intensity and escalation reaches the top-level owner. A requested shutdown, and a supervisor with `coolDown` declared, still succeed.

- The package now exports a single `Supervisor` namespace that builds Erlang/OTP supervision trees: `Supervisor.make(name)` with `strategy`, `intensity`, `autoShutdown`, `coolDown`, `backoff`, `dynamic` and `children`, acquired through `.scoped` or `.layer`. Children run as fibers by default, and `Supervisor.ChildSpecs.on(port)` declares a child on another medium, whose layer the tree's `.layer` then requires. Restart strategies, restart types, restart intensity and shutdown modes follow OTP's `supervisor`, and exhausting the intensity now terminates the supervisor unless `coolDown` is declared. `Daemon`, `LeaderLock`, `LockPrimitive` and the `run` entry points are removed; declare a supervisor with `Supervisor.make` and its children with `Supervisor.ChildSpecs.make` instead. A running supervisor's decisions are observable through `Supervisor.traceOf`.

### Minor Changes

- Adds an `@systemfsoftware/effect-daemon-spec/testing` entry point that checks a `LockPrimitive` implementation for linearizability. It exports the lock command schema (`LockCommand`), a pure lock model (`lockModel`, `stepLock`), `leadershipOver(primitive)`, which builds the `LeaderLock` the daemon uses over your primitive, and `runLockCommand`. Pass them to `Conformance.linearizable` from `@systemfsoftware/conformance-spec`, which is an optional peer dependency. The root entry point pulls in no test code.

- Add `Supervisor.livenessTick(millis)`, which declares how often the kernel's liveness tick fires for a ready child, beside the other policy knobs. Declare a longer tick when children run on a medium whose lifecycle steps take longer than the default one-second interval.

### Patch Changes

- Every tagged error class now has a one-line message built from its fields, so a failure shows what went wrong instead of an empty message.

- Update peer and runtime dependency on `effect` and companion packages to `4.0.0-rc.117`.

- Updated dependencies:
  - @systemfsoftware/conformance-spec@0.2.0
