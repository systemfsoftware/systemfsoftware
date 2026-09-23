/**
 * The matcher builder: an ordered set of semantic rules over one input, with a
 * fallback. Combinators carry full dual parity — method chaining and
 * `pipe(...)` compose identically — and a compiled matcher is an inspectable
 * plan, stable for stable decision ids.
 */
import { Array as Arr, Effect, Match, Option } from 'effect'
import { dual } from 'effect/Function'
import type { Pipeable } from 'effect/Pipeable'
import { Prototype } from 'effect/Pipeable'
import type * as Schema from 'effect/Schema'
import type * as AiError from 'effect/unstable/ai/AiError'
import type * as Decision from 'effect/unstable/ai/Decision'
import type * as DecisionModel from 'effect/unstable/ai/DecisionModel'
import type { Hashable } from './decision-model.resource.js'
import { hash } from './decision-model.resource.js'
import type { ClassifyDecision } from './decision.resource.js'
import { ExhaustiveMatchError } from './DiscernError.schema.js'
import { UncertainMatchError } from './DiscernError.schema.js'
import { CaseInspection, CompiledPlan, DecisionInspection } from './Inspection.schema.js'
import type { HandlerResult, LeafOptions, NodeCore, Pattern, Top, UncertainContext } from './pattern.resource.js'
import { distinctDecisions } from './pattern.resource.js'
import { finishPolicy } from './run-policy.cell.js'
import type { Policy, PolicyCase, PolicyRun, PolicySpec, UncertainHandler } from './run-policy.cell.js'

/** The two ways a matcher can be started: reusable over a schema, or over one value. */
export type MatcherFlavor = 'type' | 'value'

const MatcherTypeId: unique symbol = Symbol.for('@systemfsoftware/discern/Matcher')

/** The value a handler contributes: an Effect's success, or the returned value itself. */
type HandlerValue<H> = H extends (input: never) => infer Returned
  ? [Returned] extends [Effect.Effect<infer Value, infer _Err, infer _Req>] ? Value : Returned
  : never

/** The error a handler contributes: an Effect's failure, or never. */
type HandlerError<H> = H extends (input: never) => infer Returned
  ? [Returned] extends [Effect.Effect<infer _Value, infer Err, infer _Req>] ? Err : never
  : never

/** The services a handler contributes: an Effect's requirements, or never. */
type HandlerServices<H> = H extends (input: never) => infer Returned
  ? [Returned] extends [Effect.Effect<infer _Value, infer _Err, infer Req>] ? Req : never
  : never

/** A reusable semantic matcher: ordered cases over one input schema, plus handlers. */
export interface Matcher<
  I,
  S extends Schema.Constraint = Schema.Constraint,
  Out = never,
  Err = never,
  Req = never,
  Flavor extends MatcherFlavor = 'type',
> extends Pipeable {
  readonly [MatcherTypeId]: typeof MatcherTypeId
  readonly flavor: Flavor
  readonly schema: S
  /** The value a `value` matcher was started with; `none` for a `type` matcher. */
  readonly provided: Option.Option<I>
  readonly cases: ReadonlyArray<PolicyCase<I, Out, Err, Req>>
  readonly uncertainHandler: UncertainHandler<I, Out, Err, Req> | undefined
}

/** Start a reusable semantic matcher, analogous to Effect Match.type. */
export const type = <S extends Schema.Constraint>(schema: S): Matcher<S['Type'], S> =>
  matcherOf(schema, 'type', Option.none())

/** Start matching one value immediately, analogous to Effect Match.value. */
export const value = <S extends Schema.Constraint>(
  schema: S,
  input: S['Type'],
): Matcher<S['Type'], S, never, never, never, 'value'> => matcherOf(schema, 'value', Option.some(input))

