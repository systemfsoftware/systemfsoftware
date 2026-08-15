---
title: Generated Shape - Enforcement Moves Down The Ladder
date: 2026-08-15
status: draft
kind: long-horizon-brief
---

# Generated Shape

## Success predicate

Every cell in this repository is emitted from a declaration that carries no source text; the constraints that govern a cell ride module resolution and the type system, so a violating declaration fails to resolve or fails `tsc`; and the AST rule fleet is reduced to the residue that genuinely needs custom static analysis - each deleted rule carrying a demonstration that its defect class is unreachable or that it was never decidable at enforcement grade, and each survivor attributed to a class no stronger channel can carry.

A role whose shape cannot be emitted discharges the predicate through the counterexample below. Both are terminal.

## What running code settled

Seven review passes produced no evidence. A working emitter produced results in under an hour, two of which refute earlier drafts of this brief. Two emitters now ship as repo tooling — `scripts/tools/workflow-emit.ts` and `scripts/tools/executor-emit.ts`, each with a `guard-script-provenance` entry — their gate at `scripts/guards/guard-cell-authorship.ts`, and each declaration beside the cell it emits: the declaration is the source, the cell is the artifact. What remains beside this file in `docs/plans/2026-08-15-generated-authorship/` is the experiment that got there: `emit.ts` and `falsify.ts` for the executor probe, `workflow-falsify.ts`, the two executor `*.decl.json` probes, and `deno.json`.

**1. A cell's shape is a function of data, and the generated cell passes the real gates.** An executor cell emitted from a JSON declaration carrying no source text - `emitted-probe.executor.ts`, 577 bytes, deps `Context.Tag`, single operation export, `Effect.fn` wrapper, typed parameter list, import block, all derived - passed `pnpm --filter @systemfsoftware/omp-claude-compat lint` at exit 0 and `typecheck` at exit 0. Not argued: run.

**2. "Body module" was a reinvention of `kernel`, and the split already ships.** A first attempt wrote the body to `emitted-switch.body.ts` and the write hook rejected it immediately:

> `src/internal/emitted-switch.body.ts:1:1: error @systemfsoftware/effect-dmmf(cell-suffix-required): emitted-switch.body.ts is forbidden. Expected: <name>.<cell>.ts with <cell> one of acl, adapter, executor, handler, kernel, ...`

`cell-suffix-required` governs every file under `src/`, so a body module cannot exist as a non-cell. The correct home for a pure body is a `kernel` cell - and the repository already does exactly this, in 32+ measured executor-to-kernel edges across two packages (`run-post-tool-use-hooks.executor.ts` importing `hook-feedback.kernel.js` and `hook-payload.kernel.js`, and so on). An earlier draft's Definitions claimed a body module "carries no role suffix, so no shape rule governs the file". That is false and is corrected here.

**3. The disarming problem dissolves rather than needing a fix.** Three passes of this brief built machinery - glob extension, body inlining, helper inlining, transitive-closure inlining - so that body-interior walkers would keep firing. Bodies are kernel cells, and kernel cells already carry `kernel-no-throw`, `kernel-no-effect-runtime`, `kernel-no-ambient-impurity` and `kernel-no-junk-drawer-name`. The governance those passes tried to reconstruct was already in place. All of that machinery is withdrawn.

**4. Four of four executor shape violations cannot reach emitted output.** `falsify.ts` attempts each violation through the declaration:

| Rule                               | Violation attempted                                         | Verdict, and the emitter's verbatim refusal                                                                                                                     |
| ---------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `executor-deps-tag-name`           | name the tag something other than `<Operation>ExecutorDeps` | INEXPRESSIBLE - `depsTagName: derived, never declared. The deps tag name is EmittedProbeExecutorDeps and is computed from operation; remove the field.`         |
| `executor-owns-context-tag`        | point the tag at a tag in another module                    | INEXPRESSIBLE - `depsTagFrom: derived, never declared.`                                                                                                         |
| `executor-requires-deps-tag`       | emit an executor with no deps tag                           | INEXPRESSIBLE - `deps: expected { type: string }, got null. An executor always owns a deps tag; the field cannot be omitted or nulled.`                         |
| `executor-single-operation-export` | export two operations from one executor                     | INEXPRESSIBLE - `operation: expected one name as a string, got ["first","second"]. An executor exports exactly one operation, so the field cannot hold a list.` |

