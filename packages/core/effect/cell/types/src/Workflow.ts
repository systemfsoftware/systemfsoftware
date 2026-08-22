import type { Result } from 'effect/Result'
import type * as Schema from 'effect/Schema'

/**
 * The nominal brand a workflow carries. `Workflow.make` is the only door that applies it,
 * and every surface that runs a decision — `Cell.decide`, and through it `DecideNode.run`
 * via the `DecidePhase` conjunct — demands it, so a bare decider that skipped `make` is
 * refused by the compiler at the call site that would have run it.
 *
 * The brand is phantom — a readonly TypeId-keyed field that no runtime property ever
 * backs: `assertWorkflow` narrows the same function value without touching it. The
 * `Symbol.for` key follows the repo's branded-class idiom (the instance brands in
 * `restart-decision.workflow.ts`, `hook-verdict.workflow.ts` and `survivors.workflow.ts`)
 * so it is stable across realms; this is the type-level brand that subsumes those
 * instance brands on the workflow shapes.
 */
const WorkflowTypeId: unique symbol = Symbol.for('@systemfsoftware/effect-cell-types/Workflow')
type WorkflowTypeId = typeof WorkflowTypeId

/** The phantom property `Workflow<C,D,E>` and `Cell.DecidePhase<P>` carry. */
export interface WorkflowBrand {
  readonly [WorkflowTypeId]: WorkflowTypeId
}

/**
 * Marker a workflow resolves to when its decision channel is `never`. The property type is the
 * fix, so the compiler diagnostic names it.
 */
export interface UninhabitedDecision {
  readonly __WORKFLOW_DECISION_CHANNEL_IS_NEVER__:
    'this workflow can never succeed; give it a decision variant it can return'
}

/** Marker a workflow resolves to when its error channel is `never`. */
export interface UninhabitedError {
  readonly __WORKFLOW_ERROR_CHANNEL_IS_NEVER__:
    'this workflow cannot fail, so it decides nothing; give it an error variant or move it to a *.kernel.ts'
}

/** Marker a workflow resolves to when its error channel carries no tag to dispatch on. */
export interface UntaggedError {
  readonly __WORKFLOW_ERROR_CHANNEL_CARRIES_NO_TAG__:
    'this error carries no _tag the consumer can dispatch on; declare it as an S.TaggedError'
}

/** The shape an error channel must have: a tag the consumer dispatches on. */
export interface Tagged {
  readonly _tag: string
}

/**
 * A decider whose channels are both inhabited, or the marker naming which channel is not.
 *
 * `[T] extends [never]` rather than `T extends never`: the tuple wrap stops distribution, without
 * which a `never` channel satisfies the conditional vacuously and is never caught.
 *
 * The inhabited branch carries the nominal brand: `Workflow.make` is the only constructor that
 * applies it, so a bare function annotated `Workflow<C, D, E>` is refused wherever the brand
 * is demanded — which is exactly where a decision gets run.
 */
export type Workflow<Command, Decision, DecisionError> = [Decision] extends [never] ? UninhabitedDecision
  : [DecisionError] extends [never] ? UninhabitedError
  : ((command: Command) => Result<Decision, DecisionError>) & WorkflowBrand

/**
 * `unknown` when both channels are inhabited and the error carries a tag, so the intersection in
 * {@link make} collapses to the plain `Result` and neither inference nor the authoring surface
 * changes. Otherwise the marker the author must satisfy, which they cannot, which is the point.
 */
export type Inhabited<Decision, DecisionError> = [Decision] extends [never] ? UninhabitedDecision
  : [DecisionError] extends [never] ? UninhabitedError
  : [DecisionError] extends [Tagged] ? unknown
  : UntaggedError

/**
 * Builds a workflow from the command's schema class and a decider over that class's
 * instance type, refusing an uninhabited or untagged channel at this call rather than at
 * whoever first calls the result — which for a workflow nothing calls yet is never.
 *
 * The command is constrained on the **value**, not on a type parameter inferred from the
 * decider's parameter. That is the whole mechanism. Any constraint on such a parameter is a
 * structural predicate, and TypeScript cannot say "this type came from a class declaration"
 * — so a marker placed there is a property, every property is declarable, and
 * `interface Fake extends Marker {}` satisfies it. A declared type produces no value, so it
 * cannot reach an argument position at all: there is no marker to smuggle because there is
 * no marker.
 *
 * The three parameters mirror `Schema.Class`'s own bound exactly, and that is load-bearing.
 * `Class<Self, S, Inherited>` places `S` in both covariant (`S["Type"]`) and contravariant
 * (`S["fields"]`) positions, so it is invariant in `S`: every *fixed* spelling —
 * `Class<unknown, Struct<Struct.Fields>, unknown>` and its variants — rejects real command
 * classes. Generic over `S` accepts them and still refuses a `Struct`, which lacks
 * `identifier` and `extend`. `Class<any, any, any>` also works and is banned here.
 *
 * `Schema.TaggedClass` returns this same `Class` interface, so one constraint covers both
 * factories with no union. The import is type-only: this package gains no runtime dependency
 * on Effect Schema, and `make` stays the identity function it always was.
 *
 * The markers ride the parameter function's return type, not the parameter as `Workflow<C, D, E>`:
 * a conditional type in parameter position resolves `D` and `E` to `unknown` and the markers become
 * unreachable. On the return type both still infer from the `Result` conjunct while the marker
 * conjunct is what an uninhabited channel fails to satisfy.
 *
 * `E` carries no constraint on purpose. Constraining it gives inference a fallback: where `E` would
 * infer as `never` TypeScript substitutes the constraint instead, the conditional takes its
 * inhabited branch, and a `never` channel passes. The tagged requirement therefore lives in
 * {@link Inhabited}, where nothing can stand in for `never`.
 *
 * The narrowing goes through an assertion signature rather than an `as` cast: every narrowing
 * assertion trips `typescript(no-unsafe-type-assertion)`, and a suppression comment would hide the
 * one place this file could lie. It is sound rather than merely permitted — with both channels
 * inhabited `Workflow<Self, D, E>` is `(command: Self) => Result<D, E>` carrying the
 * {@link WorkflowBrand} conjunct, and otherwise the return type is a marker with no call
 * signature, so the value handed back is unobservable through it. The brand is applied here and
 * nowhere else: the assertion adds no runtime property, yet a value that did not pass through this
 * door fails the conjunct wherever a decision is run.
 */
export const make = <
  Self,
  S extends Schema.Constraint & { readonly fields: Schema.Struct.Fields },
  Inherited,
  D,
  E,
>(
  _command: Schema.Class<Self, S, Inherited>,
  decide: (command: Self) => Result<D, E> & Inhabited<D, E>,
): Workflow<Self, D, E> => {
  assertWorkflow(decide)
  return decide
}

function assertWorkflow<C, D, E>(
  _decide: (command: C) => Result<D, E> & Inhabited<D, E>,
): asserts _decide is Workflow<C, D, E> & ((command: C) => Result<D, E>) {}
