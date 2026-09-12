import { flatMap, type Result } from 'effect/Result'
import type * as Schema from 'effect/Schema'

const WorkflowTypeId: unique symbol = Symbol.for('@systemfsoftware/effect-cell-types/Workflow')
type WorkflowTypeId = typeof WorkflowTypeId

export interface WorkflowBrand {
  readonly [WorkflowTypeId]: WorkflowTypeId
}

export interface UninhabitedDecision {
  readonly __WORKFLOW_DECISION_CHANNEL_IS_NEVER__:
    'this workflow can never succeed; give it a decision variant it can return'
}

export interface UninhabitedError {
  readonly __WORKFLOW_ERROR_CHANNEL_IS_NEVER__:
    'this workflow cannot fail, so it decides nothing; give it an error variant or fold the function into its owning module'
}

export interface UntaggedError {
  readonly __WORKFLOW_ERROR_CHANNEL_CARRIES_NO_TAG__:
    'this error carries no _tag the consumer can dispatch on; declare it as an S.TaggedError'
}

export interface SingleVariantDecision {
  readonly __WORKFLOW_DECISION_CHANNEL_HAS_ONE_VARIANT__:
    'this workflow decides one outcome, which is not a decision; add the variant it chooses between, or fold the function into its owning module'
}

export interface UntaggedDecision {
  readonly __WORKFLOW_DECISION_CHANNEL_CARRIES_NO_TAG__:
    'a decision variant carries no _tag the consumer can dispatch on; declare the variants as S.TaggedClass instances'
}

export interface UnsharedTypeId {
  readonly __WORKFLOW_DECISION_VARIANTS_DO_NOT_SHARE_A_TYPE_ID__:
    'the decision variants must share one TypeId — a Symbol.for family brand on each variant class'
}

type AtLeastTwoDistinct<T, U = T> = U extends unknown ? [T] extends [U] ? false : true : never

type TaggedMembers<D> = D extends unknown ? '_tag' extends keyof D ? [D['_tag']] extends [string] ? true : false : false
  : never

type SharedTypeId<D> = [
  { [K in keyof D]: [K] extends [symbol] ? ([D[K]] extends [symbol] ? K : never) : never }[keyof D],
] extends [never] ? UnsharedTypeId : unknown

type DecisionShape<D> = [unknown] extends [D] ? unknown
  : AtLeastTwoDistinct<D> extends false ? SingleVariantDecision
  : boolean extends TaggedMembers<D> ? UntaggedDecision
  : SharedTypeId<D>

export type Workflow<Command, Decision, DecisionError> = [Decision] extends [never] ? UninhabitedDecision
  : [DecisionError] extends [never] ? UninhabitedError
  : ((command: Command) => Result<Decision, DecisionError>) & WorkflowBrand

type DispatchableTag<E> = '_tag' extends keyof E ? [E['_tag']] extends [string] ? unknown : UntaggedError
  : UntaggedError

export type Inhabited<Decision, DecisionError> = [Decision] extends [never] ? UninhabitedDecision
  : [DecisionError] extends [never] ? UninhabitedError
  : DecisionShape<Decision> & DispatchableTag<DecisionError>

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

/**
 * Brands a decision that cannot fail. `make` refuses a `never` error channel outright
 * (`UninhabitedError`); this is the door for the decider that genuinely decides everything.
 * The decision must still choose between at least two tagged variants sharing one TypeId, so
 * `SingleVariantDecision`, `UntaggedDecision`, and `UnsharedTypeId` still fire.
 *
 * The command schema class comes first, exactly as in {@link make}, so the command channel
 * stays pinned to the class rather than an inferred annotation. The decider's return carries
 * `DecisionShape` written out: the `Workflow` alias is a deferred conditional, and in
 * parameter position it collapses the whole parameter to `unknown` while the decision
 * channel is still generic.
 */
export const total = <
  Self,
  S extends Schema.Constraint & { readonly fields: Schema.Struct.Fields },
  Inherited,
  D,
>(
  _command: Schema.Class<Self, S, Inherited>,
  decide: (command: Self) => Result<D, never> & DecisionShape<D>,
): ((command: Self) => Result<D, never>) & WorkflowBrand => {
  const plain: (command: Self) => Result<D, never> = decide
  assertTotal(plain)
  return plain
}

export const andThen = <
  SelfA,
  SA extends Schema.Constraint & { readonly fields: Schema.Struct.Fields },
  InheritedA,
  D1,
  E1,
  SelfB extends { readonly decision: D1 },
  D2,
  E2,
>(
  commandA: Schema.Class<SelfA, SA, InheritedA>,
  upstream: ((command: SelfA) => Result<D1, E1>) & WorkflowBrand,
  commandB: { new(props: { readonly decision: D1 }): SelfB },
  downstream: ((command: SelfB) => Result<D2, E2>) & WorkflowBrand,
): Workflow<SelfA, D2, E1 | E2> =>
  make(
    commandA,
    (command: SelfA): Result<D2, E1 | E2> =>
      flatMap(upstream(command), (decision) => downstream(new commandB({ decision }))),
  )

function assertWorkflow<C, D, E>(
  _decide: (command: C) => Result<D, E> & Inhabited<D, E>,
): asserts _decide is Workflow<C, D, E> & ((command: C) => Result<D, E>) {}

function assertTotal<Command, D>(
  _decide: (command: Command) => Result<D, never>,
): asserts _decide is ((command: Command) => Result<D, never>) & WorkflowBrand {}
