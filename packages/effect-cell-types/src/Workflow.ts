import type { Result } from 'effect/Result'
import type * as Schema from 'effect/Schema'
import { callSite } from './CallSite.js'

const WorkflowTypeId: unique symbol = Symbol.for('@systemfsoftware/effect-cell-types/Workflow')
type WorkflowTypeId = typeof WorkflowTypeId

export const WorkflowSchemasKey: unique symbol = Symbol.for('@systemfsoftware/effect-cell-types/WorkflowSchemas')
export type WorkflowSchemasKey = typeof WorkflowSchemasKey

export const InstrumentationBrand: unique symbol = Symbol.for('@systemfsoftware/effect-cell-types/instrumentation')
export type InstrumentationBrand = typeof InstrumentationBrand

/**
 * The literal map a command or decision class declares: each entry names a schema field and
 * the OpenTelemetry attribute key the field's value is copied onto the parent span as.
 */
export type InstrumentationMap = { readonly [field: string]: string }

export type CommandSchema = Schema.Constraint & {
  readonly fields: Schema.Struct.Fields
  readonly Type: object
  readonly DecodingServices: never
}

export type InstrumentedCommandSchema = CommandSchema & {
  readonly [InstrumentationBrand]: InstrumentationMap
}

export type DecisionSchema = Schema.Constraint & {
  readonly EncodingServices: never
}

/**
 * The three schemas a workflow declares — the command it receives, the decision it publishes
 * and the error it refuses with — beside the site where `make` was called. This is what
 * {@link WorkflowBrand} carries and what the sandwich derives its decode and encode steps from.
 */
export interface WorkflowSchemas<
  Command extends Schema.Constraint = Schema.Constraint,
  Decision extends Schema.Constraint = Schema.Constraint,
  Error extends Schema.Constraint = Schema.Constraint,
> {
  readonly command: Command
  readonly decision: Decision
  readonly error: Error
  readonly decideSite: string
}

export interface WorkflowBrand<
  Command extends Schema.Constraint = Schema.Constraint,
  Decision extends Schema.Constraint = Schema.Constraint,
  Error extends Schema.Constraint = Schema.Constraint,
> {
  readonly [WorkflowTypeId]: WorkflowTypeId
  readonly [WorkflowSchemasKey]: WorkflowSchemas<Command, Decision, Error>
}

type ClassKeys<C> = C extends { readonly Type: infer T } ? keyof T & string : never

export type MissingInstrumentationAnnotation = {
  readonly __CELL_SCHEMA_MISSING_INSTRUMENTATION_ANNOTATION__:
    'a cell command must declare its instrumentation: static readonly [Workflow.InstrumentationBrand] = { fieldName: "app.attribute.key" } as const'
}

export type InvalidInstrumentationKey<K extends string> = {
  readonly __CELL_SCHEMA_INVALID_INSTRUMENTATION_KEY__: `instrumentation key '${K}' is not a field of this schema class`
}

export type InvalidInstrumentationValue<V extends string> = {
  readonly __CELL_SCHEMA_INVALID_INSTRUMENTATION_VALUE__:
    `instrumentation value '${V}' is not an OpenTelemetry attribute key; use lowercase dot-separated segments like 'app.order.id'`
}

/** An attribute key is lowercase and carries at least one dot-separated segment. */
type AttributeKeyIsOtel<V extends string> = [V] extends [Lowercase<V>] ? [V] extends [`${string}.${string}`] ? true
  : false
  : false

type InvalidAttributeValues<Map extends InstrumentationMap> = {
  [K in keyof Map]: AttributeKeyIsOtel<Map[K]> extends true ? never : Map[K]
}[keyof Map]

/**
 * The command class the constructor accepts: it must carry the instrumentation map, every
 * field it names must be a field of the class, and every attribute key must be an
 * OpenTelemetry key.
 */
export type CheckCommandClass<C> = C extends { readonly [InstrumentationBrand]: infer Map extends InstrumentationMap }
  ? [Exclude<keyof Map & string, ClassKeys<C>>] extends [never]
    ? ([InvalidAttributeValues<Map>] extends [never] ? object
      : InvalidInstrumentationValue<InvalidAttributeValues<Map>>)
  : InvalidInstrumentationKey<Exclude<keyof Map & string, ClassKeys<C>>>
  : MissingInstrumentationAnnotation

/**
 * The span attribute record a command class declares, keyed by the OpenTelemetry attribute
 * keys its instrumentation map states and valued by the mapped fields' schema types. This is
 * the type a span declaration pins its `attrs` schema against, so a map edit and a span
 * declaration can only drift apart by failing the compile.
 */
