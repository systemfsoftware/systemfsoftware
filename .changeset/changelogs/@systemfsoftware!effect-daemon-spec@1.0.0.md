## 1.0.0

### Major Changes

- Pass capabilities as arguments instead of requiring them through a projection tag, in these two packages

  Wlaschin's second approach — dependency parameterization — is preferred over the
  Reader, and it removes the requirement from the signature entirely rather than
  relocating it. Each operation in `effect-daemon-spec` and `stryker-js-cli` that
  previously reached into the context for a projection now receives what it uses,
  and the composition root is the single place that acquires the port.

  The remaining `*ExecutorDeps` projections live in `omp/**/src/internal/`, fenced
  behind each package's own `exports` map, so they are unreachable from any consumer;
  the exported-wiring gate scans `src/` outside `src/internal/`, so internal composition
  stays internal and is not a migration target here.

  - `effect-daemon-spec` — `withLeaderLock` takes `lock: LeaderLock['Type']`, and the
    supervisor body takes `reporter: DaemonReporter['Type']`. Every `yield* LeaderLock`
    and `yield* DaemonReporter` now lands in `mod.ts`; the exported `worker` and
    `supervisor` shapes are unchanged, and `withLeaderLock` loses `LeaderLock` from `R`.
  - `stryker-js-cli` — `StrykerCliExecutorDeps` and its service interface are gone.
    `runStrykerCli` and the handler take `detectMode` and `createRunEventStream`, typed
    as indexed accesses off the two port services, and both lose the requirement from
    `R`. `main.ts` acquires both ports and passes the members down.

  For these two packages, a caller that provided the projection layer now provides
  nothing, because the operation no longer requires anything.

- Carry the lock decision as a `LockBinding` so a required lock can never silently vanish.

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

### Minor Changes

- cut over to effect v4 (4.0.0-rc.108): public surface derives from effect types; peers flip effect ^3→^4

- Produce every workflow through `Workflow.make`.

  `decideRestart`, `interpretHookResult`, and `admitSurvivorsRun` are now built by the constructor rather
  than annotated with `Workflow<Command, Decision, Error>`. Each decision is behaviourally identical —
  `make` is the identity at runtime — but the channels are now inferred from the decider instead of
  asserted by hand, so a total decision resolves to `UninhabitedError` and becomes uncallable rather than
  compiling as a workflow that cannot fail.

  `effect-daemon-spec` takes a minor bump because the change is consumer-visible beyond its own source:
  `@systemfsoftware/effect-cell-types` moves from `devDependencies` to `dependencies`, so installing this
  package now installs it. That reclassification is required, not incidental — `make` is a runtime call,
  and `scripts/guards/check-runtime-deps.mjs` fails a runtime import declared only as a dev dependency.
  `omp-claude-compat` gains the same dependency; `stryker-js-cli` already declared it.

  `RestartDecisionWorkflow` survives as a type-only export: one in-repo consumer, its own property test,
  references it through `ReturnType<…>`.

### Patch Changes

- Array types are spelled one way. `Array<T>` and `ReadonlyArray<T>` in emitted
  declarations become `T[]` and `readonly T[]`, which the type checker cannot tell
  apart: no exported type changes, only how it is written.

- New version is published through npm trusted publishing, so it carries a provenance attestation you can verify.

- Express each executor's sandwich as a `Cell` description.

  Every call site that previously sequenced the phases by hand now builds one description and hands it to the interpreter, so the order these executors run in is carried by the phase types instead of by the order the statements happen to appear in. Behaviour is preserved and no public surface moves: the change is confined to `src/internal/*.executor.ts`, and each package's golden API report is unchanged.

  One site needed a real fix rather than a translation. `supervisor-body.executor.ts` wrote before it could classify — it recorded a restart, then read the resulting rate — which is a read that depends on an earlier decision. Its read now gathers the restart record and the resulting rate as one product, which keeps that site a single layer, with the intensity tracker passed as the read's command rather than captured from the surrounding scope.

- The base mutation preset selects at the make boundary.

  The preset carries both ignorers (`effect-schema-declarations`, `workflow-make-boundary`) and
  `disableBail: true`, so killer recording is structural for every inheriting config. The sandwich
  packages (daemon-spec, stryker-js-cli, omp-claude-compat) widen `mutate` to all non-test source
  at explicit 100/100/100 thresholds — the ignorer is the selector, so membership is forced by the
  brand rather than chosen by a path list. Library packages' mutate arrays are byte-identical.

- `restart-decision.workflow.ts` has its pure decision in a new internal `restart-decision.kernel.ts` with a colocated property test. Both files are internal, so the package's public surface is unchanged and the restart behaviour is identical.

- Updated dependencies:
  - @systemfsoftware/effect-cell-types@2.0.0
