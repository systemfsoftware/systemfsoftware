---
"@systemfsoftware/effect-cell-types": major
---

Ship cell contracts as type-level constructors under namespace exports.

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
