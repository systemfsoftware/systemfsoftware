## 2.0.0

### Major Changes

- Ship cell contracts as type-level constructors under namespace exports.

  `Workflow.make` replaces the hand-written `Workflow<C, D, E>` annotation: it infers the decision and
  error channels from its argument and derives the `UninhabitedDecision` / `UninhabitedError` markers, so
  a total decision becomes uncallable rather than merely unannotated. `Policy` ships as a bare
  `A`/`E`-preserving combinator type, which declines a `make` because a constructor would be the identity
  function on the type — it forces nothing the type does not already carry.

  Breaking, and deliberately not softened per `REPO-R1`:

  - The barrel now uses namespace exports (`export * as Workflow`, `export * as Policy`) following the
    Effect convention, so consumers write `Workflow.Workflow<C, D, E>` and `Workflow.make`.
  - `src/workflow.kernel.ts` and `src/workflow-contract.kernel.ts` are gone, replaced by `src/Workflow.ts`
    under the one-concept-per-file PascalCase convention this package publishes into.
  - The four exported contract aliases — `InhabitedWorkflowIsCallable`,
    `DecisionUnionSurvivesDistribution`, `NeverDecisionIsRejected`, `NeverErrorIsRejected` — leave the
    public surface. They were type-level test assertions exported only because the package had no test
    file; they now live in `test-types/Workflow.tst.ts` where they belong.
  - The package stops being type-only and emits a runtime entry, so `README.md`'s claim that it "emits no
    runtime values" is corrected and consumers gain a real module.

  A `Schema` cell constructor was prototyped and withdrawn: its brand recorded only that `make` had been
  called — provenance, not a proposition — and every rejection it produced came from the parameter type
  alone, so `const s: S.Schema<A, I> = …` rejects identically. `S.Schema` is already the composer.

- The Cell description becomes an ordered sequence of phase records (name, kind, convention, run) under a description root carrying the package module name and the I/O-cell classification, so consumers fold the value to recover the whole vocabulary instead of re-declaring it.

  **Migration.** A description built with the public constructors needs no change — `Cell.read(...) -> Cell.decode(...) -> ... -> Cell.write(...)` and `Cell.apply` behave exactly as before. Two things break:

  - `Layer<P>` was a record of optional name-keyed slots (`layer.read`, `layer.decode`, …) and is now `{ phases: ReadonlyArray<Phase<P>> }`. Code reading a slot by name reads `layer.phases.find((phase) => phase.name === 'read')` instead, or folds the array.
  - A hand-built layer object, legal under the old optional-slot type, no longer type-checks. Build it with the constructors; they are what write the stage brands the interpreter reads.

  `Cell.apply`'s runtime contract narrowed with the shape: it executes the phases in the order the value declares and requires a write phase closing each layer, where before it ran a fixed five-phase sequence and died on an unfilled slot. Constructor-built descriptions cannot tell the difference — the chain only type-checks in canonical order.

