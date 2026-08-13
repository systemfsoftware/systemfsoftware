---
title: A cell earns a constructor only by computing what the author cannot write
date: 2026-08-13
category: architecture-patterns
module: effect-cell-types
problem_type: architecture_pattern
component: tooling
severity: medium
applies_when:
  - deciding whether a cell suffix earns a type-level constructor
  - a type-level constructor and a suffix-keyed lint rule appear to enforce the same property
  - a proposal to retire lint rules on the grounds that a type now covers them
  - encoding an ordering constraint such as the I/O sandwich at the type level
tags:
  - effect-ts
  - cell-taxonomy
  - type-level-enforcement
  - oxlint
  - smart-constructor
  - indexed-monad
  - enforcement-channel
---

# A cell earns a constructor only by computing what the author cannot write

## Context

The repo enforces a thirteen-suffix cell taxonomy — `acl, adapter, executor, handler, kernel, middleware, observer, policy, schema, shape, state, store, workflow` — through roughly 111 depth-0 lint rules across 20 plugins. A cell's contract is a pile of rules, each one a proxy for a property the suffix names. The question this work answered was whether type-level constructors could replace the rules, one per cell: give each suffix a `make` whose parameter type rejects what the rules reject, and retire the rules it subsumes.

That premise did not survive contact. Constructing a cell is governed by a rule that retires almost nothing, and the two cells that earn a constructor — `workflow` and `policy` — ship only what a type can actually force. What follows is the earning rule, what shipped and what deliberately did not, why the type and the rule are complementary rather than substitutes, and the decision procedure for the next proposed constructor.

## Guidance

A cell earns a type-level constructor **iff** its content is a pure value or a combinator **and** Effect does not already supply the composer. That decides all thirteen rows before any file is read: `workflow` yes (Effect has no decision type), `policy` yes as a bare type (Effect has no `A`/`E`-preserving combinator type, but a `make` would be the identity function on it, so none is shipped), `schema` and `acl` no (`S.Schema` / `S.transformOrFail` are already the composers), and the shells no. Two cells of thirteen carry a type-level contract, and exactly one constructor ships — derived rather than counted.

What shipped — `Workflow.make`, whose real compiled signature is at `packages/effect-cell-types/src/Workflow.ts:30`:

```ts
export const make = <C, D, E>(decide: (command: C) => Either<D, E>): Workflow<C, D, E> => {
  assertWorkflow(decide)
  return decide
}
```

The runtime is identity; all the force is in the parameter type. The return conditional lives on the `Workflow` marker (`Workflow.ts:15-17`) and resolves a `never` channel to `UninhabitedDecision` / `UninhabitedError`, making a total workflow uncallable and a `Promise`-returning decider a type error. `Policy` declines a `make`: its contract is fully carried by the type `(self: Effect<A, E, R>) => Effect<A, E, R>` (`Policy.ts`), so a constructor would be the identity function on the type, forcing nothing the type does not already force.

The non-obvious trap: **put the conditional in parameter position and it collapses.** If `make` takes `(decide: Workflow<C, D, E>)` instead of `(decide: (command: C) => Either<D, E>)`, tsc resolves `D`/`E` inside the parameter to `unknown` — a conditional type has no inference site there — so the parameter becomes `(command: C) => Either<unknown, unknown>`, the `Uninhabited*` markers become unreachable, and the constructor accepts everything and enforces nothing while still type-checking green. The conditional must live on the return type, the existing marker. This inference of `D`/`E` from the argument, and the derived `never`-markers, is the whole force a constructor can carry: a hand-written annotation cannot fake it.

What did not ship — `executor` and `handler`. They are shells, not cells with a type-level proposition: the only fact a shell carries is `Effect<A, E, R>`, which Effect already supplies. `Effect.gen` **is** the imperative shell — `CONST-B1`'s shell as a value, `CONST-B3`'s bread around the pure filling — and sequencing is inexpressible at the type level (see Why This Matters, (b)). A prototype `Executor.make` taking the sandwich phases as named parameters failed on a legitimate use case: a production HTTP executor must write inside a transaction before it knows what to classify, so its order is `read → write → read → decide → encode`, which a fixed parameter product cannot express. A constructor types the seam, never the sequence.