A first run of this probe returned two of the four as bare `TypeError` crashes, which stop a violation without ever stating what a declaration may contain - a refusal by accident rather than a language. That was fixed rather than reported: `parseExecutor` now validates the declaration and names every rejection, including refusing a field the emitter derives instead of silently ignoring it. `deno check` passes on both scripts.

**5. The workflow role is fully emitted, and the count is measured.** All three `*.workflow.ts` cells in the repository are now the emitter's output from JSON declarations carrying no TypeScript: `restart-decision.workflow.ts` (`effect-daemon-spec`), `hook-verdict.workflow.ts` (`omp-claude-compat`) and `survivors.workflow.ts` (`stryker-js-cli`). Round-trip is `emit → dprint fmt → git diff --exit-code` clean on all three, and each package's own `lint`, `typecheck`, `test` and `mutation` pass. The language needed seven constructs the first cell did not: nested struct field types, literal field types, imported constants, an exported TypeId, a named decision union with its schema, exported literal-union aliases, and a bound dispatch subject.

**The 18 shipped workflow rules, verdicted by attempting every violation through the declaration:**

| Verdict            | Count | What it means                                                                                                                                                                                             |
| ------------------ | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| INEXPRESSIBLE      | 13    | The declaration cannot express the violation; the emitter names a refusal rather than crashing.                                                                                                           |
| REACHABLE          | 3     | The emitted cell can carry the violation and the rule fires on it.                                                                                                                                        |
| OUTSIDE-POPULATION | 1     | `workflow-property-test-shape` governs `*.property.test.ts`, which the Definitions place outside the cell population.                                                                                     |
| SHIPPED-OFF        | 1     | `workflow-inline-schemas` is registered by `effect-workflow` without being recommended, so `effect-dmmf` never enables it - measured 18 registered / 17 recommended. It cannot fire in any package today. |

`workflow-match-exhaustive` moved from **undecidable** to **REACHABLE** during this pass, and not by extending the walker. The first emission of `survivors.workflow.ts` used `Match.when({ kind: 'admit' }, …)`, which left a _surviving mutant_: `ObjectLiteral` widens the pattern to `{}`, and by elimination the last arm before `Match.exhaustive` only ever sees the kind it names, so the mutant is equivalent and unkillable - score 95.83 against a break threshold of 100. Emitting `Match.tag` / `Match.discriminator` instead, whose tag is a _string_ argument with no object literal to widen, restored the gate to 100/0 and simultaneously made the closed tag set legible to the walker. A change made to satisfy a mutation gate strengthened a lint rule; neither was the goal of the other.

**6. The authorship gate exists, and the 13 deletions landed behind it.** `scripts/guards/guard-cell-authorship.ts` is the one presence check the brief permits: a cell with a declaration beside it must be that declaration's emission, byte for byte, and a role listed complete must have no hand-authored cell left. The two guarantees are separate on purpose — fidelity binds every declaration, completeness binds only a role in `COMPLETE_ROLES`, and only completeness licenses a deletion — so a partly-migrated role cannot borrow the finished one's authority. It is wired through `gate:tasks`, so `pnpm check:local` and `check:ci` both carry it, and CI needed no workflow change — `reusable-checks.yml` already installs Deno and runs `pnpm check:ci` as the one definition. Observed red before and green after on both failure kinds: a one-identifier edit reports `hand-edited since emission`, an undeclared cell reports `hand-authored workflow cell` with the declaration path to write.

The gate found two defects before it was even wired. The combinator change that killed the equivalent mutant in `survivors.workflow.ts` had treated _any_ single-key pattern as a discriminant, emitting `Match.discriminator('exitSuccess')('true', …)` — a string tag against a boolean field, which can never match — so `restart-decision.workflow.ts` had silently stopped reproducing from its declaration. Separately, `pnpm exec` prints a banner on stdout and `bin/dprint` execs from inside a `while read` loop, so the tool inherits the loop's stdin rather than the caller's; either would have been spliced into the emission being compared.

**With the gate in place all 13 were deleted**, each carrying its demonstration: `workflow-falsify.ts` attempts every violation through the declaration and reports the emitter's verbatim refusal for all thirteen, with **zero UNREACHED** — no violation slipped out of reach rather than out of existence. Two AST helpers went with them, having no consumer left. The three reachable survivors were re-verified firing on a real probe _after_ the deletion, so the plugin did not go vacuous.

**The count, measured.** The rule directories under `packages/oxlint-plugins/*/src/rules/` held **121 files: 113 rules and 8 helpers**. They now hold **106 files: 100 rules and 6 helpers**. The workflow plugin went from 18 rules to 5.

