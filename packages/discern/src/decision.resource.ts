/**
 * Decision nodes: a named semantic question bound to the input it is asked
 * about.
 *
 * A node wraps one Effect `Decision` and interprets its validated answer as a
 * pattern. The interpretation is always decoded through a per-node answer
 * check built at construction, so a missing or malformed answer resolves the
 * leaf to `Uncertain` naming the decision id instead of reaching the caller.
 * Judging an answer against a threshold, band, label, or range is pure
 * resource code (KD7) — never a workflow.
 */
import { Array as Arr, Match, Schema } from 'effect'
import * as Effect from 'effect/Effect'
import { dual } from 'effect/Function'
import * as Option from 'effect/Option'
import type * as AiError from 'effect/unstable/ai/AiError'
import * as Decision from 'effect/unstable/ai/Decision'
import * as DecisionModel from 'effect/unstable/ai/DecisionModel'
import { decisionFingerprint, hash } from './decision-model.resource.js'
import { InvalidThresholdError } from './DiscernError.schema.js'
import type { Answers, DecisionNode, LeafOptions, NodeCore, Pattern, Top } from './pattern.resource.js'
import { matched, missed, semanticLeaf, uncertain } from './pattern.resource.js'
import type { PatternResult } from './Verdict.schema.js'

/** Any Effect decision kind. */
export type AnyDecision = Decision.Any

/** The validated answer a decision of kind `D` produces. */
export type Answer<D extends AnyDecision> = Decision.Answer<D>

/** A reader that recovers one node's own typed answer from a batch. */
export type AnswerReader<D extends AnyDecision> = (answers: Answers) => Option.Option<Answer<D>>

type AnswerGuard<D extends AnyDecision> = (input: Answer<AnyDecision>) => input is Answer<D>

const asAnyDecision = <D extends AnyDecision>(decision: D): Decision.Any => decision

/**
 * The per-node answer check for one decision kind. The check decodes the batch
 * entry through the node's own answer shape and confirms the answer belongs to
 * the decision's own labels, so an entry from a sibling decision can never be
 * mistaken for this node's. Individual probability keys may be sparse; every
 * read of a probability defaults it to zero, which is the contract the
 * reference established.
 */
const answerCheckOf = <D extends AnyDecision>(decision: D): AnswerGuard<D> => {
  const classifyDecode = Schema.decodeUnknownOption(Schema.Struct({
    label: Schema.String,
    probabilities: Schema.Record(Schema.String, Schema.Finite),
    confidence: Schema.optional(Schema.Finite),
  }))
  const rateDecode = Schema.decodeUnknownOption(Schema.Struct({
    rating: Schema.Finite,
    label: Schema.String,
    probabilities: Schema.Record(Schema.String, Schema.Finite),
    confidence: Schema.optional(Schema.Finite),
  }))
  const probabilityDecode = Schema.decodeUnknownOption(Schema.Struct({ probability: Schema.Finite }))
  return Match.value(asAnyDecision(decision)).pipe(
    Match.tag('Classify', (classified): AnswerGuard<D> => {
      const labels = Object.keys(classified.criteria)
      return (input): input is Answer<D> =>
        Option.match(classifyDecode(input), {
          onNone: () => false,
          onSome: (answer) => Arr.contains(labels, answer.label),
        })
    }),
    Match.tag('Rate', (rated): AnswerGuard<D> => (input): input is Answer<D> =>
      Option.match(rateDecode(input), {
        onNone: () => false,
        onSome: (answer) => Arr.contains(rated.criteria, answer.label),
      })),
    Match.tag(
      'Probability',
      (): AnswerGuard<D> => (input): input is Answer<D> => Option.isSome(probabilityDecode(input)),
    ),
    Match.exhaustive,
  )
}

/** Recover one node's own typed answer from a batch, or nothing. */
const answerReaderOf = <D extends AnyDecision>(decisionId: string, decision: D): AnswerReader<D> => {
  const isAnswer = answerCheckOf(decision)
  return (answers) => Option.filter(Option.fromNullishOr(answers[decisionId]), isAnswer)
}

const missingAnswer = (decisionId: string): PatternResult => uncertain(`no answer for decision "${decisionId}"`)

const leafDescriptionOf = (description: string | undefined): string => description ?? 'custom'

