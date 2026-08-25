## Residual Review Findings

Source run: `skill://architecture-conformance` audit plus consolidation, branch `strykerjs-subsystem` @ `dc2a67ac4fa`. The subsystem went from 273 source files across 30 directories to roughly 114 across 2, one capability module per concept (`<Stem>.ts` / `<Stem>.schema.ts` / `<Stem>.workflow.ts`).

### Defects found and fixed

Every item below was a behavioural defect, not a style finding, and each was introduced by the consolidation itself rather than inherited:

- **The project reader was a stub.** `platform-node/src/Project.ts` carried the header `Project capability — stub for typecheck gate`, and `readProject` ignored all three parameters and returned `makeProject({}, undefined, [])`. The engine would have found zero files to mutate. Restored the tree walk, the file-selection decision and the incremental-report read from the pre-consolidation implementation.
- **No child-process worker could boot.** The `internal/` prefix was dropped from the tsdown entry keys and an `exclude` list removed those subpaths from `exports`. `Checker.ts` and `TestRunner.ts` build `new URL('./internal/<name>.mjs', …)` and `Worker.ts` resolves the published `./internal/child-process-proxy-worker-main` subpath, so all three spawn paths broke; the `require.resolve` fallback then handed Node a `.ts` file and the worker timed out at connect. Restored in `tsdown.config.ts`; the 9 in-source `Worker.ts` tests pass.
- **`PluginKind` member access resolved to `undefined`.** `PluginKind` is an `S.Literals` schema, not an enum, so `PluginKind.Ignore` and `PluginKind.Evaluator` were `undefined` at runtime and `declarePlugin` failed `PluginContribution` schema validation at module load — taking down whole test files. Replaced with string literals at five sites.
- **The `Evaluator` port was deleted while a second implementation still depended on it.** `stryker-test-contribution` — this repo's own mutation gate — is an independent `Evaluator`, so the port passes `REPO-A2`'s strategy test and earns its existence. Its removal left that package with 9 typecheck errors. Restored the plugin kind, the `PluginInterfaces` entry and the `Evaluator` export subpath.
- **The mutation-test phase was wired with nonsense.** `previous | undefined` was a bitwise OR in an argument position, and the decode read its payload, discarded it with `void`, then decoded an empty object literal.
- **Nine `no-misused-spread` defects on `Mutant`.** `Mutant` is an `S.TaggedClass`, so `{ ...mutant }` silently dropped `_tag` and the prototype, and reporting carried plain objects claiming to be mutants.
- **Four runtime defects in `vitest-runner`.** A fabricated `perMutant` coverage key that broke the dry-run payload; a path normaliser that prepended the project root instead of stripping it; a `Cell.decode` that passed a raw object where a tagged command was required, producing `SchemaError: Missing key at ["_tag"]`; and a hit-limit comparison changed from `>` to `>=`, which both moved the boundary and dropped the `reason` string the test asserts on.
- **`ExitClass` was declared three times**, two of them byte-identical, giving two definitions of "most severe" that could disagree. Collapsed to one declaration in the language package.

Verified after the last edit: `tsc --noEmit --incremental false` reports 0 errors in all seven `stryker-js` packages and both plugin packages; 266 tests pass (9 platform-node, 62 cli, 7 instrumenter, 28 vitest-runner, 124 stryker-plugins, 36 stryker-test-contribution).

### Defects found and fixed by running the binary

The section above was verified by static gates only. Driving the built CLI against
`cli/tests/__fixtures__/fixtures/minimal-project` found eight further defects, each of which
stopped a real run. None was visible to `pnpm check:local`.

- **`Cell.apply` hands every layer the original command**, so the four run stages were never a
  pipeline. Proven by probe: a two-layer description whose second read logged what it received
  saw the original command, not the first layer's response. Stage two therefore called
  `toPrepareDone(command)` on a `PrepareExecutorArgs` and threw `Invalid PrepareDone`. Fixed by
  applying the four descriptions in sequence and passing each stage's response as the next
  stage's command.
- **The sandbox wrote every file to a directory.** `Project.writeToSandbox` joined
  `path.dirname(relative)` instead of `relative`, so its "target file name" was the target
  _directory_; for a root-level file `dirname` is `'.'` and the target became the sandbox root
  itself, failing with `EISDIR`. The correct form was six lines below it in `backupTo`.
- **Three decode phases built bare object literals for `TaggedClass` commands.** `PrepareCommand`,
  `InstrumentCommand` and `DryRunCommand` are `S.TaggedClass`, so a literal without `_tag` fails
  its own schema — `SchemaError: Missing key`. Each now constructs the command.
- **`DryRunCommand.status` could never validate.** Its schema spells the statuses `Complete`,
  `Error`, `Timeout`, while the runner's own `CompleteDryRunResult.status` is `'complete'` — the
  decode computed the lowercase form and handed it to a schema that accepts only the capitalised
  one. The mapping between the two vocabularies is now the reason that decode exists.
