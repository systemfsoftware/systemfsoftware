/**
 * The matcher builder: an ordered set of semantic rules over one input, with a
 * fallback. A matcher is a cold blueprint: every case, uncertainty handler, and
 * fallback is one operation, so method chaining, the data-first dual, and
 * `pipe(...)` compose identically, and a compiled matcher is an inspectable
 * plan, stable for stable decision ids.
 */
import { Blueprint } from '@systemfsoftware/effect-cell-types'
import { Array as Arr, Effect, Match, Option } from 'effect'
import { dual } from 'effect/Function'
import type * as Schema from 'effect/Schema'
import type * as AiError from 'effect/unstable/ai/AiError'
import type * as Decision from 'effect/unstable/ai/Decision'
import type * as DecisionModel from 'effect/unstable/ai/DecisionModel'
import type { Hashable } from './decision-model.blueprint.js'
import { hash } from './decision-model.blueprint.js'
import type { ClassifyDecision } from './decision.blueprint.js'
import {
  type DecisionIdCollisionError,
  ExhaustiveMatchError,
  type InvalidThresholdError,
  type PolicyCommandRejected,
  type UncertainMatchError,
} from './DiscernError.schema.js'
import { CaseInspection, CompiledPlan, DecisionInspection } from './Inspection.schema.js'
import type { HandlerResult, LeafOptions, NodeCore, Pattern, UncertainContext } from './pattern.blueprint.js'
import { distinctDecisions } from './pattern.blueprint.js'
import { finishPolicy } from './run-policy.cell.js'
import type { Policy, PolicyCase, PolicySpec, UncertainHandler } from './run-policy.cell.js'

type Top<A = unknown> = A

/** The two ways a matcher can be started: reusable over a schema, or over one value. */
export type MatcherFlavor = 'type' | 'value'

export const TypeId = Symbol.for('@systemfsoftware/discern/Matcher')
export type TypeId = typeof TypeId

/** The value a handler contributes: an Effect's success, or the returned value itself. */
type HandlerValue<Returned> = [Returned] extends [Effect.Effect<infer Value, infer _Err, infer _Req>] ? Value : Returned

/** The error a handler contributes: an Effect's failure, or never. */
type HandlerError<Returned> = [Returned] extends [Effect.Effect<infer _Value, infer Err, infer _Req>] ? Err : never

/** The services a handler contributes: an Effect's requirements, or never. */
type HandlerServices<Returned> = [Returned] extends [Effect.Effect<infer _Value, infer _Err, infer Req>] ? Req : never

type ReturnOf<F> = F extends (...args: never[]) => infer Returned ? Returned : never

/**
 * The data a matcher or a classification match is minted from. The cases and
 * handlers are recorded erased; their precise types come back from the index.
 */
export interface MatcherSpec {
  readonly flavor: MatcherFlavor
  readonly schema: Schema.Constraint
  readonly provided: Option.Option<Top>
  readonly cases: ReadonlyArray<Top>
  readonly uncertainHandler: Top
}

export interface MatcherIndex {
  readonly Input: Top
  readonly S: Schema.Constraint
  readonly Out: Top
  readonly Err: Top
  readonly Req: Top
  readonly Flavor: MatcherFlavor
}

type InputOf<X> = X extends { readonly Input: infer I } ? I : never
type SchemaOf<X> = X extends { readonly S: infer S extends Schema.Constraint } ? S : never
type OutOf<X> = X extends { readonly Out: infer Out } ? Out : never
type ErrOf<X> = X extends { readonly Err: infer Err } ? Err : never
type ReqOf<X> = X extends { readonly Req: infer Req } ? Req : never
type FlavorOf<X> = X extends { readonly Flavor: infer Flavor extends MatcherFlavor } ? Flavor : never

/** The matcher an index names, widened by what one handler returns. */
type Widened<X, Returned> = Matcher<
  InputOf<X>,
  SchemaOf<X>,
  OutOf<X> | HandlerValue<Returned>,
  ErrOf<X> | HandlerError<Returned>,
  ReqOf<X> | HandlerServices<Returned>,
  FlavorOf<X>
>