| Survivor                       | Class no stronger channel carries                                                                               |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `workflow-no-effect-import`    | an import edge the declaration names as data and the emitter writes unexamined                                  |
| `workflow-no-panic-vocabulary` | identifier vocabulary — the emitter cannot know `UnexpectedError` is panic vocabulary rather than a domain name |
| `workflow-match-exhaustive`    | decision-freedom over the emitted dispatch                                                                      |
| `workflow-property-test-shape` | governs `*.property.test.ts`, outside the cell population and hand-authored, so no declaration reaches it       |
| `workflow-inline-schemas`      | registered but not recommended; its class is reachable, so it is kept rather than deleted                       |

**Mutation improved, and the attribution is stated because the direction invites suspicion.** At HEAD the plugin scored 96.86 with 23 survivors and 10 uncovered mutants — a red gate — and every one of them sat inside `workflow-declaration-form.ts` and `exported-workflow-fn.ts`. Both are deleted here, and the package now scores 100 with zero survivors. Green by dropping a population is on this brief's own hunt list, so the licence is the gate and the thirteen demonstrations; the mutation result is a consequence, never the reason, and the survivors were proven to still fire precisely so the distinction is checkable.

**7. The executor role is the counterexample, and the number that shows it is 3 of 25.** The role was carried as far as it goes rather than argued about. `scripts/tools/executor-emit.ts` is the body language written out: guard, bind, effect and result steps over read, literal, call, invoke, yield, cond, object and thunk values, refusing anything else by name rather than accepting a `code` field. Three real cells are emitted from it and byte-identical after `dprint` — `run-session-switch-hooks` (a guard plus a delegated `yield*`), `run-tool-result-hooks` (a conditional yield bound to a typed const), `run-pre-compact-hooks` (an object whose spread is a call taking a thunk over a method chain) — with the package's lint, typecheck, 200 tests and mutation score all unchanged.

Then it stops, and the stopping point is measured rather than judged. Parsing all 25 executor cells counts **58 distinct AST node kinds**. The three emitted cells needed **21**, and those 21 reach **exactly 3 of the 25** — every remaining cell requires a node kind the language does not have. The 37 unmet kinds are not exotic: `ForOfStatement`, `AssignmentExpression`, `TryStatement`, `CatchClause`, `ThrowStatement`, `ContinueStatement`, `FunctionDeclaration`, `TemplateLiteral`, `RegExpLiteral`, `NewExpression`, `ObjectPattern`. The next cell up, `load-settings`, needs five including `ForOfStatement`, because its body accumulates into a mutable array inside a loop.

**The demonstration that the language must accept source text is definitional, not aesthetic.** Ten of the executor language's 34 keys already alias an AST node kind one-for-one — `read` is a member expression, `call` a call, `yield` a yield, `cond` a conditional, `object` an object, `spread` a spread, `thunk` an arrow, `bind` a declarator, `result` a return, `guard` an `if`. Covering the role means adding 37 more of the same, at which point the declaration is a TypeScript AST with the node names changed, and a declaration is defined here as carrying "no TypeScript statement, expression or function body". The workflow role's vocabulary contrasts exactly here: `command`, `decision`, `error`, `channel`, `dispatch`, `arms`, `fallback`, `variants`, `aliases`, `construct` name roles in the cell taxonomy, and not one of them is a node kind. That is the difference between describing a cell and transcribing it.

**One instrument reads against this conclusion and is recorded that way.** Emitted-over-declaration bytes come out at 0.66, 0.55 and 0.67 for the executor cells and aggregate 0.85 for the workflow role: every declaration here is _larger_ than the code it produces, and the brief calls a role approaching 1 an echo. Derived-per-key is worse still, favouring the executor language (0.79) over the workflow one (0.42). Both instruments are size-based and both are weak — the workflow declarations carry per-cell domain payload that inflates their key count, and JSON is more verbose per decision than TypeScript. What separates a declaration from a transcript is refusal, not size: an echo cannot reject a violation, and these two emitters reject thirteen classes by name with zero escapes.

**Scope of the claim.** Two roles, seven cells, 22 rules examined and 13 deleted. The workflow role is complete; the executor role is 3 of 25 and stopped on measurement. The remaining 87 rules and 10 roles are unexamined.

## What the corpus already settled, and where this brief departs

The software wiki was consulted before this pass and it had already adjudicated the central question. Read at its declared warrant bands, not its headlines:

