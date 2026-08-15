---
"@systemfsoftware/effect-daemon-spec": major
---

Carry the lock decision as a `LockBinding` so a required lock can never silently vanish.

The three lock-taking operations — the internal `worker`, `supervisor`, and the
`withLockByMode` operation behind them — now take a single discriminated
argument, `LockBinding`, in place of a `(LockConfig, LeaderLock['Type'] | null)`
pair. `unlocked` is the one case for a body that takes no lock; `locked` carries
the keyed spec and the adapter that honours it.

A spec declaring `mode: 'required'` paired with a null or missing adapter
previously fell through to the body unwrapped — a silent downgrade from "must
hold the leader lock" to "no lock at all". That combination is no longer
representable: `unlocked` only exists for a `{ mode: 'none' }` spec, and `locked`
demands both a keyed spec (via `KeyedLockConfig`) and an adapter (via
`LeaderLock['Type']`). The composition root — `worker` and `supervisor` in
`mod.ts` — is now the one place that builds the binding, and its public shapes
are unchanged.