/** Add an ordered semantic or deterministic case. */
export interface When extends Blueprint.Operation {
  readonly params: readonly [
    pattern: Pattern<InputOf<this['Index']>>,
    handler: (input: InputOf<this['Index']>) => Top,
    options?: LeafOptions,
  ]
  readonly out: Widened<this['Index'], ReturnOf<this['Args'][1]>>
  readonly last: <PatternInput, Returned>(
    pattern: Pattern<PatternInput>,
    handler: (input: PatternInput) => Returned,
    options?: LeafOptions,
  ) => <S extends Schema.Constraint, Out, Err, Req, Flavor extends MatcherFlavor>(
    self: Matcher<PatternInput, S, Out, Err, Req, Flavor>,
  ) => Matcher<
    PatternInput,
    S,
    Out | HandlerValue<Returned>,
    Err | HandlerError<Returned>,
    Req | HandlerServices<Returned>,
    Flavor
  >
}

/** Handle uncertainty from the first higher-priority case that cannot be resolved confidently. */
export interface OnUncertain extends Blueprint.Operation {
  readonly params: readonly [handler: (input: InputOf<this['Index']>, context: UncertainContext) => Top]
  readonly out: Widened<this['Index'], ReturnOf<this['Args'][0]>>
  readonly last: <Input, Returned>(
    handler: (input: Input, context: UncertainContext) => Returned,
  ) => <S extends Schema.Constraint, Out, Err, Req, Flavor extends MatcherFlavor>(
    self: Matcher<Input, S, Out, Err, Req, Flavor>,
  ) => Matcher<
    Input,
    S,
    Out | HandlerValue<Returned>,
    Err | HandlerError<Returned>,
    Req | HandlerServices<Returned>,
    Flavor
  >
}

/**
 * What `orElse` yields: a reusable matcher becomes a callable {@link Policy};
 * a value matcher runs immediately and answers the Effect directly.
 */
export type FinishedMatcher<I, S extends Schema.Constraint, Out, Err, Req, Flavor extends MatcherFlavor> =
  Flavor extends 'type' ? Policy<I, Out, Err, Req, S>
    : Effect.Effect<
      Out,
      | Err
      | AiError.AiError
      | DecisionIdCollisionError
      | InvalidThresholdError
      | PolicyCommandRejected
      | UncertainMatchError,
      Req | DecisionModel.DecisionModel | S['EncodingServices']
    >

/** Complete the matcher with a fallback. For reusable matchers this returns a callable {@link Policy}. */
export interface OrElse extends Blueprint.Operation {
  readonly params: readonly [fallback: (input: InputOf<this['Index']>) => Top]
  readonly out: FinishedMatcher<
    InputOf<this['Index']>,
    SchemaOf<this['Index']>,
    OutOf<this['Index']> | HandlerValue<ReturnOf<this['Args'][0]>>,
    ErrOf<this['Index']> | HandlerError<ReturnOf<this['Args'][0]>>,
    ReqOf<this['Index']> | HandlerServices<ReturnOf<this['Args'][0]>>,
    FlavorOf<this['Index']>
  >
  readonly last: <Input, Returned>(
    fallback: (input: Input) => Returned,
  ) => <S extends Schema.Constraint, Out, Err, Req, Flavor extends MatcherFlavor>(
    self: Matcher<Input, S, Out, Err, Req, Flavor>,
  ) => FinishedMatcher<
    Input,
    S,
    Out | HandlerValue<Returned>,
    Err | HandlerError<Returned>,
    Req | HandlerServices<Returned>,
    Flavor
  >
}

export interface MatcherFlavorTarget extends Blueprint.Target {
  readonly target: FlavorOf<this['Index']>
}

export interface MatcherSchema extends Blueprint.Target {
  readonly target: SchemaOf<this['Index']>
}

/** The value a `value` matcher was started with; `none` for a `type` matcher. */
export interface MatcherProvided extends Blueprint.Target {
  readonly target: Option.Option<InputOf<this['Index']>>
}

export interface MatcherCases extends Blueprint.Target {
  readonly target: ReadonlyArray<
    PolicyCase<InputOf<this['Index']>, OutOf<this['Index']>, ErrOf<this['Index']>, ReqOf<this['Index']>>
  >
}

export interface MatcherUncertainHandler extends Blueprint.Target {
  readonly target:
    | UncertainHandler<InputOf<this['Index']>, OutOf<this['Index']>, ErrOf<this['Index']>, ReqOf<this['Index']>>
    | undefined
}