- **`cell-compiler.md`** - `type: decision`, `status: stable`, `warrant: posit`. Ruling: cell assignment and file birth belong to a machine scaffold, never to the model; lint is demoted to a small AST residue on top of type and module-resolution enforcement. Its enforcement ladder, strongest first: **module resolution**, **the type system**, **import-DAG lint over a manifest**, **AST residue - "the ~dozen rules that genuinely need custom static analysis, not 118."**
- **`enforceability-is-not-an-axis.md`** - `warrant: posit`. A suffix-keyed rule naming an _edge_ constraint inherits the edge's near-zero false-positive rate; one naming an _interior_ property inherits the interior's much worse rate. It classifies `kernel-no-throw`, `kernel-no-effect-runtime`, `kernel-no-ambient-impurity` and `observer-no-escaping-state` as interior, and records that `observer-no-escaping-state` "misses the same state one indirection away behind a wrapper call - an interior rule failing at exactly the boundary the analysis predicts, the first indirection."
- **`axis-mechanizability-verdict.md`** - `warrant: posit`, `status: draft`. In unannotated TypeScript the purity predicate "is not mechanically decidable at enforcement grade at all"; three of four kernel rules key on the general form of purity, and under this verdict "those rules are documentation wearing a gate's clothes." The axes that would carry enforcement - import direction and export surface - are the ones no suffix keys on.
- **`window-mediated-versus-emission-gated.md`** - `warrant: derived`, grounded in captured canon papers. A consumer type checker is window-mediated, not a gate: it returns a diagnostic and an exit code, and "the file, the commit, and the emission stand." It becomes gate-class only when a harness refuses until the check passes.

Three of these four are `posit`, so none of them binds as law and this brief is not entitled to cite them as warrant. What they are is a prior derivation, and under the repository's own rule a derivation stands until it is defeated by argument. It was not defeated; it was corroborated. This brief's earlier passes engineered an elaborate mechanism to keep the existing body-interior walkers firing on generated output, and two successive review passes found two successive escapes from it - a helper arriving as an import, then a helper called only by another helper. Those are the first and second indirection, which is exactly the failure `enforceability-is-not-an-axis` predicts for interior rules as a class. The mechanism was chasing indirections down a channel the corpus ranks last.

**The departure recorded.** An earlier pass of this brief sealed "bodies must remain governed; free is not exempt", and instrumented it first by glob extension and then by inlining bodies and their helpers into the emitted cell so the walkers would still fire. That seal is reopened here, which this brief's own rule permits only for a materially different mechanism - and module resolution plus the type system is exactly that. The refinement: a body is governed by the channel that can actually decide its class. Where a type can carry the obligation, the type carries it. Where nothing can decide it in unannotated TypeScript, the rule is documentation and is not preserved as a gate. Arming an undecidable rule is not governance.

`window-mediated-versus-emission-gated` carries the one qualification that survives at `derived` band: `tsc` failing is not by itself a gate. It becomes one here because `pnpm check:local` and CI block on it, and that blocking is named in Verification rather than assumed.

## The mechanism

121 rule files across 21 plugins under `packages/oxlint-plugins/*/src/rules/` exist because a cell is a file a human types, so every constraint on it is re-derived after the fact by a walker reading the finished text. The walker count is a function of authorship, not of architecture: each new property of a cell buys another walker, its config, its fixtures, its registration, its coverage entry and its leaf-doc block.

Emission moves each constraint to the strongest channel that can carry it.

1. **Module resolution - already saturated here, and permanently unable to reach a role edge.** The corpus ranks resolution strongest, and it is genuinely load-bearing upstream: across the vendored trees, `repos/effect` fences `"./internal/*": null` on **36 of its 36 packages carrying an `exports` map**, and `repos/cruster` on 23 of 25. Measured against this repository, two facts settle rung 1 and neither leaves a decision open.

   **It is already used, in a stronger form than Effect's.** Effect must fence because it exports a `"./*"` wildcard; every publishable package here instead enumerates its public subpaths, so nothing needs fencing. `omp/plugins/omp-claude-compat` exports exactly `.` and `./package.json`, and of the 4 packages carrying a `src/internal/` directory, **0 leak it** - no wildcard, no reachable internal. An earlier draft of this brief inferred from "0 of 51 packages uses a `null` fence" that "no resolution enforcement operates here today". That inference was wrong: deny-by-default enumeration _is_ resolution enforcement, and reading absence of one spelling as absence of the mechanism is the same error this brief keeps catching elsewhere.

   **It cannot reach a role edge, and no package layout changes that.** Measured across the 174 cells: **288 role-to-role imports, every one relative (`./dispatch-doctrine.kernel.js`), zero package-qualified.** Node's resolver bypasses the `exports` map for a relative specifier by design, so an executor and the kernel it imports are siblings no fence can separate. The only layout that would make role edges resolution-visible is one package per cell - 174 packages, each edge a version-managed dependency - which fails on its own terms. Rung 1 is therefore saturated, not empty, and role edges belong at rung 3 permanently rather than provisionally. That makes `cell-import-boundary` the correct permanent home for edge constraints, not a stopgap, and it removes "split the packages" from this brief's prize: the prize comes from emission plus rung 2.
