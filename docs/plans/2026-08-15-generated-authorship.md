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

Seven review passes produced no evidence. A working emitter produced four results in under an hour, two of which refute earlier drafts of this brief. Artifacts: `scripts/cell-emit/emit.ts` (emitter), `scripts/cell-emit/falsify.ts` (violation prober), `scripts/cell-emit/*.decl.json` (declarations).

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

**Scope of the claim.** One role, one cell, four rules. Nothing here licenses deleting anything yet; it establishes that the mechanism is real and that the measurement loop is cheap. The remaining 117 rules and 12 roles are unexamined.

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

1. **Module resolution - measured at zero reach in this layout, and the fork that follows.** The corpus ranks resolution strongest, and the mechanism is real upstream: `repos/effect/packages/effect/package.json` ships `"./internal/*": null`, a genuine path fence read this session. It does not transfer to a role edge here. An `exports` map governs what an _external consumer_ may import; it cannot see a sibling. Measured across the 174 cells in this repository: **288 role-to-role imports, every one of them relative (`./dispatch-doctrine.kernel.js`), and zero package-qualified** - so an `exports` map reaches 0.0% of the role edges that exist. Separately, **0 of 51 packages carrying an `exports` map uses a `null` fence**, so no resolution enforcement operates here today.

   The consequence is a fork, not a detail, and Task 4 must resolve it explicitly rather than assume rung 1: **a role boundary that is not a package boundary cannot be resolution-enforced.** Either role groups become packages, which converts 288 lint-enforced edges into resolution-enforced ones and is the largest prize available here, or rung 1 stays empty and those edges remain at rung 3 for good reason. Both are admissible outcomes; asserting rung 1 without splitting packages is not.
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
4. The rung-1 fork is resolved by decision, with its evidence: either role groups become packages so their edges are package-qualified and an `exports` fence decides them, or rung 1 is declared empty for this layout and the 288 relative role edges stay at rung 3. Whichever is chosen, the choice is stated with the count of edges it moves. A brief that claims resolution enforcement while every role edge remains relative has not resolved this.
5. For each constraint the current fleet enforces, the strongest channel that can decide it is identified and the constraint moved there: a resolution fence, a constructor obligation, a manifest edge rule, or - only when the stronger rungs cannot decide it - retained AST analysis. Each move carries its witness: a resolution failure, a compiler witness, or a rule firing on an edge.
6. Each constraint no channel can decide at enforcement grade is named **undecidable here**, with the corpus page and the reason, and its rule is dropped as a gate rather than preserved by making the walker reach further.
7. Every rule whose class is now unreachable or undecidable is deleted, each with its demonstration. Every survivor is attributed to a class no stronger channel can carry.
8. The before-and-after count is measured and stated: 121 and the survivor set, alongside the rung-1 edge count from Task 4.

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