export interface MatcherOps {
  readonly when: When
  readonly onUncertain: OnUncertain
  readonly orElse: OrElse
  readonly flavor: MatcherFlavorTarget
  readonly schema: MatcherSchema
  readonly provided: MatcherProvided
  readonly cases: MatcherCases
  readonly uncertainHandler: MatcherUncertainHandler
}

/** A reusable semantic matcher: ordered cases over one input schema, plus handlers. */
export type Matcher<
  I,
  S extends Schema.Constraint = Schema.Constraint,
  Out = never,
  Err = never,
  Req = never,
  Flavor extends MatcherFlavor = 'type',
> = Blueprint.Blueprint<
  TypeId,
  MatcherSpec,
  MatcherOps,
  {
    readonly Input: I
    readonly S: S
    readonly Out: Out
    readonly Err: Err
    readonly Req: Req
    readonly Flavor: Flavor
  }
>

const explicitCaseId = (options: LeafOptions | undefined): string | undefined => options?.id

const caseIdOf = (options: LeafOptions | undefined, index: number): string => explicitCaseId(options) ?? `case_${index}`

const matcherOf = <I, S extends Schema.Constraint, Out, Err, Req, Flavor extends MatcherFlavor>(spec: {
  readonly flavor: Flavor
  readonly schema: S
  readonly provided: Option.Option<I>
  readonly cases: ReadonlyArray<PolicyCase<I, Out, Err, Req>>
  readonly uncertainHandler: UncertainHandler<I, Out, Err, Req> | undefined
}): Matcher<I, S, Out, Err, Req, Flavor> =>
  Matchers.of<
    {
      readonly Input: I
      readonly S: S
      readonly Out: Out
      readonly Err: Err
      readonly Req: Req
      readonly Flavor: Flavor
    }
  >(spec)

const addCase = <I, S extends Schema.Constraint, Out, Err, Req, Flavor extends MatcherFlavor, Value, Err2, Req2>(
  self: Matcher<I, S, Out, Err, Req, Flavor>,
  pattern: Pattern<I>,
  handler: (input: I) => HandlerResult<Value, Err2, Req2>,
  options: LeafOptions | undefined,
): Matcher<I, S, Out | Value, Err | Err2, Req | Req2, Flavor> =>
  matcherOf<I, S, Out | Value, Err | Err2, Req | Req2, Flavor>({
    flavor: self.flavor,
    schema: self.schema,
    provided: self.provided,
    cases: [...self.cases, { id: caseIdOf(options, self.cases.length), pattern, run: handler }],
    uncertainHandler: self.uncertainHandler,
  })

const withUncertainHandler = <
  I,
  S extends Schema.Constraint,
  Out,
  Err,
  Req,
  Flavor extends MatcherFlavor,
  Value,
  Err2,
  Req2,
>(
  self: Matcher<I, S, Out, Err, Req, Flavor>,
  handler: (input: I, context: UncertainContext) => HandlerResult<Value, Err2, Req2>,
): Matcher<I, S, Out | Value, Err | Err2, Req | Req2, Flavor> =>
  matcherOf<I, S, Out | Value, Err | Err2, Req | Req2, Flavor>({
    flavor: self.flavor,
    schema: self.schema,
    provided: self.provided,
    cases: self.cases,
    uncertainHandler: handler,
  })

// -------------------------------------------------------------------------------------------------
// Compiled plans
// -------------------------------------------------------------------------------------------------

const kindOf = (decision: Decision.Any): 'Classify' | 'Rate' | 'Probability' =>
  Match.value(decision).pipe(
    Match.tag('Classify', () => 'Classify' as const),
    Match.tag('Rate', () => 'Rate' as const),
    Match.tag('Probability', () => 'Probability' as const),
    Match.exhaustive,
  )

const criteriaOf = (decision: Decision.Any): Schema.Json | undefined =>
  Match.value(decision).pipe(
    Match.tag('Classify', (found) => found.criteria),
    Match.tag('Rate', (found) => found.criteria),
    Match.tag('Probability', (found) => found.criteria),
    Match.exhaustive,
  )

const inspectionOf = (node: NodeCore): DecisionInspection =>
  new DecisionInspection({
    id: node.id,
    fingerprint: node.fingerprint,
    kind: kindOf(node.decision),
    instructions: node.decision.instructions,
    criteria: criteriaOf(node.decision),
  })