2. **The type system.** The constructors the emission calls carry the obligations: `Workflow.make` already refuses an uninhabited or untagged channel at the call, witnessed by `TS2345` with no suppression where the same code compiled at exit 0 before. A declaration that would produce a violating cell fails to type-check.
3. **Import-DAG lint over the manifest.** The edge constraints a resolver cannot express - role-to-role edges within a resolvable graph - stay in lint, where `enforceability-is-not-an-axis` puts them at near-zero false-positive rate because they read an edge rather than an interior.
4. **AST residue.** What genuinely needs custom static analysis and cannot ride 1-3: call-shape, identifier vocabulary, decision-freedom. A residue, not a fleet.

Bodies are hand-authored pure functions in `kernel` cells the emitted cell imports normally - the split the repository already ships. Nothing needs to walk from an executor into its kernel, because the kernel is itself a governed cell carrying its own purity rules. This is what dissolves three passes of accumulated machinery: inlining, helper inlining, transitive-closure inlining, the inert form and the twice-placement demonstration all existed to reconstruct governance that the taxonomy already provides.

## Alternatives weighed

| Approach                                                         | Enforces via                                                                                                                                                                       | Leaves                                                                                                           | Rule cost                                               |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| **Constrain the import path** (`cell-import-boundary`, shipping) | rung 3 lint over `CELL_IMPORT_TABLE`: forbidden role-to-role edges, `forbidValue` on `.adapter` outside an `internal` segment, node builtins where an edge carries `forbidRuntime` | cardinality, absence, declaration form, signatures                                                               | adds one walker; deletes none                           |
| **Types alone**                                                  | rung 2 at constructor calls                                                                                                                                                        | every violation reachable without calling a constructor                                                          | deletes none                                            |
| **Emit bodies too**                                              | nothing - the declaration must carry source text, which makes it an echo                                                                                                           | -                                                                                                                | void by construction                                    |
| **Emit shape, arm the walkers over bodies**                      | rung 4, the weakest channel                                                                                                                                                        | interior classes that fail at the first indirection, twice demonstrated in this brief's own review               | deletes shape rules; grows the residue it should shrink |
| **Emit shape, move constraints down the ladder**                 | rungs 1-2 first, 3 for edges, 4 as residue                                                                                                                                         | interior predicates that are undecidable in unannotated TypeScript, now named as documentation rather than gated | collapses the fleet toward the residue                  |

Import-path constraint is the strongest rival and loses on scope, not on soundness: it is a correct rung-3 mechanism that reaches an edge and nothing else - no cardinality, no absence, no declaration form. It is not a deletion candidate; it is the rung-3 survivor this brief expects to keep.

Arming the walkers is the approach this brief held for three passes and now rejects. It is kept in the table because the rejection is the finding.

## The size of the prize, and how much of it is measured

A regex classifier over the 121 rule sources partitions them 109 shape / 6 body / 6 unclassified. That number is an **overcount and is not load-bearing**: it keys on AST node-type names appearing in source rather than on semantics, and it misfiles rules that plainly police bodies - `no-io-in-phase-bodies` scored 7 shape hits and 0 body hits while policing exactly what its name says.

`cell-compiler` names a residue of "~a dozen" against 118. That figure is `posit`-band, drawn from a single generated report, and this brief does not adopt it as a target: a stated target invites the count being met by reclassification. The measured survivor set is whatever the per-rule demonstrations leave standing, reported against 121 at return.

## Definitions