const derivedLeafId = (node: NodeCore, description: string | undefined): string =>
  `p_${hash({ node: node.id, description: leafDescriptionOf(description) })}`

/** The leaf id for a node interpretation, stable per node id and description. */
const leafId = (explicit: string | undefined, node: NodeCore, description: string | undefined): string =>
  explicit ?? derivedLeafId(node, description)

const whereLeaf = <Input, D extends AnyDecision>(
  node: NodeCore,
  decisionId: string,
  readAnswer: AnswerReader<D>,
  resolve: (answer: Answer<D>) => PatternResult,
  options?: LeafOptions,
): Pattern<Input> => {
  const opts: LeafOptions = options ?? {}
  return semanticLeaf<Input>(node, {
    id: leafId(opts.id, node, opts.description),
    description: opts.description,
    resolve: (answers) =>
      Option.match(readAnswer(answers), {
        onNone: () => missingAnswer(decisionId),
        onSome: resolve,
      }),
  })
}

/** Options for wrapping a decision without an input schema. */
export interface DecisionOptions {
  readonly id?: string | undefined
}

const judgeOfPredicate = <D extends AnyDecision>(
  predicate: (answer: Answer<D>) => boolean,
): (answer: Answer<D>) => PatternResult => {
  const judge = (answer: Answer<D>): PatternResult => (predicate(answer) ? matched() : missed())
  return judge
}

const makeDecisionNode = <Input, D extends AnyDecision, S extends Schema.Constraint | undefined>(
  value: D,
  schema: S,
  explicitId: string | undefined,
): DecisionNode<Input, D, S> => {
  const fingerprint = decisionFingerprint(value)
  const id = explicitId ?? `d_${fingerprint.slice(3)}`
  const readAnswer = answerReaderOf(id, value)
  const node: DecisionNode<Input, D, S> = {
    id,
    fingerprint,
    decision: value,
    schema,
    where: (predicate, options) => whereLeaf<Input, D>(node, id, readAnswer, judgeOfPredicate(predicate), options),
    whereResult: (resolve, options) => whereLeaf<Input, D>(node, id, readAnswer, resolve, options),
  }
  return node
}

/** Wrap an Effect Decision. Supply a schema to make it executable on its own. */
export const decision: {
  <D extends AnyDecision>(options?: DecisionOptions): (value: D) => DecisionNode<Top, D>
  <D extends AnyDecision>(value: D, options?: DecisionOptions): DecisionNode<Top, D>
} = dual(
  (args: IArguments) => 'instructions' in args[0],
  <D extends AnyDecision>(value: D, options?: DecisionOptions): DecisionNode<Top, D> => {
    const opts: DecisionOptions = options ?? {}
    return makeDecisionNode<Top, D, undefined>(value, undefined, opts.id)
  },
)

// -------------------------------------------------------------------------------------------------
// Classification
// -------------------------------------------------------------------------------------------------

/** Confidence thresholds for a classification match. */
export interface ClassifyThresholds {
  /** Probability at or above which the requested label is a match. */
  readonly match?: number | undefined
  /** Probability at or below which the requested label is a miss. Between miss and match is uncertain. */
  readonly miss?: number | undefined
  /** Optional minimum margin over the runner-up label before matching. */
  readonly margin?: number | undefined
}

/** A semantic classification decision. */
export interface ClassifyDecision<
  Input = unknown,
  Label extends string = string,
  S extends Schema.Constraint | undefined = undefined,
> extends DecisionNode<Input, Decision.Classify<Label>, S> {
  readonly labels: ReadonlyArray<string>
  readonly is: (label: Label, thresholds?: ClassifyThresholds) => Pattern<Input>
  readonly oneOf: (...labels: ReadonlyArray<Label>) => Pattern<Input>
  readonly not: (label: Label) => Pattern<Input>
  readonly margin: (label: Label, over: Label, by: number) => Pattern<Input>
}

/** Options for building a classification decision. */
export interface ClassifyOptions<Label extends string> {
  readonly id?: string | undefined
  readonly instructions: string
  readonly criteria: { readonly [L in Label]: string }
}

const matchAtOf = (limits: ClassifyThresholds): number => limits.match ?? 0.8

