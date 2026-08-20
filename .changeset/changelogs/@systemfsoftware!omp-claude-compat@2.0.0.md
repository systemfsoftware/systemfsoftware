## 2.0.0

### Major Changes

- Collapse projection tags into the ports they projected

  A `*ExecutorDeps` tag whose service type was indexed off other ports recorded which members
  one operation happened to reach for. Exporting it turned internal composition into a surface
  commitment: a consumer had to discover and provide an aggregator for each operation, where the
  port it came from already served. The tags rode the `R` channel of exported signatures, so a
  consumer met them only at their own call site.

  Each was removed the way its evidence directed — no tag was renamed, and none was replaced:

  - `AttwCliExecutorDeps`, `CheckPackageExecutorDeps` — deleted. Zero consumers, no Live layer;
    callers already required the real capabilities directly.
  - `HookDispatcherExecutorDeps` — was a 1:1 alias of `Scope.Scope`. Requiring `Scope` names the
    same service.
  - `InjectInstructionsExecutorDeps` — packed `FileSystem`, `Path` and `TomlLoader` with no logic.
    Consumers require the three ports.
  - `EffectVitestDeps` → `EffectVitestBindings`. Never a `Context.Tag`: a plain type alias already
    passed as an ordinary parameter, so only the name misdescribed it. A stale api report that no
    `api-extractor` regenerates was deleted with it.

  A consumer providing a port instead of an aggregator provides no more than before, since a
  service `{ a, b }` is assignable to a requirement `{ a }`.

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

- New version is published through npm trusted publishing, so it carries a provenance attestation you can verify.

- Express each executor's sandwich as a `Cell` description.

  Every call site that previously sequenced the phases by hand now builds one description and hands it to the interpreter, so the order these executors run in is carried by the phase types instead of by the order the statements happen to appear in. Behaviour is preserved and no public surface moves: the change is confined to `src/internal/*.executor.ts`, and each package's golden API report is unchanged.

  One site needed a real fix rather than a translation. `supervisor-body.executor.ts` wrote before it could classify — it recorded a restart, then read the resulting rate — which is a read that depends on an earlier decision. Its read now gathers the restart record and the resulting rate as one product, which keeps that site a single layer, with the intensity tracker passed as the read's command rather than captured from the surrounding scope.

- `hook-verdict.workflow.ts` keeps its pure decisions in `hook-verdict.kernel.ts`.

  A blank block reason now yields a stated fallback instead of an empty one. `parsed.reason ?? fallback` guards only nullish, so a hook emitting `"reason": ""` produced a block with no explanation at all. Blankness is decided on the trimmed value and a stated reason is returned verbatim, spacing included, so the hook's own words reach the user unchanged — the three existing workflow property tests pin exactly that and pass unchanged.

  The relocation moved the decisions out of the mutation surface: `stryker.config.json` mutates `src/*.workflow.ts`, and the kernel's observer is a colocated K-law property test instead. Measured across the move, the killed-mutant count fell from 15 to 1 while the score stayed at 100 — a perfect score over one mutant. Seven K-laws now observe those decisions instead: exit classification is total, ignores stdout off the success path, and splits on the decision-object shape; a block always states a reason; the two stderr readers agree; the permission key shadows the legacy key; a parsed block reads the field its key implies. Five planted mutants were each caught by exactly the one law that governs them, with the other six staying green.

- Each of these packages now has a README, so its registry page says what the package is, how
  to install it, and what to import or register — previously the page was blank. The lint
  plugins show the configuration line that enables what they recommend.

  `@systemfsoftware/stryker-js-mutation-report` also carries its licence text

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
  - @systemfsoftware/effect-cell-types@2.0.0