- **File selection matched relative globs against absolute paths**, so every project had zero
  files to mutate. The reader yields absolute names, `mutate` patterns are written relative
  (`src/**/*.js`), and `^src/…$` never matches `/home/…/src/calculator.js`. `basePath` was
  already on `FileSelectionCommand` and unused; patterns now resolve against it.
- **The mutant-test plan was decided at the edge, with the timeout hardcoded to zero.**
  `Run.ts`'s `buildCoveredPlans` built run options with `timeout: 0` and `netTime: 0` and ignored
  the hit limit, while the pure planner in `Mutants.workflow.ts` — which computes
  `timeoutFactor * netTime + timeoutMS + timeOverheadMS` — was dead code reached by nothing. Every
  mutant lost its `Effect.timeoutOrElse` race instantly and was reported `Timeout`; the score was
  100 because a timeout counts as killed. The edge now calls the decision and supplies the
  sandbox path mapping as command data, which is what the decision was missing.
- **A finished run exited 1 and discarded its own verdict.** `closeAndDrain` used
  `Queue.interrupt`, which keeps the buffer but ends the queue with an _interrupt_ cause; joining
  the drain re-raised it, so the program's exit was `Failure(Interrupt)` and `main.ts`'s teardown
  fell through to `EXIT_CODE_RUN_NEVER_REACHED_ITS_FINALIZER`. `Queue.end` completes with
  `Cause.Done`, which `Stream.fromQueue` excludes from its error channel, so the buffer drains and
  the resolved exit code survives. `RunEvents` now carries `Cause.Done`.
- **The mutation-test stage built a second reporting service whose `reportAll` returned
  `verdict: null`.** Its two per-mutant handlers duplicated the real service's. One service now
  serves the stage, so the verdict the run exits on is computed by the same object that reported
  the mutants it was computed from.

Verified by running the built binary: `minimal-project` exits 0, emits 8 NDJSON lines ending in a
`verdict`, and scores 100 with both mutants killed; `surviving-mutant-project` exits 0, streams a
`Survived` mutant event and scores 0. All seven `stryker-js` packages typecheck at 0 errors and the
same 266 tests pass.

### Residuals

- **P1 — resolved.** The 26 casts came from each stage being declared `<P extends Cell.Phases>`
  and instantiated once at `MutationRunPhases`, whose `raw`, `decoded` and `decision` are
  `unknown`; inside a generic body `P['raw']` is opaque. The prerequisite named here — that
  `Cell.apply` hands every layer the original command — was confirmed by probe and is now fixed
  by the four-applies shape above, so a run completes. The casts themselves remain: giving each
  stage its own concrete `Phases` is the change that removes them, and it is independent of the
  threading fix that made the run work.