A constructor earns existence only by computing something the author cannot write. `Workflow.make` earns it. `Schema.make` was built, compiled, and deleted: every rejection it produced came from its parameter type alone, which an author-written `S.Schema` annotation rejects identically — it computed nothing. A branded `SchemaCell` return was tried and removed in turn: the brand recorded only that `make` had been called, provenance rather than a proposition.

## Why This Matters

**(a) The type and the suffix rule are complementary, disjoint observers — not substitutes.** A type binds only where it is present. `Workflow.make` rejects a total decision and a `Promise`-returning decider at call sites, but only at call sites — the annotation form defeats the guarantee on the same function, because `const w: Workflow.Workflow<Cmd, Dec, Err> = …` never produces the `Uninhabited*` markers. A suffix rule reads the whole file. Two re-runnable experiments established the boundary, and both were measured, not conceded:

- **Experiment 1 — the marker does not bite at the definition site.** A `*.workflow.ts` was written whose decision is total (`Either<Either<ProbeAccepted, never>>`), produced by `Workflow.make`, exported, and called nowhere. `Workflow<C, D, never>` resolves to `UninhabitedError`, so a consumer cannot call it — yet `typecheck` exits **0** on the file, while `lint` exits **1**. The type-level guarantee is consumer-side; the depth-0 rule is what catches a total decision where it is written.
- **Experiment 2 — the rule is broader than the constructor's parameter.** `workflow-no-async` carries three checks, not one: `asyncFunction` on any function in the file, `awaitExpression` on any `await`, and `promiseType` on any `Promise` type reference anywhere (`workflow-no-async.ts`). `make`'s parameter type rejects only a `Promise`-returning _decider_. A private async helper, an `await` inside it, or a `Promise` annotation in a non-decider position all pass the constructor and fail the rule. File ⊃ decider.

Conclusion, measured: **zero rules retired, one new rule required.** `workflow-either-inhabited`, `workflow-schema-required`, and `workflow-no-async` all stay; the `.tst.ts` assertions stand as what the constructor promises a consumer, not as replacements. The new rule, `workflow-declaration-form`, exists to force the constructor — to reject the annotation form, a non-`make` initializer, and a local `type Workflow<...>` copy of the contract — because only the constructor's inference is the force. It also turned out to be the one rule that had never been registered: 17 of 18 `defineRule` files in the plugin were wired, and this one was dead code, which is why the annotation form passed at HEAD.

**(b) Why sequencing is not constructible.** The I/O sandwich — read → decode → decide → shape → write — is an _ordering_ constraint, and an indexed `Cell<Phase, A, E, R>` threaded through `Effect.gen` cannot express order. `Effect.gen` unions every yielded effect into one `Eff` type parameter and extracts `E`/`R` from it (`repos/effect/packages/effect/src/Effect.ts:2760-2767`), so type information crosses `yield*` fine — that is not the obstacle. The obstacle is that `Eff` is a **union**, and union is commutative and idempotent: a phase index threaded through `gen` can express which phases are _present_ but never the _order_ they occurred in. `read → write` and `write → read` are the same union, so the sandwich order is unreachable through the generator. An index licences `write → decide` explicitly and therefore forbids nothing. That is why indexing is rejected on derivation — not on `yield*` erasure — and why a sequencer cannot be constructed: the executor and handler cells _are_ shells.

## When to Apply

For any proposed new cell constructor, run this procedure before writing a signature:

1. **Is the cell's content a pure value or a combinator?** If it is a shell (executor, handler, store, adapter), stop — there is nothing left to force beyond `Effect<A, E, R>`, which Effect supplies.
2. **Does Effect already supply the composer?** If yes (`S.Schema` for schema, `S.transformOrFail` for acl, `Layer.effect` for adapter), the constructor wraps what exists and computes nothing. Stop.
3. **Write the candidate signature and read the _parameter_ type.** The whole force must come from the parameter, because that is what the author writes. Put any conditional on the return type — in parameter position it resolves to `unknown` and collapses.
4. **Would an author-written annotation reject the same inputs?** If yes, the constructor computes nothing — it is the identity function on the type. Either it adds provenance only (schema) and is withdrawn, or the bare type is the enforcement (policy) and no `make` ships.