const matcherOf = <I, S extends Schema.Constraint, Flavor extends MatcherFlavor>(
  schema: S,
  flavor: Flavor,
  provided: Option.Option<I>,
): Matcher<I, S, never, never, never, Flavor> => ({
  [MatcherTypeId]: MatcherTypeId,
  flavor,
  schema,
  provided,
  cases: [],
  uncertainHandler: undefined,
  ...Prototype,
})

const explicitCaseId = (options: LeafOptions | undefined): string | undefined => options?.id

const caseIdOf = (options: LeafOptions | undefined, index: number): string => explicitCaseId(options) ?? `case_${index}`

const addCase = <
  I extends PatternInput,
  S extends Schema.Constraint,
  Out,
  Err,
  Req,
  Flavor extends MatcherFlavor,
  PatternInput,
  Value,
  Err2,
  Req2,
>(
  self: Matcher<I, S, Out, Err, Req, Flavor>,
  pattern: Pattern<PatternInput>,
  handler: (input: PatternInput) => HandlerResult<Value, Err2, Req2>,
  options: LeafOptions | undefined,
): Matcher<I, S, Out | Value, Err | Err2, Req | Req2, Flavor> => ({
  ...self,
  cases: [...self.cases, { id: caseIdOf(options, self.cases.length), pattern, run: handler }],
})

/** Add an ordered semantic or deterministic case. */
export const when: {
  <PatternInput, H extends (input: PatternInput) => HandlerResult<Top, Top, Top>>(
    pattern: Pattern<PatternInput>,
    handler: H,
    options?: LeafOptions,
  ): <S extends Schema.Constraint, Out, Err, Req, Flavor extends MatcherFlavor>(
    self: Matcher<PatternInput, S, Out, Err, Req, Flavor>,
  ) => Matcher<
    PatternInput,
    S,
    Out | HandlerValue<H>,
    Err | HandlerError<H>,
    Req | HandlerServices<H>,
    Flavor
  >
  <
    I extends PatternInput,
    S extends Schema.Constraint,
    Out,
    Err,
    Req,
    Flavor extends MatcherFlavor,
    PatternInput,
    H extends (input: PatternInput) => HandlerResult<Top, Top, Top>,
  >(
    self: Matcher<I, S, Out, Err, Req, Flavor>,
    pattern: Pattern<PatternInput>,
    handler: H,
    options: LeafOptions,
  ): Matcher<I, S, Out | HandlerValue<H>, Err | HandlerError<H>, Req | HandlerServices<H>, Flavor>
} = dual(
  4,
  <
    I extends PatternInput,
    S extends Schema.Constraint,
    Out,
    Err,
    Req,
    Flavor extends MatcherFlavor,
    PatternInput,
    Value,
    Err2,
    Req2,
  >(
    self: Matcher<I, S, Out, Err, Req, Flavor>,
    pattern: Pattern<PatternInput>,
    handler: (input: PatternInput) => HandlerResult<Value, Err2, Req2>,
    options?: LeafOptions,
  ): Matcher<I, S, Out | Value, Err | Err2, Req | Req2, Flavor> => addCase(self, pattern, handler, options),
)

/** Handle uncertainty from the first higher-priority case that cannot be resolved confidently. */
export const onUncertain: {
  <Input, H extends (input: Input, context: UncertainContext) => HandlerResult<Top, Top, Top>>(
    handler: H,
  ): <S extends Schema.Constraint, Out, Err, Req, Flavor extends MatcherFlavor>(
    self: Matcher<Input, S, Out, Err, Req, Flavor>,
  ) => Matcher<Input, S, Out | HandlerValue<H>, Err | HandlerError<H>, Req | HandlerServices<H>, Flavor>
  <S extends Schema.Constraint, Out, Err, Req, Flavor extends MatcherFlavor, Value, Err2, Req2>(
    self: Matcher<S['Type'], S, Out, Err, Req, Flavor>,
    handler: (input: S['Type'], context: UncertainContext) => HandlerResult<Value, Err2, Req2>,
  ): Matcher<S['Type'], S, Out | Value, Err | Err2, Req | Req2, Flavor>
} = dual(
  2,
  <S extends Schema.Constraint, Out, Err, Req, Flavor extends MatcherFlavor, Value, Err2, Req2>(
    self: Matcher<S['Type'], S, Out, Err, Req, Flavor>,
    handler: (input: S['Type'], context: UncertainContext) => HandlerResult<Value, Err2, Req2>,
  ): Matcher<S['Type'], S, Out | Value, Err | Err2, Req | Req2, Flavor> => ({
    ...self,
    uncertainHandler: handler,
  }),
)

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

