---
"@systemfsoftware/effect-cell-types": major
---

`Workflow.make` refuses an uninhabited or untagged channel at the call. Previously `Workflow<C, D, never>` resolved to a marker interface with no call signature, so the mistake surfaced only where something called the workflow — and a workflow nothing calls yet compiled clean at exit 0. The markers now ride an intersection on the parameter function's return type, `decide: (command: C) => Either<D, E> & Inhabited<D, E>`, where `D` and `E` still infer from the `Either` conjunct while the marker conjunct is what an uninhabited channel fails to satisfy. The diagnostic lands on the `Workflow.make` call and names the marker whose property type spells the fix.

Three new exports: `Inhabited`, `UntaggedError` and `Tagged`.

**Migration.** A workflow whose channels are both inhabited and whose error carries a `_tag` needs no change — `Inhabited` resolves to `unknown` and the intersection collapses to the plain `Either`. Three shapes now fail at the constructor instead of at the caller:

- `Either<D, never>` — the workflow cannot fail, so it decides nothing. Give it an error variant, or move it to a `*.kernel.ts`.
- `Either<never, E>` — the workflow can never succeed. Give it a decision variant it can return.
- `Either<D, Error>` — a bare `Error` carries no `_tag` to dispatch on. Declare the error as an `S.TaggedError`.

`workflow-either-inhabited` stays: two of its defect classes are outside what a type can reach — a fieldless tagged decision class, and a class that is structurally tagged without nominally extending `S.TaggedError`.