- **Cell** - a production source file the taxonomy governs: `src/**/*.<role>.ts` for a sanctioned role. Tests, fixtures and `__tests__/` are outside the population and stay hand-authored.
- **Shape** - everything about a cell except the interiors of its function bodies: import edges, export surface and cardinality, declaration form, type signatures, tags, layers, phase composition, filename and directory.
- **Declaration** - the generator's input: one cell's shape, as data only. Names, type references, phase lists, role, dependency identifiers, and a reference to the kernel export that supplies the body. No TypeScript statement, expression or function body, and no field whose value is source text. A `body`, `code` or `raw` field carrying source makes it an echo regardless of size.
- **Kernel cell** - where a hand-authored pure body lives. It is a cell, not an exempt file: `cell-suffix-required` forbids any non-cell file under `src/`, measured this session against a rejected `*.body.ts`. Its logic is free of the shape rules and governed by the kernel purity rules it already carries.
- **Channel** - the mechanism that decides a violation: module resolution, the type system, import-DAG lint, or AST analysis, in that order of strength. A constraint rides the strongest channel that can decide it.
- **Undecidable here** - a predicate no channel can decide at enforcement grade in unannotated TypeScript. Purity in the general form is the corpus's named case. A rule over an undecidable predicate is documentation; it may be kept as a lint _suggestion_ but never counted as a gate, and it is not a survivor for the purposes of this brief.
- **Unreachable** - the licence to delete: the violation cannot be expressed in the declaration, or when expressed the emitted code fails to resolve or fails `tsc`. Distinct from **forbidden**, a walker reporting it after the fact, and from **unreached**, a violation still expressible that no rule's predicate matches. Unreached is a regression, not a licence.
- **Compiler witness** - a verbatim `tsc` code and message from code carrying no `@ts-expect-error`, `as any`, `as unknown as` or `@ts-ignore`. A suppressed error is not an error. Per `window-mediated-versus-emission-gated`, a witness is gate-class only because `check:local` and CI block on it.
- **Resolution witness** - a verbatim module-resolution failure from the emitted graph, with the `exports` map or path fence that produced it.
- **Authorship gate** - the one presence check permitted to survive, because no type can decide "this file was generated": a CI check that every cell is byte-identical to its emission. Exactly one, and this is its only name.
- **Deleted** - rule file, config, fixtures, plugin registration, `check:lint-coverage` population entry and leaf-doc block all gone. No alias, no `recommended: off` tombstone, no commented-out block.
- **Emitted** - the file's bytes are the generator's output for its declaration. Verified by round-trip: regenerate every cell, `git diff --exit-code` clean.
- **Measured non-echo** - per role, emitted bytes over declaration bytes, reported not gated, because a threshold invites padding the emission. A role approaching 1 is an echo and its deletions are void.

## Task

1. A declaration language for cell shape exists, carrying no source text, and an emitter turns a declaration into a cell file.
2. Every cell is emitted; none is hand-authored; round-trip regeneration leaves the tree clean, enforced in CI by the authorship gate.
3. Body logic lives in `kernel` cells the emitted cell imports, behaviour unchanged. No new file class is introduced, because `cell-suffix-required` forbids one.
4. ~~Resolve the rung-1 fork.~~ **Resolved by measurement, not left to the run.** Rung 1 is saturated: every publishable package enumerates its public subpaths, 0 of the 4 packages with a `src/internal/` leak it, and `repos/effect` needs `"./internal/*": null` on 36/36 only because it wildcards `"./*"`. Rung 1 also cannot reach a role edge at any layout, because all 288 role-to-role imports are relative and Node's resolver bypasses the `exports` map for relative specifiers. No package split is in scope, and any diff proposing one to "enable rung 1" is rejected by this task. Role edges are rung 3 permanently.
5. For each constraint the current fleet enforces, the strongest channel that can decide it is identified and the constraint moved there: a resolution fence, a constructor obligation, a manifest edge rule, or - only when the stronger rungs cannot decide it - retained AST analysis. Each move carries its witness: a resolution failure, a compiler witness, or a rule firing on an edge.
6. Each constraint no channel can decide at enforcement grade is named **undecidable here**, with the corpus page and the reason, and its rule is dropped as a gate rather than preserved by making the walker reach further.
7. Every rule whose class is now unreachable or undecidable is deleted, each with its demonstration. Every survivor is attributed to a class no stronger channel can carry.
8. The before-and-after count is measured and stated: 121 and the survivor set.

## Expected survivors

- Rung-3 edge rules over the manifest, including `cell-import-boundary`, whose class a resolver cannot fully express.
- Rules genuinely needing custom AST analysis - call-shape, identifier vocabulary, decision-freedom.
- Rules governing files outside the cell population: entrypoints, barrels, config modules, scripts.
- Rules about cast escape hatches, which bind wherever a cast can be written.
- The authorship gate.

Interior purity rules are **not** on this list. They are either carried by a phase's type or named undecidable; preserving them as gates is the outcome this brief exists to end.

