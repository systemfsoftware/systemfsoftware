import type { Result } from 'effect/Result'

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
  : '_tag' extends keyof DecisionError ? unknown
  : UntaggedError

/**
 * Builds a workflow, refusing an uninhabited or untagged channel at this call rather than at
 * whoever first calls the result — which for a workflow nothing calls yet is never.
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
 * inhabited `Workflow<C, D, E>` is `(command: C) => Result<D, E>` carrying the {@link WorkflowBrand}
 * conjunct, and otherwise the return type is a marker with no call signature, so the value handed
 * back is unobservable through it. The brand is applied here and nowhere else: the assertion adds
 * no runtime property, so `make` stays the identity function it always was, yet a value that did
 * not pass through this door fails the conjunct wherever a decision is run.
 */
export const make = <C, D, E>(
  decide: (command: C) => Result<D, E> & Inhabited<D, E>,
): Workflow<C, D, E> => {
  assertWorkflow(decide)
  return decide
}

function assertWorkflow<C, D, E>(
  _decide: (command: C) => Result<D, E> & Inhabited<D, E>,
): asserts _decide is Workflow<C, D, E> & ((command: C) => Result<D, E>) {}