const planDecisionOf = (inspection: DecisionInspection): Record<string, Hashable> => ({
  id: inspection.id,
  fingerprint: inspection.fingerprint,
  kind: inspection.kind,
  instructions: inspection.instructions,
  criteria: inspection.criteria,
})

const planCaseOf = (item: CaseInspection): Record<string, Hashable> => ({
  id: item.id,
  pattern: item.pattern,
})

const fingerprintOf = (decisions: ReadonlyArray<DecisionInspection>, cases: ReadonlyArray<CaseInspection>): string =>
  `plan_${
    hash({
      decisions: Arr.map(decisions, planDecisionOf),
      cases: Arr.map(cases, planCaseOf),
    })
  }`

/** Compile a matcher into an inspectable semantic execution plan. */
export const compile = <I, S extends Schema.Constraint, Out, Err, Req, Flavor extends MatcherFlavor>(
  self: Matcher<I, S, Out, Err, Req, Flavor>,
): CompiledPlan => {
  const decisions = Arr.map(distinctDecisions(Arr.map(self.cases, (item) => item.pattern)), inspectionOf)
  const cases = Arr.map(self.cases, (item) => new CaseInspection({ id: item.id, pattern: item.pattern.ast }))
  return new CompiledPlan({
    version: 1,
    fingerprint: fingerprintOf(decisions, cases),
    decisions,
    cases,
    hasUncertainHandler: self.uncertainHandler !== undefined,
  })
}

/** Return the serializable representation of a compiled semantic plan. */
export const inspect = <I, S extends Schema.Constraint, Out, Err, Req, Flavor extends MatcherFlavor>(
  value: Matcher<I, S, Out, Err, Req, Flavor> | CompiledPlan,
): CompiledPlan => ('version' in value ? value : compile(value))

const specOf = <Input, S extends Schema.Constraint, Out, Err, Req, Flavor extends MatcherFlavor, Value, Err2, Req2>(
  self: Matcher<Input, S, Out, Err, Req, Flavor>,
  fallback: (input: Input) => HandlerResult<Value, Err2, Req2>,
): PolicySpec<Input, S, Out | Value, Err | Err2, Req | Req2> => ({
  schema: self.schema,
  cases: self.cases,
  uncertainHandler: self.uncertainHandler,
  fallback,
  plan: compile(self),
})

const finish = <Input, S extends Schema.Constraint, Out, Err, Req, Flavor extends MatcherFlavor, Value, Err2, Req2>(
  self: Matcher<Input, S, Out, Err, Req, Flavor>,
  fallback: (input: Input) => HandlerResult<Value, Err2, Req2>,
) =>
  Option.match(self.provided, {
    onNone: () => finishPolicy(specOf(self, fallback)),
    onSome: (input) => finishPolicy(specOf(self, fallback))(input),
  })

const Matchers = Blueprint.make<MatcherSpec, MatcherIndex>()(TypeId).operations<MatcherOps>()({
  operations: {
    when: addCase,
    onUncertain: withUncertainHandler,
    orElse: finish,
  },
  targets: {
    flavor: (self: Matcher<never>) => self.spec.flavor,
    schema: (self: Matcher<never>) => self.spec.schema,
    provided: (self: Matcher<never>) => self.spec.provided,
    cases: (self: Matcher<never>) => self.spec.cases,
    uncertainHandler: (self: Matcher<never>) => self.spec.uncertainHandler,
  },
})

/** Start a reusable semantic matcher, analogous to Effect Match.type. */
export const type = <S extends Schema.Constraint>(schema: S): Matcher<S['Type'], S> =>
  matcherOf({ flavor: 'type', schema, provided: Option.none(), cases: [], uncertainHandler: undefined })

const valueOf = <S extends Schema.Constraint>(
  schema: S,
  input: S['Type'],
): Matcher<S['Type'], S, never, never, never, 'value'> =>
  matcherOf({ flavor: 'value', schema, provided: Option.some(input), cases: [], uncertainHandler: undefined })

/** Start matching one value immediately, analogous to Effect Match.value. */
export const value: {
  <S extends Schema.Constraint>(input: S['Type']): (schema: S) => Matcher<S['Type'], S, never, never, never, 'value'>
  <S extends Schema.Constraint>(schema: S, input: S['Type']): Matcher<S['Type'], S, never, never, never, 'value'>
} = dual(2, valueOf)