- The Workflow brand: `make` is the only door to a decide slot.

  `Workflow<C, D, E>` and `Cell.DecidePhase<P>` carry a phantom `WorkflowBrand` conjunct applied
  solely by `Workflow.make` through the existing assertion narrowing — no runtime property, `make`
  stays the identity it always was. The consumer's signature is the forcing function: a bare
  function handed where a decide run is demanded is now a compile error naming the brand, so a
  decision cannot reach production without passing through the constructor every gate keys on.

  Breaking by design (`REPO-R1`): the two inline adapter sites (cli's admission adapter,
  claude-compat's submit-hook adapter) become `make`-wrapped, and the cell-gen either-pass
  fixture reshapes to one exhaustive path with the failure injection decided before the boundary.

- `Workflow.make` refuses an uninhabited or untagged channel at the call. Previously `Workflow<C, D, never>` resolved to a marker interface with no call signature, so the mistake surfaced only where something called the workflow — and a workflow nothing calls yet compiled clean at exit 0. The markers now ride an intersection on the parameter function's return type, `decide: (command: C) => Either<D, E> & Inhabited<D, E>`, where `D` and `E` still infer from the `Either` conjunct while the marker conjunct is what an uninhabited channel fails to satisfy. The diagnostic lands on the `Workflow.make` call and names the marker whose property type spells the fix.

  Three new exports: `Inhabited`, `UntaggedError` and `Tagged`.

  **Migration.** A workflow whose channels are both inhabited and whose error carries a `_tag` needs no change — `Inhabited` resolves to `unknown` and the intersection collapses to the plain `Either`. Three shapes now fail at the constructor instead of at the caller:

  - `Either<D, never>` — the workflow cannot fail, so it decides nothing. Give it an error variant, or move it to a `*.kernel.ts`.
  - `Either<never, E>` — the workflow can never succeed. Give it a decision variant it can return.
  - `Either<D, Error>` — a bare `Error` carries no `_tag` to dispatch on. Declare the error as an `S.TaggedError`.

### Minor Changes

- Publish the description's vocabulary as part of the package's own surface: `Cell.vocabulary` (the phase names, kinds, conventions and intra-layer order, folded from the canonical description at module load), `Cell.canonical`, `Cell.DESCRIPTION_MODULE`, `Cell.IO_CELLS` and the `Cell.IoCellClassification` type derived from it.

  This is what lets a consumer recover every axis by walking a value instead of restating it beside one. The classification type is `typeof IO_CELLS` rather than a hand-written twin, so a reclassified cell cannot drift between the two.

  Generators, lint rules and type-level observers built on this walk live in their own packages and depend on this one; nothing in this package depends on them.

- Add `Cell` — an I/O sandwich whose phase order is carried by types.

  `Cell.Phases` names the five stages of one sandwich, and each chaining constructor returns a type carrying the required member the next constructor's parameter demands, so a wrong order omits that member and fails to compile. The diagnostic is the instruction: the member's name is a sentence, so composing `decode` before `read` reports `Property 'call read(command) before decode(raw)' is missing in type 'DecideDone<Bag>' but required in type 'ReadDone<Bag>'`.

  The stages are siblings rather than a hierarchy. Under a hierarchy a later stage is assignable to an earlier stage's parameter and an inversion still compiles; as siblings, every inversion is a missing member. The constructors are dual, data-last overload first, so a description reads in the order it runs when written in `pipe`.

  Both kinds of `Left` are carried by the phase types rather than chosen by the interpreter. A `decode` `Left` is fatal — nothing consumes it, so its only route is the derived error channel and no write runs. A `decide` `Left` is an outcome: `EncodePhase` receives the whole `Either`, so it cannot be unwrapped and both branches reach the write.

  `Cell.apply` is the interpreter — the one place a description becomes effects. It folds the phases in declared order and derives the error channel from the phases it was handed.

- cut over to effect v4 (4.0.0-rc.108): public surface derives from effect types; peers flip effect ^3→^4

- Add the Wire alphabet: a declaration is built from members this workspace mints, so a foreign type
  named in a wire declaration is a compile error at the authoring site rather than a lint finding
  somewhere else. Marking sits on the schema, not the decoded value, and every combinator takes marked
  inputs and returns marked outputs, so a workspace-local alias of a vendor type confers no mark and is
  refused too. The alphabet covers primitives, literals, `nullOr`, `undefinedOr`, `nullishOr`, `array`,
  `optional`, `record`, `union`, `tuple`, `suspend` and `refine`, which is wide enough that a real
  payload does not have to escape it to be expressed. `transform` and `compose` are deliberately
  absent, being the laundering hop the alphabet exists to refuse.

  What this does not do: the mark is a phantom, and TypeScript has no nominal types, so any value
  legitimately carrying it can donate it to another type by intersection — `Object.assign` over a
  marked primitive is enough, and writing the intersection out is enough. Five such routes are pinned
  by type tests as accepted. The alphabet therefore refuses the accidental case and makes no claim to
  be an enumerable set of doors; deciding admissibility belongs to a checker that resolves where a
  member's type was declared.

### Patch Changes

- Array types are spelled one way. `Array<T>` and `ReadonlyArray<T>` in emitted
  declarations become `T[]` and `readonly T[]`, which the type checker cannot tell
  apart: no exported type changes, only how it is written.

- New version is published through npm trusted publishing, so it carries a provenance attestation you can verify.