## Does not count

- **Arming a rung-4 walker** - extending a glob, teaching a walker to resolve imports, inlining bodies or helpers so an AST rule can reach them, or any other work whose purpose is to make the weakest channel reach further. This is the specific failure two passes of this brief committed.
- Preserving an interior purity rule as a gate rather than naming it undecidable and dropping it.
- A generator that emits a scaffold an author then fills in. That is a template; shape stays authored and nothing may be deleted.
- An echo: a declaration carrying source text, a ratio approaching 1, or an emission that copies the file already on disk.
- Emitting bodies, or admitting a source-text field to cover a hard role.
- Deleting a rule because its violation moved out of reach rather than out of existence. Unreached is not unreachable.
- Adding the generator while keeping the fleet. Net addition, zero deletion.
- One role or one package migrated as a proof of concept, or shrinking the cell population so hard roles fall outside it.
- Asserting a class is unreachable without attempting the violation through the declaration.
- Meeting the corpus's "~a dozen" figure by reclassification rather than by demonstration, or treating that `posit`-band figure as a target at all.
- More than one presence gate, or an authorship gate not wired into the check chain and CI.
- Treating a `tsc` diagnostic as a gate where nothing blocks on it.
- A document as the deliverable: no paper, spec, plan, ledger, survey, migration guide or explainer. The tree is the deliverable, and this brief is not part of it.
- Green reached by deleting fixtures, lowering severity, narrowing a glob, or dropping a package from a gate's population.
- Counting rules deleted or files touched in place of classes moved or made unreachable, or citing the 109/6/6 partition as a result.
- Citing this repository as warrant, or citing a `posit`-band wiki page as law.

## Auditor hunt list

- Any diff that makes an AST walker reach further - a widened glob, an import resolver, an inlining step - which is rung-4 arming wearing a repair's clothes.
- An interior purity rule kept as a gate with no channel argument, or reclassified as "residue" without one.
- A constraint left at rung 4 that a resolution fence or a constructor could have carried, with no reason given.
- A package split proposed to "enable rung 1" for role edges, which Task 4 has already rejected on measurement: relative specifiers bypass the `exports` map at every layout.
- An inference from the absence of one spelling of a mechanism to the absence of the mechanism - the error that produced this brief's false "no resolution enforcement operates here today".
- A resolution fence asserted without a verbatim resolution failure, or a compiler witness taken in a tsconfig-excluded file or under a suppression.
- A `tsc` diagnostic presented as a gate where no chain blocks on it.
- A declaration carrying source text in any field, or a role whose emitted-to-declaration ratio approaches 1.
- Round-trip clean only because the generator echoes the file; a generated file that drifts on regeneration.
- A pure body placed in a non-cell file, which `cell-suffix-required` rejects, or a kernel cell carrying shape a cell rule would have governed - exports, tags, layers - rather than pure functions.
- A deleted rule whose class is reachable from a test, a fixture, or a kernel cell's import surface.
- The authorship gate absent from CI, or a second presence gate quietly added.
- The "~a dozen" residue figure treated as a target, or the 109/6/6 partition quoted as measured fact.
- A `posit`-band page cited as law, or a `derived` page's qualification dropped.
- Unanimous agent agreement treated as corroboration.
- A cost claim with no before-and-after count.
- Green by deletion of the test rather than of the thing; a cell quietly reclassified out of the population.
- A counterexample naming no declaration language, which is abandonment wearing a result's clothes.

## Sealed decisions and the open surface

Adversarial review has no natural stopping point. Without a stopping rule the same ground is relitigated until the reviewers tire rather than until the argument closes, and each repair opens a fresh surface - six passes here, each finding a real defect in the previous pass's repair, until the corpus showed the repairs were descending the wrong ladder.

**How a decision seals.** A decision enters at the pass that yields it. Each subsequent pass may challenge it. A decision surviving three passes is sealed: cited and built on, never reopened. A sealed decision reopens only for a materially different mechanism - never a fresh argument over ground already given, never an auditor's preference.

**The asymmetry is deliberate.** The seal covers decisions conceded and facts measured, not the claims this brief asserts. Every claim stays challengeable: the predicate, the ladder assignment, the survivor set, the prize.

**Sealed:**