Counter-indications that make a constructor the wrong instrument, even when a cell earns one: claims that need the whole file (a `Promise` reference in a helper, a local type alias, an `await` outside the decider — `workflow-no-async`'s three checks, matched only by a suffix rule); file-level export cardinality; import-graph and module-scope-state facts; and any ordering constraint, which no type over a value can hold. Where the doctrine is real but not type-expressible, keep the rule and fix its message, not its instrument.

## Examples

**Before** — the annotation form. The type binds only here; a `never` channel never reaches the `Uninhabited*` markers, so a total decision and a `Promise` return slip through at the definition site, and the rule that was supposed to police the form never ran:

```ts
import type { Workflow } from '@systemfsoftware/effect-cell-types'

export const decide: Workflow.Workflow<Cmd, Dec, Err> = (cmd) =>
  cmd.kind === 'go' ? Either.right({ succeeded: true }) : Either.left({ code: 1 })
```

**After** — the constructor form. `D` and `E` infer from the decider's return, the `never`-markers derive, and the file reads as the ecosystem it publishes into:

```ts
import { Workflow } from '@systemfsoftware/effect-cell-types'

export const decide = Workflow.make((cmd: Cmd): Either<Dec, Err> =>
  cmd.kind === 'go' ? Either.right({ succeeded: true }) : Either.left({ code: 1 })
)
```

The constructor's rejections are pinned by `packages/effect-cell-types/test-types/Workflow.tst.ts`, quoted:

```ts
// Should_RejectPromiseReturningDecider_When_ParameterRequiresEitherReturn
expect<typeof Workflow.make>().type.not.toBeCallableWith(decidePromise)

// Should_RejectBareValueDecider_When_ParameterRequiresEitherReturn
expect<typeof Workflow.make>().type.not.toBeCallableWith(decideValue)

// Should_ResolveTotalDecisionToUninhabitedError_When_ErrorChannelIsNever
declare const totallyDecided: Workflow.Workflow<Cmd, boolean, never>
// @ts-expect-error: This expression is not callable
totallyDecided(cmd)
```

With the pathological variant — the conditional in parameter position — all three `not`-assertions above would fail to reject, because the parameter would have collapsed to `(command: C) => Either<unknown, unknown>`. The type would look correct and enforce nothing; the tests are what keep the force on the return type where it belongs.

## Related

- `docs/solutions/architecture-patterns/provenance-ritual-gates.md` — establishes the cheapest-channel ordering, "a type beats a generator, which beats a lint rule, which beats a gate". This learning **refines** it: on the `workflow` cell the type and the rule read disjoint surfaces, so the type does not dominate the rule and shipping the constructor retired nothing. Read the ordering as "prefer the cheapest channel that can _see_ the property", not as licence to delete a rule a type appears to cover.
- `docs/solutions/design-patterns/generated-schema-laws-are-tautological.md` — the sibling case in the verification channel. There a generated law draws its generator from the schema under test and so cannot fail; here a constructor whose rejections come from its parameter type alone computes nothing an author-written annotation would not. Same family: an instrument that cannot fail is not enforcement.
- `docs/solutions/tooling-decisions/rule-admission-severity-and-accretion.md` — rule count is not the axis; this learning supplies the measured case where the population could not shrink.
- `docs/solutions/architecture-patterns/workflow-error-channel-gates.md` — the `workflow` cell's error-channel gates, which the constructor's `Uninhabited*` markers now express at call sites.
- PR #135 — shipped `Workflow.make`, `Policy`, and `workflow-declaration-form`; both experiments in **Why This Matters** are reproducible from that tree.
- Issue #138 — the `kernel` cell's observer gap, the open half of the same "which observer reads this cell" question.