// -------------------------------------------------------------------------------------------------
// Finishing
// -------------------------------------------------------------------------------------------------

/**
 * What `orElse` yields: a reusable matcher becomes a callable {@link Policy};
 * a value matcher runs immediately and answers the Effect directly.
 */
export type FinishedMatcher<I, S extends Schema.Constraint, Out, Err, Req, Flavor extends MatcherFlavor> =
  Flavor extends 'type' ? Policy<I, Out, Err, Req, S>
    : Effect.Effect<
      Out,
      Err | AiError.AiError | UncertainMatchError,
      Req | DecisionModel.DecisionModel | S['EncodingServices']
    >

const specOf = <S extends Schema.Constraint, Out, Err, Req, Flavor extends MatcherFlavor, Value, Err2, Req2>(
  self: Matcher<S['Type'], S, Out, Err, Req, Flavor>,
  fallback: (input: S['Type']) => HandlerResult<Value, Err2, Req2>,
): PolicySpec<S['Type'], S, Out | Value, Err | Err2, Req | Req2> => ({
  schema: self.schema,
  cases: self.cases,
  uncertainHandler: self.uncertainHandler,
  fallback,
  plan: compile(self),
})

/** Complete the matcher with a fallback. For reusable matchers this returns a callable {@link Policy}. */
export const orElse: {
  <Input, H extends (input: Input) => HandlerResult<Top, Top, Top>>(
    fallback: H,
  ): <S extends Schema.Constraint, Out, Err, Req, Flavor extends MatcherFlavor>(
    self: Matcher<Input, S, Out, Err, Req, Flavor>,
  ) => FinishedMatcher<Input, S, Out | HandlerValue<H>, Err | HandlerError<H>, Req | HandlerServices<H>, Flavor>
  <S extends Schema.Constraint, Out, Err, Req, Flavor extends MatcherFlavor, Value, Err2, Req2>(
    self: Matcher<S['Type'], S, Out, Err, Req, Flavor>,
    fallback: (input: S['Type']) => HandlerResult<Value, Err2, Req2>,
  ):
    | Policy<S['Type'], Out | Value, Err | Err2, Req | Req2, S>
    | Effect.Effect<
      Out | Value,
      Err | Err2 | AiError.AiError | UncertainMatchError,
      Req | Req2 | DecisionModel.DecisionModel | S['EncodingServices']
    >
} = dual(
  2,
  <S extends Schema.Constraint, Out, Err, Req, Flavor extends MatcherFlavor, Value, Err2, Req2>(
    self: Matcher<S['Type'], S, Out, Err, Req, Flavor>,
    fallback: (input: S['Type']) => HandlerResult<Value, Err2, Req2>,
  ) =>
    Option.match(self.provided, {
      onNone: () => finishPolicy(specOf(self, fallback)),
      onSome: (input) => finishPolicy(specOf(self, fallback))(input),
    }),
)

export const otherwise = orElse

/** Execute an unfinished matcher explicitly while recording a trace. */
export const runWithTrace = <
  S extends Schema.Constraint,
  Out,
  Err,
  Req,
  Flavor extends MatcherFlavor,
  Value,
  Err2,
  Req2,
