## 3.0.0

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

- `AdmitSurvivorsRunInput` moved to `survivors.kernel.js` — import it from there. `SurvivorsAdmissionTypeId`, `SurvivorsRejectReason`, `Admitted`, `NoSurvivors`, `SurvivorsAdmission`, `SurvivorsRejection` and `admitSurvivorsRun` are unchanged.

  The admission's guard chain moved into `admissionVerdict`, a kernel classifier returning `reject` / `no-survivors` / `admit`; the workflow assigns channels to those three. All 69 existing tests pass unchanged, including the six that pin each rejection's remediation prose.

  Two measured findings shaped it. `Match.when({ kind: 'admit' }, …)` left a surviving mutant: `ObjectLiteral` widens the pattern to `{}`, which by elimination the last arm before `Match.exhaustive` only ever reaches with `admit` values, so the mutant is equivalent and unkillable — score 95.83 against a 100 break threshold. The workflow uses `Match.discriminator`, whose tag is a _string_ argument with no object literal to widen; the gate is back to 100 with zero survivors.

  Second, the relocation moved decisions out of the mutation surface — `mutate` is `src/survivors.workflow.ts` — dropping the mutant population from 47 to 24. Exactly one new law compensates: `∀r_SurvivorsSourced_→MismatchReject`, that provenance pre-empts emptiness (KTD7). Five further laws were written and deleted after measuring that the existing suite already fails on each of their defects; hoisting the emptiness check above the provenance check is the one defect that leaves the whole pre-existing suite green.

### Minor Changes

- cut over to effect v4 (4.0.0-rc.108): public surface derives from effect types; peers flip effect ^3→^4

- The Workflow brand: `make` is the only door to a decide slot.

  `Workflow<C, D, E>` and `Cell.DecidePhase<P>` carry a phantom `WorkflowBrand` conjunct applied
  solely by `Workflow.make` through the existing assertion narrowing — no runtime property, `make`
  stays the identity it always was. The consumer's signature is the forcing function: a bare
  function handed where a decide run is demanded is now a compile error naming the brand, so a
  decision cannot reach production without passing through the constructor every gate keys on.

  Breaking by design (`REPO-R1`): the two inline adapter sites (cli's admission adapter,
  claude-compat's submit-hook adapter) become `make`-wrapped, and the cell-gen either-pass
  fixture reshapes to one exhaustive path with the failure injection decided before the boundary.

### Patch Changes

- Array types are spelled one way. `Array<T>` and `ReadonlyArray<T>` in emitted
  declarations become `T[]` and `readonly T[]`, which the type checker cannot tell
  apart: no exported type changes, only how it is written.

- Repair the CLI the effect v4 cutover left unable to run

  The parser's Stdio layer was the test layer, whose sinks drain to nowhere, so help and version documents never rendered; the entrypoint passed the full process.argv to a parser that takes the arguments after the program name; the run-event stream's close could race the drain fiber's mailbox registration and hang the process forever; and a consumer closing the pipe crashed the whole process on the stream's unhandled error event. The stream now drains through the platform's Stdio sink, which owns backpressure, the scoped error listener, and the final flush, and every invocation — version, help, the agent manifest, a full run with its reader gone — completes with its classed exit code

- New version is published through npm trusted publishing, so it carries a provenance attestation you can verify.

- Express each executor's sandwich as a `Cell` description.

  Every call site that previously sequenced the phases by hand now builds one description and hands it to the interpreter, so the order these executors run in is carried by the phase types instead of by the order the statements happen to appear in. Behaviour is preserved and no public surface moves: the change is confined to `src/internal/*.executor.ts`, and each package's golden API report is unchanged.

  One site needed a real fix rather than a translation. `supervisor-body.executor.ts` wrote before it could classify — it recorded a restart, then read the resulting rate — which is a read that depends on an earlier decision. Its read now gathers the restart record and the resulting rate as one product, which keeps that site a single layer, with the intensity tracker passed as the read's command rather than captured from the surrounding scope.

- Build the `bin` target during install. Both CLIs point `bin` at gitignored build output, which pnpm's two bin-link passes skip when it is absent, leaving a fresh clone without the command and never retrying. A `prepare` script now builds the target between the passes; `arethetypeswrong-cli` drops its committed `bin/attw.mjs` launcher in favour of the same pattern.

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

- Updated dependencies:
  - @systemfsoftware/effect-cell-types@3.0.0
  - @systemfsoftware/stryker-js-mutation-run@3.0.0
  - @systemfsoftware/stryker-js-plugin-api@2.0.0