const missAtOf = (limits: ClassifyThresholds): number => limits.miss ?? matchAtOf(limits)

const throwThreshold = (threshold: string, value: number, limit: number, message: string): never => {
  throw new InvalidThresholdError({ threshold, value, limit, message })
}

const validateThresholds = (limits: ClassifyThresholds): void => {
  if (missAtOf(limits) > matchAtOf(limits)) {
    throwThreshold('miss', missAtOf(limits), matchAtOf(limits), 'Classify threshold `miss` must be <= `match`')
  }
}

const probabilityOf = <L extends string>(
  answer: Decision.Answer<Decision.Classify<L>>,
  label: L,
): number => answer.probabilities[label] ?? 0

const runnerUpOf = <L extends string>(
  answer: Decision.Answer<Decision.Classify<L>>,
  labels: ReadonlyArray<string>,
  label: L,
): number =>
  Math.max(
    0,
    ...Arr.map(
      Arr.filter(labels, (candidate) => candidate !== label),
      (candidate) => probabilityOf(answer, candidate),
    ),
  )

/** How a tri-state judgement resolves from a hit and a miss bound. */
const hitMissKindOf = (hit: boolean, miss: boolean): 'matched' | 'missed' | 'uncertain' =>
  Match.value(hit).pipe(
    Match.when(true, () => 'matched' as const),
    Match.when(false, () =>
      Match.value(miss).pipe(
        Match.when(true, () => 'missed' as const),
        Match.when(false, () => 'uncertain' as const),
        Match.exhaustive,
      )),
    Match.exhaustive,
  )

const marginSatisfiedOf = <L extends string>(
  answer: Decision.Answer<Decision.Classify<L>>,
  labels: ReadonlyArray<string>,
  label: L,
  limits: ClassifyThresholds,
): boolean =>
  limits.margin === undefined ||
  probabilityOf(answer, label) - runnerUpOf(answer, labels, label) >= limits.margin

const classifyVerdictOf = <L extends string>(
  answer: Decision.Answer<Decision.Classify<L>>,
  labels: ReadonlyArray<string>,
  label: L,
  limits: ClassifyThresholds,
): PatternResult => {
  const probability = probabilityOf(answer, label)
  const matchAt = matchAtOf(limits)
  const missAt = missAtOf(limits)
  const reason = `${label}=${probability.toFixed(3)}`
  return Match.value(
    hitMissKindOf(probability >= matchAt && marginSatisfiedOf(answer, labels, label, limits), probability <= missAt),
  ).pipe(
    Match.when('matched', () => matched(reason)),
    Match.when('missed', () => missed(reason)),
    Match.when('uncertain', () => uncertain(`${reason} is between ${missAt} and ${matchAt}`)),
    Match.exhaustive,
  )
}

const thresholdLeaf = <Input, Label extends string, S extends Schema.Constraint | undefined>(
  node: DecisionNode<Input, Decision.Classify<Label>, S>,
  labels: ReadonlyArray<string>,
  label: Label,
  limits: ClassifyThresholds,
): Pattern<Input> => {
  validateThresholds(limits)
  return node.whereResult(
    (answer) => classifyVerdictOf(answer, labels, label, limits),
    { description: `${node.id} is ${label} with confidence thresholds` },
  )
}

const classifyIs = <Input, Label extends string, S extends Schema.Constraint | undefined>(
  node: DecisionNode<Input, Decision.Classify<Label>, S>,
  labels: ReadonlyArray<string>,
  label: Label,
  thresholds: ClassifyThresholds | undefined,
): Pattern<Input> =>
  thresholds === undefined
    ? node.where((answer) => answer.label === label, { description: `${node.id} is ${label}` })
    : thresholdLeaf(node, labels, label, thresholds)