>(
  self: Matcher<S['Type'], S, Out, Err, Req, Flavor>,
  input: S['Type'],
  fallback: (input: S['Type']) => HandlerResult<Value, Err2, Req2>,
): Effect.Effect<
  PolicyRun<Out | Value>,
  Err | Err2 | AiError.AiError | UncertainMatchError,
  Req | Req2 | DecisionModel.DecisionModel | S['EncodingServices']
> => finishPolicy(specOf(self, fallback)).runWithTrace(input)

// -------------------------------------------------------------------------------------------------
// Exhaustive classification matching
// -------------------------------------------------------------------------------------------------

/** An in-progress match over the labels of one schema-scoped classification decision. */
export interface ClassificationMatcher<
  Input,
  S extends Schema.Constraint,
  Label extends string,
  Remaining extends Label,
  Out = never,
  Err = never,
  Req = never,
> extends Pipeable {
  readonly decision: ClassifyDecision<Input, Label, S>
  readonly matcher: Matcher<Input, S, Out, Err, Req, 'type'>
  readonly _remaining?: Remaining
}

/** Match exhaustively over the labels of one schema-scoped classification decision. */
export const match = <S extends Schema.Constraint, Label extends string>(
  decision: ClassifyDecision<S['Type'], Label, S>,
): ClassificationMatcher<S['Type'], S, Label, Label> => ({
  decision,
  matcher: type(decision.schema),
  ...Prototype,
})

/** Handle one label of a classification match; the remaining labels shrink per case. */
export const caseOf: {
  <const Label extends string, Input, H extends (input: Input) => HandlerResult<Top, Top, Top>>(
    label: Label,
    handler: H,
  ): <S extends Schema.Constraint, All extends string, Remaining extends All, Out, Err, Req>(
    self: [Label] extends [Remaining] ? ClassificationMatcher<Input, S, All, Remaining, Out, Err, Req> : never,
  ) => ClassificationMatcher<
    Input,
    S,
    All,
    Exclude<Remaining, Label>,
    Out | HandlerValue<H>,
    Err | HandlerError<H>,
    Req | HandlerServices<H>
  >
  <
    S extends Schema.Constraint,
    All extends string,
    Remaining extends All,
    Out,
    Err,
    Req,
    Label extends All,
    Value,
    Err2,
    Req2,
  >(
    self: ClassificationMatcher<S['Type'], S, All, Remaining, Out, Err, Req>,
    label: Label,
    handler: (input: S['Type']) => HandlerResult<Value, Err2, Req2>,
  ): ClassificationMatcher<S['Type'], S, All, Exclude<Remaining, Label>, Out | Value, Err | Err2, Req | Req2>
} = dual(
  3,
  <
    S extends Schema.Constraint,
    All extends string,
    Remaining extends All,
    Out,
    Err,
    Req,
    Label extends All,
    Value,
    Err2,
    Req2,
  >(
    self: ClassificationMatcher<S['Type'], S, All, Remaining, Out, Err, Req>,
    label: Label,
    handler: (input: S['Type']) => HandlerResult<Value, Err2, Req2>,
  ): ClassificationMatcher<S['Type'], S, All, Exclude<Remaining, Label>, Out | Value, Err | Err2, Req | Req2> => ({
    decision: self.decision,
    matcher: addCase(self.matcher, self.decision.is(label), handler, { id: `case_${label}` }),
    ...Prototype,
  }),
)

export { caseOf as case }

/** Finish only when every classification label has a handler. */
export const exhaustive = <S extends Schema.Constraint, All extends string, Out, Err, Req>(
  self: ClassificationMatcher<S['Type'], S, All, never, Out, Err, Req>,
): Policy<S['Type'], Out, Err | ExhaustiveMatchError, Req, S> =>
  orElse<S['Type'], (input: S['Type']) => Effect.Effect<never, ExhaustiveMatchError, never>>(
    () => Effect.fail(new ExhaustiveMatchError({})),
  )(self.matcher)