/** Add an ordered semantic or deterministic case. */
export const when: {
  <PatternInput, Returned>(
    pattern: Pattern<PatternInput>,
    handler: (input: PatternInput) => Returned,
    options?: LeafOptions,
  ): <S extends Schema.Constraint, Out, Err, Req, Flavor extends MatcherFlavor>(
    self: Matcher<PatternInput, S, Out, Err, Req, Flavor>,
  ) => Matcher<
    PatternInput,
    S,
    Out | HandlerValue<Returned>,
    Err | HandlerError<Returned>,
    Req | HandlerServices<Returned>,
    Flavor
  >
  <PatternInput, Returned, S extends Schema.Constraint, Out, Err, Req, Flavor extends MatcherFlavor>(
    self: Matcher<PatternInput, S, Out, Err, Req, Flavor>,
    pattern: Pattern<PatternInput>,
    handler: (input: PatternInput) => Returned,
    options?: LeafOptions,
  ): Matcher<
    PatternInput,
    S,
    Out | HandlerValue<Returned>,
    Err | HandlerError<Returned>,
    Req | HandlerServices<Returned>,
    Flavor
  >
} = dual(
  (args: IArguments) => Matchers.is(args[0]),
  <PatternInput, Returned, S extends Schema.Constraint, Out, Err, Req, Flavor extends MatcherFlavor>(
    self: Matcher<PatternInput, S, Out, Err, Req, Flavor>,
    pattern: Pattern<PatternInput>,
    handler: (input: PatternInput) => Returned,
    options?: LeafOptions,
  ) => self.when(pattern, handler, options),
)

export const onUncertain = Matchers.operations.onUncertain

export const orElse = Matchers.operations.orElse

// -------------------------------------------------------------------------------------------------
// Exhaustive classification matching
// -------------------------------------------------------------------------------------------------

/** The data a classification match is minted from; its precise types come back from the index. */
export interface ClassificationSpec {
  readonly decision: Top
  readonly matcher: Top
}

export interface ClassificationIndex {
  readonly Input: Top
  readonly S: Schema.Constraint
  readonly Label: string
  readonly Remaining: string
  readonly Out: Top
  readonly Err: Top
  readonly Req: Top
}

type LabelOf<X> = X extends { readonly Label: infer Label extends string } ? Label : never
type RemainingOf<X> = X extends { readonly Remaining: infer Remaining extends string } ? Remaining : never

/** Handle one label of a classification match; the remaining labels shrink per case. */
export interface CaseOf extends Blueprint.Operation {
  readonly params: readonly [label: RemainingOf<this['Index']>, handler: (input: InputOf<this['Index']>) => Top]
  readonly out: ClassificationMatcher<
    InputOf<this['Index']>,
    SchemaOf<this['Index']>,
    LabelOf<this['Index']>,
    Extract<Exclude<RemainingOf<this['Index']>, this['Args'][0]>, LabelOf<this['Index']>>,
    OutOf<this['Index']> | HandlerValue<ReturnOf<this['Args'][1]>>,
    ErrOf<this['Index']> | HandlerError<ReturnOf<this['Args'][1]>>,
    ReqOf<this['Index']> | HandlerServices<ReturnOf<this['Args'][1]>>
  >
}

export interface ClassificationDecisionTarget extends Blueprint.Target {
  readonly target: ClassifyDecision<InputOf<this['Index']>, LabelOf<this['Index']>, SchemaOf<this['Index']>>
}

export interface ClassificationMatcherTarget extends Blueprint.Target {
  readonly target: Matcher<
    InputOf<this['Index']>,
    SchemaOf<this['Index']>,
    OutOf<this['Index']>,
    ErrOf<this['Index']>,
    ReqOf<this['Index']>,
    'type'
  >
}

export interface ClassificationOps {
  readonly caseOf: CaseOf
  readonly decision: ClassificationDecisionTarget
  readonly matcher: ClassificationMatcherTarget
}

/** An in-progress match over the labels of one schema-scoped classification decision. */
export type ClassificationMatcher<
  Input,
  S extends Schema.Constraint,
  Label extends string,
  Remaining extends Label,
  Out = never,
  Err = never,
  Req = never,
> = Blueprint.Blueprint<
  TypeId,
  ClassificationSpec,
  ClassificationOps,
  {
    readonly Input: Input
    readonly S: S
    readonly Label: Label
    readonly Remaining: Remaining
    readonly Out: Out
    readonly Err: Err
    readonly Req: Req
  }
