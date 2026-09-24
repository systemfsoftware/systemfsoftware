## 4.2.0

### Minor Changes

- Adds an `@systemfsoftware/effect-daemon-spec/testing` entry point that checks a `LockPrimitive` implementation for linearizability. It exports the lock command schema (`LockCommand`), a pure lock model (`lockModel`, `stepLock`), `leadershipOver(primitive)`, which builds the `LeaderLock` the daemon uses over your primitive, and `runLockCommand`. Pass them to `Conformance.linearizable` from `@systemfsoftware/conformance-spec`, which is an optional peer dependency. The root entry point pulls in no test code.