| Decision                                                                        | Sealed at | Basis                                                             |
| ------------------------------------------------------------------------------- | --------- | ----------------------------------------------------------------- |
| Shape is emitted; body logic is hand-authored                                   | pass 4    | survived passes 2-6                                               |
| Bodies are never emitted - source text in a declaration is an echo              | pass 4    | void by construction                                              |
| The declaration is data: no statement, expression, body or source-text field    | pass 4    | the non-echo instrument                                           |
| `effect-cell-gen` is an `fc.Arbitrary`, not an emitter; this work is greenfield | pass 4    | measured in tree                                                  |
| Glob extension cannot arm a body-interior rule                                  | pass 4    | measured in tree, refutation-tested                               |
| Interior rules fail at the first indirection; arming them is void               | pass 6    | corpus prediction, corroborated twice by this brief's own reviews |

**Reopened at pass 6.** "Bodies must remain governed; free is not exempt", sealed at pass 4, is reopened under the materially-different-mechanism clause: governance moves to module resolution and the type system, and an undecidable predicate is named rather than gated.

**Open:** the ladder assignment for each individual constraint; the declaration language's shape; the survivor set; every claim about the size of the prize.

A pass returning findings only against sealed decisions has found nothing, and the brief ships.

## Orchestration

Heuristics, not quotas. Register approach families by channel - resolution fence, constructor obligation, manifest edge rule, retained AST analysis - never by plugin name. Keep early workers blind to the favoured declaration shape. Mark a mechanism blocked when it can only own a role by accepting source text, and reopen only for a materially different construct. Cross-pollinate late. Every dispatch carries objective, output shape, tool guidance and boundaries. Every verification is re-run by the orchestrator; a worker's report is never evidence, and unanimity among workers is a diversity failure to investigate. Auditors receive the hunt list and the corpus pages with their warrant bands, never a generic quality instruction.

## Verification

- Round-trip: regenerate all cells, `git diff --exit-code` clean.
- Declaration instruments: no source-text field in the schema; emitted-to-declaration ratio reported per role.
- Per constraint moved: the witness for its new channel - a verbatim resolution failure, or a compiler witness with no suppression, or the edge rule firing.
- Per constraint named undecidable: the corpus page, its warrant band, and the reason no channel decides it.
- Per rule deleted: the demonstration that its class is unreachable or undecidable, plus a reopened-defect check.
- No diff widens a glob, adds import resolution to a walker, or inlines content to feed one.
- Behaviour preservation: each package's existing tests pass unchanged.
- `pnpm check:local` exits 0, run after the last edit, and the chain blocks on `tsc` - which is what makes a compiler witness gate-class.
- Mutation verdict unchanged or better on every package the diff touches.

## Return condition

A predicate over the tree, satisfied by either terminal state.

**Ownership.** Every cell emitted and round-trip clean in CI; every constraint at the strongest channel that can decide it, with its witness; every undecidable predicate named with its corpus page and dropped as a gate; every deletion carrying its demonstration; every survivor attributed to a class no stronger channel carries; the authorship gate wired into the check chain; the before-and-after count measured and stated against 121; `pnpm check:local` green; mutation not worse; delivered as a pull request watched to green.

**Counterexample.** For a role whose shape cannot be emitted: the declaration language its shape would require, written out, and the demonstration that the language must accept source text to cover the role's real cells. A returnable artifact; its rules stay, listed as survivors. A role parked without that written language is skipped, and skipping is not a discharge.

Do not return a plan, a partial migration, a proof of concept, or a prose explanation of difficulty naming no declaration language.

## Effort

Assume the roles carrying real cells today have emittable shape until a counterexample shows otherwise. Do not stop at the first role, and do not treat the first hard role as the counterexample without writing its language out.

## Contamination and authority

The software wiki is the first oracle and binds only to its declared warrant band. This brief's four load-bearing pages are `cell-compiler` (`posit`), `enforceability-is-not-an-axis` (`posit`), `axis-mechanizability-verdict` (`posit`, `draft`) and `window-mediated-versus-emission-gated` (`derived`). None of the three posits is law; they are prior derivations this brief follows because they were corroborated rather than defeated, and where a per-rule demonstration contradicts one, the demonstration wins and the departure is recorded. `repos/` and `.repos/` are read-only grounding for how upstream generates and constrains code; a census over them is inadmissible as practice evidence unless the sample is registry-enumerated. Never this repo as warrant.

Everything else is in scope to rewrite or delete: packages, plugins, rules, configs, gates, guards, hooks, tsconfigs, package layouts, every leaf `AGENTS.md` and `CONCEPTS.md`. Merge to `main`, publish, deploy, destructive operations and credentials stay human. Hard time and token budgets live in the harness, not in this brief.