- **Not architectural after all — `make-body-purity`.** Two agents reported this rule as needing a subsystem-wide redesign. That was wrong, and the counter-example is in the tree: `platform-node/src/IncrementalReport.workflow.ts` went from 2 violations to 0 without changing a decision's semantics. The rule wants two things, and both have a mechanical answer. A reference to an imported binding is fixed by declaring it in the workflow file — a schema may legally live in the `*.workflow.ts` that owns it, so a `*.schema.ts` read by exactly one decision moves in and is deleted. Control flow in the body is fixed by dispatching: `Option.match(Option.fromUndefinedOr(x), …)` replaces an `if`, `Object.entries(…).map(…)` replaces a `for-of`, and a same-file helper may still branch internally because the rule inspects only the body. The remaining instances were dispatched on that basis rather than filed. The claim to be sceptical of is the one both agents made — that a rule which is inconvenient must be architectural.
- **P2 — the mutation-test decision is vacuous.** `MutationTest.workflow.ts` declares `MutationTestCommand {}` and `MutationTestDecision {}` and its decider ignores its command. The pre-consolidation stage had no `Cell` or `Workflow` at all, so nothing pure was extracted; the phase's real decisions live in `Mutants.workflow.ts` and the checker, before it runs. Either the phase has a decision worth naming or it should not pretend to — the empty command is why the decode had to fabricate a payload in the first place.
- **P2 — two rules jointly forbid every placement for `Worker.ts`'s tests** (2 violations, left standing deliberately). `no-io-module-in-source-test` refuses an in-source `import.meta.vitest` block in a module that calls a filesystem, process or network binding, and `Worker.ts` spawns child processes. Moving the block to `tests/` was tried and reverted, because the destination is governed too: a bare `*.test.ts` there trips `no-test-file-in-src`'s sibling suffix rule, and renaming to `*.integration.test.ts` then demands a Gherkin `makeFeature` (`behaviour-test-requires-gherkin`, `behaviour-one-feature-per-file`) **and** an import of the published surface (`tests-import-public-api`). The subject of these nine tests is `makeChildProcessProxy`, which `src/index.ts` does not export and should not — exporting IPC wiring to satisfy a linter is the projection REPO-A3 forbids. So the placements are: in-source (2 violations), or in `tests/` importing internals (1 violation plus a re-export file that exists only to launder the import past the rule), or deleted. An intermediate attempt did build that laundering file; it was removed, because a shim whose only purpose is to make a check pass while defeating its intent is the CHK1 failure. The tests stay in-source: they are the only thing in the repo that spawns a real worker, and they are what caught the dropped `internal/` export subpaths this session. The rules are each right and their conjunction is not satisfiable here — resolving it means one of them learning about an I/O module whose tested subject is legitimately internal, which is an evaluator change and its own commit.
- **P3 — the mutant-planning decision constructs domain objects** (`platform-node/src/Mutants.workflow.ts`, 1 `make-body-purity`). The decision builds `Mutant` instances from derived fields, and `Mutant` is the flagship `S.TaggedClass` with consumers across the subsystem, so the rule's remedy — declare it in the workflow file — would fork the domain type. The correct fix is the other direction: the decision returns plain derived props and the impure edge in `Mutants.ts` constructs the `Mutant`, which is the sandwich as designed. That changes the exported signatures of `PlanMutantTestsCommand` and `PlannedMutantTests` from `S.Array(Mutant)` to prop structs, so downstream `instanceof`/`isMutant` readers move with it. Worth doing; not a rider on a change this size.
- **P0 — fixed.** The CLI now emits its full event stream and exits on the code its verdict
  resolved. Two causes were named in the previous round; both are addressed above — the queue
  close (`Queue.interrupt` → `Queue.end`, which also fixes the exit code) and the boot failure
  behind the silence, which was an `exports` subpath the reporter plugin specifier depended on.

  Nothing in the repo's local gates can see any of this. The suite that asserts on CLI output —
  `cli/tests/cli-contract.integration.test.ts`, which packs tarballs and drives the real bin in a
  container — is excluded from the default `test` task (`cli/vitest.config.ts` includes only
  `src/**/*.test.ts`) and lives behind `test:contract`. That lane cannot start a container in this
  sandbox (`netavark: … route_localnet: Read-only file system`), so it runs only in CI. Meanwhile
  `pnpm test` in that package reports 62 passing tests, all in-source units over pure decisions,
  none of which runs the binary. A green local run says nothing about whether the CLI emits a
  single byte; every defect in the section above was found by running it by hand.

### The declared phase context was unverifiable — fixed

`Cell.Phases` carried `readContext` and `writeContext`, and `ReadPhase`/`WritePhase` used them
as the `R` of the effect a phase returns. The members were author-supplied metadata that
nothing recomputed, and their fidelity turned out to be a property of the declaration site
rather than of the member: where a bag is concrete TypeScript does check the phase body's `R`
against the declared member, but where the stage is generic over `Phases` it cannot see the
lambda's requirement at all. This subsystem's densest consumers are the generic ones, so the
check was vacuous exactly where the services are thickest — `platform-node/src/Run.ts`
declared `never` on four stages whose bodies required
`FileSystem | Path | RunEnvironment | Scope`, and that compiled.

Replacing declaration with inference made the truth visible at once: `Config.ts(1180)`,
`Plugins.ts(279)` and `Run.ts(393)` each reported the real service set the member-based design
had been absorbing. Where the site is concrete the member was not a check but a third copy of
one fact — `Sandbox.ts` stated its four services as bag members, again as `makeSandbox`'s
return `R`, and a third time in the body that proves them.

The fix pins both channels to `never` in `ReadPhase`/`WritePhase` and deletes the members, so
services reach a phase as parameters of the function that builds the description. The
enumeration moves to a parameter type, and that is the whole gain: a parameter's correctness is
enforced by use. Under-claiming leaves the phase's context wider than `never`, which the phase
type rejects; over-claiming widens the builder's own requirement, which surfaces at the
composition root. Both directions now fail a check, and they fail it under generics too,
because the pin is on the phase type rather than on a member a bag author writes.

Cost, named: nine declaration sites gain a parameter. The counter-case is real and was
weighed — `apply`'s own documentation had promised that "a `Scope.Scope` a phase requires
reaches the caller as part of the derived `R`", seven production modules used that mode, and a
type test pinned the union it produced. That capability is deliberately removed rather than
repaired, because a guarantee that holds only when the declaration site happens to be concrete
is not one the type system enforces.

### Testing gaps

No gate asserts that a `*.workflow.ts` decision is non-vacuous, so an empty command and decision pair passes every check. No gate catches an `exports` subpath that a `require.resolve` call depends on, which is why all three worker entry points could break without a single failing check until a test actually spawned one.