export type SpanAttributes<C> = C extends
  { readonly Type: infer T; readonly [InstrumentationBrand]: infer Map extends InstrumentationMap }
  ? { readonly [K in keyof Map as Map[K]]: K extends keyof T ? T[K] : never }
  : never

export interface UninhabitedDecision {
  readonly __WORKFLOW_DECISION_CHANNEL_IS_NEVER__:
    'this workflow can never succeed; give it a decision variant it can return'
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

type Top<A = unknown> = A

type AtLeastTwoDistinct<T, U = T> = U extends U ? [T] extends [U] ? false : true : never

type TaggedMembers<D> = D extends D ? '_tag' extends keyof D ? [D['_tag']] extends [string] ? true : false : false
  : never

type MutuallyAssignable<A, B> = [A] extends [B] ? [B] extends [A] ? true : false : false

type BrandSlotIsTheGeneralSymbol<D, K extends PropertyKey> = D extends D
  ? K extends keyof D ? MutuallyAssignable<D[K], symbol> : false
  : never

type SharedTypeId<D> = [
  {
    [K in keyof D]: [K] extends [symbol] ? ([BrandSlotIsTheGeneralSymbol<D, K>] extends [true] ? K : never) : never
  }[keyof D],
] extends [never] ? UnsharedTypeId : Top

/**
 * A member with no `_tag` is not dispatchable. `TaggedMembers` widens to the boolean literal
 * `false` when no member carries a tag, so the check reads `false extends` rather than
 * `boolean extends` — the latter let a bare `boolean` decision through, because `boolean` is
 * not assignable to `false`.
 */
type TaggedVariants<D> = false extends TaggedMembers<D> ? UntaggedDecision : Top

type DispatchableTag<E> = '_tag' extends keyof E ? [E['_tag']] extends [string] ? Top : UntaggedError
  : UntaggedError

type ErrorLaw<E> = [E] extends [never] ? Top : DispatchableTag<E>

type ExclusiveOutcomes<D, E> = AtLeastTwoDistinct<D | E> extends false ? SingleVariantDecision : Top

type ExclusiveDecisionLaw<D, E> = ExclusiveOutcomes<D, E> & TaggedVariants<D> & SharedTypeId<D>

type EventListLaw<Element> = TaggedVariants<Element> & SharedTypeId<Element>

type DecisionLaw<D, E> = [D] extends [ReadonlyArray<infer Element>] ? EventListLaw<Element>
  : ExclusiveDecisionLaw<D, E>

export type Inhabited<Decision, DecisionError> = [Decision] extends [never] ? UninhabitedDecision
  : DecisionLaw<Decision, DecisionError> & ErrorLaw<DecisionError>

export type Workflow<Command, Decision, DecisionError> = [Decision] extends [never] ? UninhabitedDecision
  : ((command: Command) => Result<Decision, DecisionError>) & WorkflowBrand

/**
 * What {@link make} publishes: the callable value plus the three schemas it declares, so the
 * sandwich can derive decode and encode and the handler record can be held exhaustive over the
 * encoded tags.
 */
export type MadeWorkflow<
  Command extends CommandSchema,
  Decision extends DecisionSchema,
  Error extends DecisionSchema,
> =
  & ((command: Command['Type']) => Result<Decision['Type'], Error['Type']>)
  & WorkflowBrand<Command, Decision, Error>

export const make = <
  Command extends InstrumentedCommandSchema,
  Decision extends DecisionSchema,
  Error extends DecisionSchema,
>(
  options: {
    readonly command: Command & CheckCommandClass<Command>
    readonly decision: Decision
    readonly error: Error
    readonly decide: (command: Command['Type']) =>
      & Result<Decision['Type'], Error['Type']>
      & Inhabited<Decision['Type'], Error['Type']>
  },
): MadeWorkflow<Command, Decision, Error> => {
  const { command, decision, error, decide } = options
  assertWorkflow<Command, Decision, Error>(decide)
  Object.assign(decide, { [WorkflowSchemasKey]: { command, decision, error, decideSite: callSite() } })
  return decide
}

function assertWorkflow<
  Command extends CommandSchema,
  Decision extends DecisionSchema,
  Error extends DecisionSchema,
>(
  _decide: (command: Command['Type']) => Result<Decision['Type'], Error['Type']>,
): asserts _decide is MadeWorkflow<Command, Decision, Error> {}
