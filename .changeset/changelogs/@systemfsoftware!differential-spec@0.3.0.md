## 0.3.0

### Minor Changes

- Differential and Metamorphic checks now accept asynchronous targets: reference, candidate, and system effects may use Effect.sleep, Effect.promise, or any other deferred Effect, and both sides are awaited through fast-check's async property with the same shrinking, minimal-counterexample report, failure fingerprint, and runBudget/interruptAfterTimeLimit behaviour.

### Patch Changes

- The published tarball now contains the built dist bundle and its type declarations; the manifest's exports pointed at files the tarball did not include, so importing the published package failed. Development files no longer ship and the package now publishes a README.

- Update peer and runtime dependency on `effect` and companion packages to `4.0.0-rc.117`.