>

const classificationOf = <
  Input,
  S extends Schema.Constraint,
  Label extends string,
  Remaining extends Label,
  Out,
  Err,
  Req,
>(spec: {
  readonly decision: ClassifyDecision<Input, Label, S>
  readonly matcher: Matcher<Input, S, Out, Err, Req, 'type'>
}): ClassificationMatcher<Input, S, Label, Remaining, Out, Err, Req> =>
  Classifications.of<
    {
      readonly Input: Input
      readonly S: S
      readonly Label: Label
      readonly Remaining: Remaining
      readonly Out: Out
      readonly Err: Err
      readonly Req: Req
    }
  >(spec)

const addLabel = <
  Input,
  S extends Schema.Constraint,
  Label extends string,
  Remaining extends Label,
  Out,
  Err,
  Req,
  Value,
  Err2,
  Req2,
>(
  self: ClassificationMatcher<Input, S, Label, Remaining, Out, Err, Req>,
  label: Label,
  handler: (input: Input) => HandlerResult<Value, Err2, Req2>,
): ClassificationMatcher<Input, S, Label, Exclude<Remaining, Label>, Out | Value, Err | Err2, Req | Req2> =>
  classificationOf<Input, S, Label, Exclude<Remaining, Label>, Out | Value, Err | Err2, Req | Req2>({
    decision: self.decision,
    matcher: addCase(self.matcher, self.decision.is(label), handler, { id: `case_${label}` }),
  })

const Classifications = Blueprint.make<ClassificationSpec, ClassificationIndex>()(TypeId).operations<
  ClassificationOps
>()({
  operations: { caseOf: addLabel },
  targets: {
    decision: (self: ClassificationMatcher<never, Schema.Constraint, string, string>) => self.spec.decision,
    matcher: (self: ClassificationMatcher<never, Schema.Constraint, string, string>) => self.spec.matcher,
  },
})

/** Match exhaustively over the labels of one schema-scoped classification decision. */
export const match = <S extends Schema.Constraint, Label extends string>(
  decision: ClassifyDecision<S['Type'], Label, S>,
): ClassificationMatcher<S['Type'], S, Label, Label> =>
  classificationOf<S['Type'], S, Label, Label, never, never, never>({ decision, matcher: type(decision.schema) })

/** Handle one label of a classification match; the remaining labels shrink per case. */
export const caseOf: {
  <const Label extends string, Input, Returned>(
    label: Label,
    handler: (input: Input) => Returned,
  ): <S extends Schema.Constraint, All extends string, Remaining extends All, Out, Err, Req>(
    self: [Label] extends [Remaining] ? ClassificationMatcher<Input, S, All, Remaining, Out, Err, Req> : never,
  ) => ClassificationMatcher<
    Input,
    S,
    All,
    Exclude<Remaining, Label>,
    Out | HandlerValue<Returned>,
    Err | HandlerError<Returned>,
    Req | HandlerServices<Returned>
  >
  <
    const Label extends string,
    Input,
    Returned,
    S extends Schema.Constraint,
    All extends string,
    Remaining extends All,
    Out,
    Err,
    Req,
  >(
    self: [Label] extends [Remaining] ? ClassificationMatcher<Input, S, All, Remaining, Out, Err, Req> : never,
    label: Label,
    handler: (input: Input) => Returned,
  ): ClassificationMatcher<
    Input,
    S,
    All,
    Exclude<Remaining, Label>,
    Out | HandlerValue<Returned>,
    Err | HandlerError<Returned>,
    Req | HandlerServices<Returned>
  >
} = dual(
  3,
  <Input, S extends Schema.Constraint, All extends string, Remaining extends All, Out, Err, Req, Returned>(
    self: ClassificationMatcher<Input, S, All, Remaining, Out, Err, Req>,
    label: Remaining,
    handler: (input: Input) => Returned,
  ) => self.caseOf(label, handler),
)

export { caseOf as case }

/** Finish only when every classification label has a handler. */
export const exhaustive = <S extends Schema.Constraint, All extends string, Out, Err, Req>(
  self: ClassificationMatcher<S['Type'], S, All, never, Out, Err, Req>,
): Policy<S['Type'], Out, Err | ExhaustiveMatchError, Req, S> =>
  self.matcher.orElse(() => Effect.fail(new ExhaustiveMatchError({})))
