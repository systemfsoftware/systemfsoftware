---
"@systemfsoftware/effect-daemon-spec": major
"@systemfsoftware/stryker-js-cli": major
---

Pass capabilities as arguments instead of requiring them through a projection tag

Wlaschin's second approach — dependency parameterization — is preferred over the
Reader, and it removes the requirement from the signature entirely rather than
relocating it. Each operation that previously reached into the context for a
projection now receives what it uses, and the composition root is the single place
that acquires the port.

- `effect-daemon-spec` — `withLeaderLock` takes `lock: LeaderLock['Type']`, and the
  supervisor body takes `reporter: DaemonReporter['Type']`. Every `yield* LeaderLock`
  and `yield* DaemonReporter` now lands in `mod.ts`; the exported `worker` and
  `supervisor` shapes are unchanged, and `withLeaderLock` loses `LeaderLock` from `R`.
- `stryker-js-cli` — `StrykerCliExecutorDeps` and its service interface are gone.
  `runStrykerCli` and the handler take `detectMode` and `createRunEventStream`, typed
  as indexed accesses off the two port services, and both lose the requirement from
  `R`. `main.ts` acquires both ports and passes the members down.

A caller that provided the projection layer now provides nothing, because the
operation no longer requires anything.