const classifyFor = <Input, Label extends string, S extends Schema.Constraint | undefined>(
  options: ClassifyOptions<Label>,
  schema: S,
): ClassifyDecision<Input, Label, S> => {
  const { id, ...definition } = options
  const node = makeDecisionNode<Input, Decision.Classify<Label>, S>(Decision.classify(definition), schema, id)
  const labels: ReadonlyArray<string> = Object.keys(options.criteria)
  return Object.assign(node, {
    labels,
    is: (label: Label, thresholds?: ClassifyThresholds) => classifyIs(node, labels, label, thresholds),
    oneOf: (...wanted: ReadonlyArray<Label>) =>
      node.where((answer) => Arr.contains(wanted, answer.label), {
        description: `${node.id} in [${wanted.join(', ')}]`,
      }),
    not: (label: Label) =>
      node.where((answer) => answer.label !== label, { description: `${node.id} is not ${label}` }),
    margin: (label: Label, over: Label, by: number) =>
      node.where(
        (answer) => probabilityOf(answer, label) - probabilityOf(answer, over) >= by,
        { description: `${node.id}: ${label} leads ${over} by ${by}` },
      ),
  })
}

/** Create an unscoped semantic classification. */
export const classify = <Label extends string>(options: ClassifyOptions<Label>): ClassifyDecision<Top, Label> =>
  classifyFor<Top, Label, undefined>(options, undefined)

// -------------------------------------------------------------------------------------------------
// Probability
// -------------------------------------------------------------------------------------------------

/** A band of probabilities: at or above `match` is a match, at or below `miss` is a miss. */
export interface ProbabilityBand {
  readonly match: number
  readonly miss: number
}

/** Optional miss bounds for a one-sided probability comparison. */
export interface BandOptions {
  readonly missBelow?: number | undefined
  readonly missAbove?: number | undefined
}

/** A semantic probability estimate. */
export interface ProbabilityDecision<Input = unknown, S extends Schema.Constraint | undefined = undefined>
  extends DecisionNode<Input, Decision.Probability, S>
{
  readonly above: (threshold: number, options?: BandOptions) => Pattern<Input>
  readonly atLeast: (threshold: number, options?: BandOptions) => Pattern<Input>
  readonly below: (threshold: number, options?: BandOptions) => Pattern<Input>
  readonly atMost: (threshold: number, options?: BandOptions) => Pattern<Input>
  readonly between: (low: number, high: number) => Pattern<Input>
  readonly band: (band: ProbabilityBand) => Pattern<Input>
}

/** Options for building a probability decision. */
export interface ProbabilityOptions {
  readonly id?: string | undefined
  readonly instructions: string
  readonly criteria?: { readonly false: string; readonly true: string } | undefined
}

/**
 * Labels a probability decision carries when the caller names none. A
 * `Decision.Probability` names both outcomes, and the decision reaches the
 * provider unencoded, so the field must always be present.
 */
const defaultProbabilityCriteria = { false: 'false', true: 'true' } as const

const probabilityReasonOf = (probability: number): string => `p=${probability.toFixed(3)}`

const missOf = (bound: number | undefined, threshold: number): number => bound ?? threshold

const missBelowOf = (options: BandOptions | undefined, threshold: number): number =>
  missOf(options?.missBelow, threshold)

const missAboveOf = (options: BandOptions | undefined, threshold: number): number =>
  missOf(options?.missAbove, threshold)

const aboveVerdictOf = (probability: number, threshold: number, inclusive: boolean, missAt: number): PatternResult => {
  const reason = probabilityReasonOf(probability)
  const hit = inclusive ? probability >= threshold : probability > threshold
  return Match.value(hitMissKindOf(hit, probability <= missAt)).pipe(
    Match.when('matched', () => matched(reason)),
    Match.when('missed', () => missed(reason)),
    Match.when('uncertain', () => uncertain(`${reason} is between ${missAt} and ${threshold}`)),
    Match.exhaustive,
  )
}

const belowVerdictOf = (probability: number, threshold: number, inclusive: boolean, missAt: number): PatternResult => {
  const reason = probabilityReasonOf(probability)
  const hit = inclusive ? probability <= threshold : probability < threshold
  return Match.value(hitMissKindOf(hit, probability >= missAt)).pipe(
    Match.when('matched', () => matched(reason)),
    Match.when('missed', () => missed(reason)),
    Match.when('uncertain', () => uncertain(`${reason} is between ${threshold} and ${missAt}`)),
    Match.exhaustive,
  )
}

const aboveLeaf = <Input, S extends Schema.Constraint | undefined>(
  node: DecisionNode<Input, Decision.Probability, S>,
  threshold: number,
  inclusive: boolean,
  missAt: number,
): Pattern<Input> =>
  node.whereResult(
    (answer) => aboveVerdictOf(answer.probability, threshold, inclusive, missAt),
    { description: `${node.id} ${inclusive ? '>=' : '>'} ${threshold}` },
  )

