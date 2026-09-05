import type { Result } from 'effect/Result'
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

type UnionToIntersection<U> = (U extends unknown ? (k: U) => void : never) extends (k: infer I) => void ? I
  : never

type AtLeastTwoDistinct<T, U = T> = U extends unknown ? [T] extends [U] ? false : true : never

type TaggedMembers<D> = D extends unknown ? '_tag' extends keyof D ? [D['_tag']] extends [string] ? true : false : false
  : never

type SharedTypeId<D, I = UnionToIntersection<D>> = [
  keyof {
    [K in keyof I as I[K] extends K ? (D extends { readonly [P in K]: K } ? K : never) : never]: 0
  },
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

function assertWorkflow<C, D, E>(
  _decide: (command: C) => Result<D, E> & Inhabited<D, E>,
): asserts _decide is Workflow<C, D, E> & ((command: C) => Result<D, E>) {}