const belowLeaf = <Input, S extends Schema.Constraint | undefined>(
  node: DecisionNode<Input, Decision.Probability, S>,
  threshold: number,
  inclusive: boolean,
  missAt: number,
): Pattern<Input> =>
  node.whereResult(
    (answer) => belowVerdictOf(answer.probability, threshold, inclusive, missAt),
    { description: `${node.id} ${inclusive ? '<=' : '<'} ${threshold}` },
  )

const probabilityFor = <Input, S extends Schema.Constraint | undefined>(
  options: ProbabilityOptions,
  schema: S,
): ProbabilityDecision<Input, S> => {
  const { id, ...definition } = options
  const criteria = definition.criteria ?? defaultProbabilityCriteria
  const node = makeDecisionNode<Input, Decision.Probability, S>(
    Decision.probability({ instructions: definition.instructions, criteria }),
    schema,
    id,
  )
  return Object.assign(node, {
    above: (threshold: number, options?: BandOptions) =>
      aboveLeaf(node, threshold, false, missBelowOf(options, threshold)),
    atLeast: (threshold: number, options?: BandOptions) =>
      aboveLeaf(node, threshold, true, missBelowOf(options, threshold)),
    below: (threshold: number, options?: BandOptions) =>
      belowLeaf(node, threshold, false, missAboveOf(options, threshold)),
    atMost: (threshold: number, options?: BandOptions) =>
      belowLeaf(node, threshold, true, missAboveOf(options, threshold)),
    between: (low: number, high: number) =>
      node.where((answer) => answer.probability >= low && answer.probability <= high, {
        description: `${node.id} between ${low} and ${high}`,
      }),
    band: (band: ProbabilityBand) => {
      if (band.miss > band.match) {
        throwThreshold('miss', band.miss, band.match, 'Probability band `miss` must be <= `match`')
      }
      return aboveLeaf(node, band.match, true, band.miss)
    },
  })
}

/** Create an unscoped semantic probability estimate. */
export const probability = (options: ProbabilityOptions): ProbabilityDecision<Top> =>
  probabilityFor<Top, undefined>(options, undefined)

// -------------------------------------------------------------------------------------------------
// Ordered rating
// -------------------------------------------------------------------------------------------------

/** A semantic ordered rating. */
export interface RateDecision<
  Input = unknown,
  Level extends string = string,
  S extends Schema.Constraint | undefined = undefined,
> extends DecisionNode<Input, Decision.Rate<Level>, S> {
  readonly levels: ReadonlyArray<Level>
  readonly is: (level: Level) => Pattern<Input>
  readonly atLeast: (level: Level) => Pattern<Input>
  readonly atMost: (level: Level) => Pattern<Input>
  readonly between: (low: Level, high: Level) => Pattern<Input>
}

/** Options for building an ordered rating decision. */
export interface RateOptions<Level extends string> {
  readonly id?: string | undefined
  readonly instructions: string
  readonly criteria: ReadonlyArray<Level>
}

const rateFor = <Input, const Level extends string, S extends Schema.Constraint | undefined>(
  options: RateOptions<Level>,
  schema: S,
): RateDecision<Input, Level, S> => {
  const { id, ...definition } = options
  const node = makeDecisionNode<Input, Decision.Rate<Level>, S>(Decision.rate(definition), schema, id)
  const indexOf = (level: Level): number => options.criteria.indexOf(level)
  return Object.assign(node, {
    levels: options.criteria,
    is: (level: Level) => node.where((answer) => answer.label === level, { description: `${node.id} is ${level}` }),
    atLeast: (level: Level) =>
      node.where((answer) => answer.rating >= indexOf(level), { description: `${node.id} >= ${level}` }),
    atMost: (level: Level) =>
      node.where((answer) => answer.rating <= indexOf(level), { description: `${node.id} <= ${level}` }),
    between: (low: Level, high: Level) =>
      node.where(
        (answer) => answer.rating >= indexOf(low) && answer.rating <= indexOf(high),
        { description: `${node.id} between ${low} and ${high}` },
      ),
  })
}

/** Create an unscoped semantic ordered rating. */
export const rate = <const Level extends string>(options: RateOptions<Level>): RateDecision<Top, Level> =>
  rateFor<Top, Level, undefined>(options, undefined)

// -------------------------------------------------------------------------------------------------
// Input-aware scopes
// -------------------------------------------------------------------------------------------------

/** Semantic decision constructors bound to one input schema. */
export interface DecisionScope<S extends Schema.Constraint> {
  readonly schema: S
  readonly classify: <Label extends string>(options: ClassifyOptions<Label>) => ClassifyDecision<S['Type'], Label, S>
  readonly probability: (options: ProbabilityOptions) => ProbabilityDecision<S['Type'], S>
  readonly rate: <const Level extends string>(options: RateOptions<Level>) => RateDecision<S['Type'], Level, S>
}

/** Bind semantic decision constructors to one input schema. */
export const on = <S extends Schema.Constraint>(schema: S): DecisionScope<S> => ({
  schema,
  classify: <Label extends string>(options: ClassifyOptions<Label>) =>
    classifyFor<S['Type'], Label, S>(options, schema),
  probability: (options: ProbabilityOptions) => probabilityFor<S['Type'], S>(options, schema),
  rate: <const Level extends string>(options: RateOptions<Level>) => rateFor<S['Type'], Level, S>(options, schema),
})

// -------------------------------------------------------------------------------------------------
// Observation
// -------------------------------------------------------------------------------------------------

const decisionRecordOf = (nodes: ReadonlyArray<NodeCore>): Record<string, Decision.Any> => {
  const decisions: Record<string, Decision.Any> = {}
  for (const node of nodes) decisions[node.id] = node.decision
  return decisions
}

/**
 * Ask the model about exactly the decisions `nodes` name, in one batch.
 * Deterministic work that a pattern's structure already settled needs no
 * observation at all, so an empty batch answers without reaching a model.
 */
export const observe: {
  <S extends Schema.Constraint>(
    nodes: ReadonlyArray<NodeCore>,
    input: S['Type'],
  ): (schema: S) => Effect.Effect<Answers, AiError.AiError, DecisionModel.DecisionModel | S['EncodingServices']>
  <S extends Schema.Constraint>(
    schema: S,
    nodes: ReadonlyArray<NodeCore>,
    input: S['Type'],
  ): Effect.Effect<Answers, AiError.AiError, DecisionModel.DecisionModel | S['EncodingServices']>
} = dual(
  3,
  <S extends Schema.Constraint>(
    schema: S,
    nodes: ReadonlyArray<NodeCore>,
    input: S['Type'],
  ): Effect.Effect<Answers, AiError.AiError, DecisionModel.DecisionModel | S['EncodingServices']> => {
    if (nodes.length === 0) return Effect.succeed({})
    return Effect.map(
      DecisionModel.decide(Decision.make({ input: schema, decisions: decisionRecordOf(nodes) }), { input }),
      (response) => response.answers,
    )
  },
)

/**
 * Ask one schema-scoped decision about one input, outside any matcher.
 *
 * Useful when you want the raw semantic answer rather than a branch — routing
 * over a distribution, for instance. Only nodes created through
 * {@link on} carry a schema, so the type refuses unscoped decisions.
 */
export const ask: {
  <D extends AnyDecision, S extends Schema.Constraint>(
    input: S['Type'],
  ): (
    node: DecisionNode<S['Type'], D, S>,
  ) => Effect.Effect<Answer<D>, AiError.AiError, DecisionModel.DecisionModel | S['EncodingServices']>
  <D extends AnyDecision, S extends Schema.Constraint>(
    node: DecisionNode<S['Type'], D, S>,
    input: S['Type'],
  ): Effect.Effect<Answer<D>, AiError.AiError, DecisionModel.DecisionModel | S['EncodingServices']>
} = dual(
  2,
  <D extends AnyDecision, S extends Schema.Constraint>(
    node: DecisionNode<S['Type'], D, S>,
    input: S['Type'],
  ): Effect.Effect<Answer<D>, AiError.AiError, DecisionModel.DecisionModel | S['EncodingServices']> =>
    Effect.map(
      observe(node.schema, [node], input),
      (answers) => Option.getOrThrow(answerReaderOf(node.id, node.decision)(answers)),
    ),
)
