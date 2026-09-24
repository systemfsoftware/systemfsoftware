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
import { Prototype } from 'effect/Pipeable'
import * as Result from 'effect/Result'
import * as AiError from 'effect/unstable/ai/AiError'
import * as Decision from 'effect/unstable/ai/Decision'
import * as DecisionModel from 'effect/unstable/ai/DecisionModel'
import { decisionFingerprint, hash } from './decision-model.js'
import { DecisionIdCollisionError } from './DiscernError.schema.js'
import type { Answers, DecisionNode, LeafOptions, NodeCore, Pattern, PatternRefusal } from './pattern.js'
import { distinctFirstById, matched, missed, notPattern, semanticLeaf, uncertain } from './pattern.js'
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
  return semanticLeaf<Input>({
    node,
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
    ...Prototype,
    where: (predicate, options) => whereLeaf<Input, D>(node, id, readAnswer, judgeOfPredicate(predicate), options),
    whereResult: (resolve, options) => whereLeaf<Input, D>(node, id, readAnswer, resolve, options),
  }
  return node
}

/** Wrap an Effect Decision. Supply a schema to make it executable on its own. */
export const decision: {
  <D extends AnyDecision, Input = unknown>(options?: DecisionOptions): (value: D) => DecisionNode<Input, D>
  <D extends AnyDecision, Input = unknown>(value: D, options?: DecisionOptions): DecisionNode<Input, D>
} = dual(
  (args: IArguments) => 'instructions' in args[0],
  <D extends AnyDecision, Input = unknown>(value: D, options?: DecisionOptions): DecisionNode<Input, D> => {
    const opts: DecisionOptions = options ?? {}
    return makeDecisionNode<Input, D, undefined>(value, undefined, opts.id)
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

/** The bounds a caller crossed naming classification thresholds, carried to the run that refuses them. */
const thresholdRefusalOf = (limits: ClassifyThresholds): Option.Option<PatternRefusal> =>
  missAtOf(limits) > matchAtOf(limits)
    ? Option.some({
      threshold: 'miss',
      value: missAtOf(limits),
      limit: matchAtOf(limits),
      message: `Classify threshold \`miss\` (${missAtOf(limits)}) must be <= \`match\` (${matchAtOf(limits)})`,
    })
    : Option.none()

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

const refusedLeaf = <Input, Label extends string, S extends Schema.Constraint | undefined>(
  node: DecisionNode<Input, Decision.Classify<Label>, S>,
  description: string,
  refusal: PatternRefusal,
): Pattern<Input> =>
  semanticLeaf<Input>({
    node,
    id: `p_${hash({ node: node.id, description })}`,
    description,
    resolve: () => uncertain(refusal.message),
    refusals: [refusal],
  })

const thresholdLeaf = <Input, Label extends string, S extends Schema.Constraint | undefined>(
  node: DecisionNode<Input, Decision.Classify<Label>, S>,
  labels: ReadonlyArray<string>,
  label: Label,
  limits: ClassifyThresholds,
): Pattern<Input> =>
  Option.match(thresholdRefusalOf(limits), {
    onNone: () =>
      whereResult(node, (answer) => classifyVerdictOf(answer, labels, label, limits), {
        description: `${node.id} is ${label} with confidence thresholds`,
      }),
    onSome: (refusal) => refusedLeaf(node, `${node.id} is ${label} with confidence thresholds`, refusal),
  })

const classifyIs = <Input, Label extends string, S extends Schema.Constraint | undefined>(
  node: DecisionNode<Input, Decision.Classify<Label>, S>,
  labels: ReadonlyArray<string>,
  label: Label,
  thresholds: ClassifyThresholds | undefined,
): Pattern<Input> =>
  thresholds === undefined
    ? where(node, (answer) => answer.label === label, { description: `${node.id} is ${label}` })
    : thresholdLeaf(node, labels, label, thresholds)

const classifyFor = <Input, Label extends string, S extends Schema.Constraint | undefined>(
  options: ClassifyOptions<Label>,
  schema: S,
): ClassifyDecision<Input, Label, S> => {
  const { id, ...definition } = options
  const labels: ReadonlyArray<string> = Object.keys(options.criteria)
  const self: ClassifyDecision<Input, Label, S> = Object.assign(
    makeDecisionNode<Input, Decision.Classify<Label>, S>(Decision.classify(definition), schema, id),
    {
      labels,
      is: (label: Label, thresholds?: ClassifyThresholds) => is(self, label, thresholds),
      oneOf: (...wanted: ReadonlyArray<Label>) => oneOfLeaf(self, wanted),
      not: (label: Label) => not(self, label),
      margin: (label: Label, over: Label, by: number) => margin(self, label, over, by),
    },
  )
  return self
}

/**
 * Create an unscoped semantic classification: the input stays open until the
 * decision is bound to a schema through {@link on}.
 */
export const classify = <Label extends string, Input = unknown>(
  options: ClassifyOptions<Label>,
): ClassifyDecision<Input, Label> => classifyFor<Input, Label, undefined>(options, undefined)

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
  const self: ProbabilityDecision<Input, S> = Object.assign(node, {
    above: (threshold: number, options?: BandOptions) => above(self, threshold, options),
    atLeast: (threshold: number, options?: BandOptions) => atLeast(self, threshold, options),
    below: (threshold: number, options?: BandOptions) => below(self, threshold, options),
    atMost: (threshold: number, options?: BandOptions) => atMost(self, threshold, options),
    between: (low: number, high: number) => between(self, low, high),
    band: (limits: ProbabilityBand) => band(self, limits),
  })
  return self
}

/** The bounds a caller crossed naming a probability band, carried to the run that refuses them. */
const bandRefusalOf = (limits: ProbabilityBand): Option.Option<PatternRefusal> =>
  limits.miss > limits.match
    ? Option.some({
      threshold: 'miss',
      value: limits.miss,
      limit: limits.match,
      message: `Probability band \`miss\` (${limits.miss}) must be <= \`match\` (${limits.match})`,
    })
    : Option.none()

const bandOf = <Input, S extends Schema.Constraint | undefined>(
  self: ProbabilityDecision<Input, S>,
  limits: ProbabilityBand,
): Pattern<Input> =>
  Option.match(bandRefusalOf(limits), {
    onNone: () => aboveLeaf(self, limits.match, true, limits.miss),
    onSome: (refusal) =>
      semanticLeaf<Input>({
        node: self,
        id: `p_${hash({ node: self.id, miss: limits.miss, match: limits.match })}`,
        description: `${self.id} between ${limits.miss} and ${limits.match}`,
        resolve: () => uncertain(refusal.message),
        refusals: [refusal],
      }),
  })

/** Create an unscoped semantic probability estimate: the input stays open until the decision is bound through {@link on}. */
export const probability = <Input = unknown>(options: ProbabilityOptions): ProbabilityDecision<Input> =>
  probabilityFor<Input, undefined>(options, undefined)

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
  const self: RateDecision<Input, Level, S> = Object.assign(
    makeDecisionNode<Input, Decision.Rate<Level>, S>(Decision.rate(definition), schema, id),
    {
      levels: options.criteria,
      is: (level: Level) => is(self, level),
      atLeast: (level: Level) => atLeast(self, level),
      atMost: (level: Level) => atMost(self, level),
      between: (low: Level, high: Level) => between(self, low, high),
    },
  )
  return self
}

/** Create an unscoped semantic ordered rating: the input stays open until the decision is bound through {@link on}. */
export const rate = <const Level extends string, Input = unknown>(
  options: RateOptions<Level>,
): RateDecision<Input, Level> => rateFor<Input, Level, undefined>(options, undefined)

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

const recordDecisions = (nodes: ReadonlyArray<NodeCore>): Record<string, Decision.Any> => {
  const decisions: Record<string, Decision.Any> = {}
  for (const node of nodes) decisions[node.id] = node.decision
  return decisions
}

const collidesWith = (node: NodeCore) => (other: NodeCore): boolean =>
  other.id === node.id && other.fingerprint !== node.fingerprint

/**
 * The decisions `nodes` ask for, keyed by id, refusing a repeated id whose
 * definitions differ: one decision id must mean one definition, or the
 * recorded observations of the two would be indistinguishable.
 */
const decisionsOf = (
  nodes: ReadonlyArray<NodeCore>,
): Result.Result<Record<string, Decision.Any>, DecisionIdCollisionError> =>
  Option.match(Arr.findFirst(nodes, (node) => Option.isSome(Arr.findFirst(nodes, collidesWith(node)))), {
    onSome: (node) => Result.fail(new DecisionIdCollisionError({ decisionId: node.id })),
    onNone: () => Result.succeed(recordDecisions(distinctFirstById(nodes))),
  })

/**
 * Ask the model about exactly the decisions `nodes` name, in one batch.
 * Deterministic work that a pattern's structure already settled needs no
 * observation at all, so an empty batch answers without reaching a model.
 */
export const observe: {
  <S extends Schema.Constraint>(
    nodes: ReadonlyArray<NodeCore>,
    input: S['Type'],
  ): (
    schema: S,
  ) => Effect.Effect<
    Answers,
    AiError.AiError | DecisionIdCollisionError,
    DecisionModel.DecisionModel | S['EncodingServices']
  >
  <S extends Schema.Constraint>(
    schema: S,
    nodes: ReadonlyArray<NodeCore>,
    input: S['Type'],
  ): Effect.Effect<
    Answers,
    AiError.AiError | DecisionIdCollisionError,
    DecisionModel.DecisionModel | S['EncodingServices']
  >
} = dual(
  3,
  <S extends Schema.Constraint>(
    schema: S,
    nodes: ReadonlyArray<NodeCore>,
    input: S['Type'],
  ): Effect.Effect<
    Answers,
    AiError.AiError | DecisionIdCollisionError,
    DecisionModel.DecisionModel | S['EncodingServices']
  > => {
    if (nodes.length === 0) return Effect.succeed({})
    return Effect.flatMap(
      Effect.sync(() => decisionsOf(nodes)),
      (recorded): Effect.Effect<
        Answers,
        AiError.AiError | DecisionIdCollisionError,
        DecisionModel.DecisionModel | S['EncodingServices']
      > =>
        Result.match(recorded, {
          onFailure: (collision) => Effect.fail(collision),
          onSuccess: (decisions) =>
            Effect.map(
              DecisionModel.decide(Decision.make({ input: schema, decisions }), { input }),
              (response) => response.answers,
            ),
        }),
    )
  },
)

const unusableAnswer = (decisionId: string): AiError.AiError =>
  AiError.make({
    module: 'DecisionModel',
    method: 'decide',
    reason: new AiError.InvalidOutputError({
      description: `Provider returned no answer that decision "${decisionId}" accepts`,
    }),
  })

/**
 * Ask one schema-scoped decision about one input, outside any matcher.
 *
 * Useful when you want the raw semantic answer rather than a branch — routing
 * over a distribution, for instance. An answer the node's own check refuses is
 * the provider returning an unusable answer, so the ask fails with the
 * `InvalidOutputError` family DecisionModel itself raises, naming the decision.
 * Only nodes created through {@link on} carry a schema, so the type refuses
 * unscoped decisions.
 */
export const ask: {
  <D extends AnyDecision, S extends Schema.Constraint>(
    input: S['Type'],
  ): (
    node: DecisionNode<S['Type'], D, S>,
  ) => Effect.Effect<
    Answer<D>,
    AiError.AiError | DecisionIdCollisionError,
    DecisionModel.DecisionModel | S['EncodingServices']
  >
  <D extends AnyDecision, S extends Schema.Constraint>(
    node: DecisionNode<S['Type'], D, S>,
    input: S['Type'],
  ): Effect.Effect<
    Answer<D>,
    AiError.AiError | DecisionIdCollisionError,
    DecisionModel.DecisionModel | S['EncodingServices']
  >
} = dual(
  2,
  <D extends AnyDecision, S extends Schema.Constraint>(
    node: DecisionNode<S['Type'], D, S>,
    input: S['Type'],
  ): Effect.Effect<
    Answer<D>,
    AiError.AiError | DecisionIdCollisionError,
    DecisionModel.DecisionModel | S['EncodingServices']
  > =>
    Effect.flatMap(
      observe(node.schema, [node], input),
      (answers) => Effect.fromOption(answerReaderOf(node.id, node.decision)(answers), () => unusableAnswer(node.id)),
    ),
)

// -------------------------------------------------------------------------------------------------
// Dual counterparts
//
// Every public node method has a standalone of the same name, so method
// chaining and `pipe` compose identically (pipeable-dual-parity). The record
// methods above delegate here.
// -------------------------------------------------------------------------------------------------

const isObject = (u: unknown): u is object => typeof u === 'object' && u !== null

const hasKeys = (u: object, keys: ReadonlyArray<string>): boolean => keys.every((key) => key in u)

const isDecisionNode = (u: unknown): u is DecisionNode<never, AnyDecision, Schema.Constraint | undefined> =>
  isObject(u) && hasKeys(u, ['decision', 'where'])

const isClassifyDecision = (u: unknown): u is ClassifyDecision<never, string, Schema.Constraint | undefined> =>
  isObject(u) && hasKeys(u, ['labels', 'oneOf'])

const isProbabilityDecision = (u: unknown): u is ProbabilityDecision<never, Schema.Constraint | undefined> =>
  isObject(u) && hasKeys(u, ['above', 'band'])

/** Interpret one node's validated answer as a binary pattern leaf. */
export const where: {
  <D extends AnyDecision>(
    predicate: (answer: Answer<D>) => boolean,
    options?: LeafOptions,
  ): <Input, S extends Schema.Constraint | undefined>(self: DecisionNode<Input, D, S>) => Pattern<Input>
  <D extends AnyDecision, Input, S extends Schema.Constraint | undefined>(
    self: DecisionNode<Input, D, S>,
    predicate: (answer: Answer<D>) => boolean,
    options?: LeafOptions,
  ): Pattern<Input>
} = dual(
  (args: IArguments) => isDecisionNode(args[0]),
  <D extends AnyDecision, Input, S extends Schema.Constraint | undefined>(
    self: DecisionNode<Input, D, S>,
    predicate: (answer: Answer<D>) => boolean,
    options?: LeafOptions,
  ): Pattern<Input> =>
    whereLeaf(self, self.id, answerReaderOf(self.id, self.decision), judgeOfPredicate(predicate), options),
)

/** Interpret one node's validated answer as a tri-state pattern leaf. */
export const whereResult: {
  <D extends AnyDecision>(
    resolve: (answer: Answer<D>) => PatternResult,
    options?: LeafOptions,
  ): <Input, S extends Schema.Constraint | undefined>(self: DecisionNode<Input, D, S>) => Pattern<Input>
  <D extends AnyDecision, Input, S extends Schema.Constraint | undefined>(
    self: DecisionNode<Input, D, S>,
    resolve: (answer: Answer<D>) => PatternResult,
    options?: LeafOptions,
  ): Pattern<Input>
} = dual(
  (args: IArguments) => isDecisionNode(args[0]),
  <D extends AnyDecision, Input, S extends Schema.Constraint | undefined>(
    self: DecisionNode<Input, D, S>,
    resolve: (answer: Answer<D>) => PatternResult,
    options?: LeafOptions,
  ): Pattern<Input> => whereLeaf(self, self.id, answerReaderOf(self.id, self.decision), resolve, options),
)

/**
 * Read a classification or a rating as the answer naming one label: `is(node,
 * label)` beside the `node.is(label)` method. A node whose labels do not
 * contain the label builds a pattern that never matches.
 */
export const is: {
  <Label extends string>(
    label: Label,
    thresholds?: ClassifyThresholds,
  ): <Input, All extends string, S extends Schema.Constraint | undefined>(
    self: [Label] extends [All] ? ClassifyDecision<Input, All, S> | RateDecision<Input, All, S> : never,
  ) => Pattern<Input>
  <Label extends string, Input, All extends string, S extends Schema.Constraint | undefined>(
    self: [Label] extends [All] ? ClassifyDecision<Input, All, S> | RateDecision<Input, All, S> : never,
    label: Label,
    thresholds?: ClassifyThresholds,
  ): Pattern<Input>
} = dual(
  (args: IArguments) => typeof args[0] === 'object',
  (
    self:
      | ClassifyDecision<never, string, Schema.Constraint | undefined>
      | RateDecision<never, string, Schema.Constraint | undefined>,
    label: string,
    thresholds?: ClassifyThresholds,
  ): Pattern<never> =>
    isClassifyDecision(self)
      ? classifyIs(self, self.labels, label, thresholds)
      : where(self, (answer) => answer.label === label, { description: `${self.id} is ${label}` }),
)

const oneOfLeaf = <Input, Label extends string, S extends Schema.Constraint | undefined>(
  self: ClassifyDecision<Input, Label, S>,
  wanted: ReadonlyArray<Label>,
): Pattern<Input> =>
  where(self, (answer) => Arr.contains(wanted, answer.label), {
    description: `${self.id} in [${wanted.join(', ')}]`,
  })

/** Read a classification as naming any of several labels. */
export const oneOf: {
  <Label extends string>(
    label: Label,
    ...labels: ReadonlyArray<Label>
  ): <Input, All extends string, S extends Schema.Constraint | undefined>(
    self: [Label] extends [All] ? ClassifyDecision<Input, All, S> : never,
  ) => Pattern<Input>
  <Label extends string, Input, All extends string, S extends Schema.Constraint | undefined>(
    self: [Label] extends [All] ? ClassifyDecision<Input, All, S> : never,
    label: Label,
    ...labels: ReadonlyArray<Label>
  ): Pattern<Input>
} = dual(
  (args: IArguments) => typeof args[0] === 'object',
  <Input, Label extends string, S extends Schema.Constraint | undefined>(
    self: ClassifyDecision<Input, Label, S>,
    label: Label,
    ...labels: ReadonlyArray<Label>
  ): Pattern<Input> => oneOfLeaf(self, [label, ...labels]),
)

/** Read a classification as leading another label by at least a margin. */
export const margin: {
  <Label extends string>(
    label: Label,
    over: Label,
    by: number,
  ): <Input, All extends string, S extends Schema.Constraint | undefined>(
    self: [Label] extends [All] ? ClassifyDecision<Input, All, S> : never,
  ) => Pattern<Input>
  <Label extends string, Input, All extends string, S extends Schema.Constraint | undefined>(
    self: [Label] extends [All] ? ClassifyDecision<Input, All, S> : never,
    label: Label,
    over: Label,
    by: number,
  ): Pattern<Input>
} = dual(
  (args: IArguments) => typeof args[0] === 'object',
  <Input, Label extends string, S extends Schema.Constraint | undefined>(
    self: ClassifyDecision<Input, Label, S>,
    label: Label,
    over: Label,
    by: number,
  ): Pattern<Input> =>
    where(
      self,
      (answer) => probabilityOf(answer, label) - probabilityOf(answer, over) >= by,
      { description: `${self.id}: ${label} leads ${over} by ${by}` },
    ),
)

const notLabelOf = (
  self: ClassifyDecision<never, string, Schema.Constraint | undefined>,
  label: string | undefined,
): Pattern<never> => {
  const refused = label ?? ''
  return where(self, (answer) => answer.label !== refused, { description: `${self.id} is not ${refused}` })
}

/**
 * Negation preserves `Uncertain` and swaps `Match` and `Miss`. Called as
 * `not(pattern)`, or as `not(classifyNode, label)` — the dual counterpart of
 * the `ClassifyDecision.not` method.
 */
export const not: {
  (self: Pattern<never>): Pattern<never>
  <Label extends string, Input, All extends string, S extends Schema.Constraint | undefined>(
    self: [Label] extends [All] ? ClassifyDecision<Input, All, S> : never,
    label: Label,
  ): Pattern<Input>
  <Label extends string>(
    label: Label,
  ): <Input, All extends string, S extends Schema.Constraint | undefined>(
    self: [Label] extends [All] ? ClassifyDecision<Input, All, S> : never,
  ) => Pattern<Input>
} = dual(
  (args: IArguments) => args.length === 2 || typeof args[0] === 'object',
  (
    first: Pattern<never> | ClassifyDecision<never, string, Schema.Constraint | undefined>,
    second?: string,
  ): Pattern<never> => (isClassifyDecision(first) ? notLabelOf(first, second) : notPattern(first)),
)

const aboveOf = <Input, S extends Schema.Constraint | undefined>(
  self: ProbabilityDecision<Input, S>,
  threshold: number,
  inclusive: boolean,
  options?: BandOptions,
): Pattern<Input> => aboveLeaf(self, threshold, inclusive, missBelowOf(options, threshold))

const belowOf = <Input, S extends Schema.Constraint | undefined>(
  self: ProbabilityDecision<Input, S>,
  threshold: number,
  inclusive: boolean,
  options?: BandOptions,
): Pattern<Input> => belowLeaf(self, threshold, inclusive, missAboveOf(options, threshold))

const ratePositionOf = (levels: ReadonlyArray<string>, level: string): number => levels.indexOf(level)

/** Read a probability estimate against a one-sided threshold. */
export const above: {
  (threshold: number, options?: BandOptions): <Input, S extends Schema.Constraint | undefined>(
    self: ProbabilityDecision<Input, S>,
  ) => Pattern<Input>
  <Input, S extends Schema.Constraint | undefined>(
    self: ProbabilityDecision<Input, S>,
    threshold: number,
    options?: BandOptions,
  ): Pattern<Input>
} = dual(
  (args: IArguments) => typeof args[0] === 'object',
  <Input, S extends Schema.Constraint | undefined>(
    self: ProbabilityDecision<Input, S>,
    threshold: number,
    options?: BandOptions,
  ): Pattern<Input> => aboveOf(self, threshold, false, options),
)

/** Read a probability estimate as at least a threshold. */
export const atLeast: {
  (threshold: number, options?: BandOptions): <Input, S extends Schema.Constraint | undefined>(
    self: ProbabilityDecision<Input, S>,
  ) => Pattern<Input>
  <Level extends string>(
    level: Level,
  ): <Input, All extends string, S extends Schema.Constraint | undefined>(
    self: [Level] extends [All] ? RateDecision<Input, All, S> : never,
  ) => Pattern<Input>
  <Input, S extends Schema.Constraint | undefined>(
    self: ProbabilityDecision<Input, S>,
    threshold: number,
    options?: BandOptions,
  ): Pattern<Input>
  <Level extends string, Input, All extends string, S extends Schema.Constraint | undefined>(
    self: [Level] extends [All] ? RateDecision<Input, All, S> : never,
    level: Level,
  ): Pattern<Input>
} = dual(
  (args: IArguments) => typeof args[0] === 'object',
  (
    self:
      | ProbabilityDecision<never, Schema.Constraint | undefined>
      | RateDecision<never, string, Schema.Constraint | undefined>,
    thresholdOrLevel: number | string,
    options?: BandOptions,
  ): Pattern<never> => atLeastOf(self, thresholdOrLevel, options),
)

const atLeastOfRate = (
  self: RateDecision<never, string, Schema.Constraint | undefined>,
  level: number | string,
): Pattern<never> => {
  const position = typeof level === 'number' ? level : ratePositionOf(self.levels, level)
  return where(self, (answer) => answer.rating >= position, { description: `${self.id} >= ${level}` })
}

const atLeastOfProbability = (
  self: ProbabilityDecision<never, Schema.Constraint | undefined>,
  thresholdOrLevel: number | string,
  options?: BandOptions,
): Pattern<never> =>
  typeof thresholdOrLevel === 'number'
    ? aboveOf(self, thresholdOrLevel, true, options)
    : unmatchedLeaf(self, `${self.id} >= ${thresholdOrLevel}`)

const atLeastOf = (
  self:
    | ProbabilityDecision<never, Schema.Constraint | undefined>
    | RateDecision<never, string, Schema.Constraint | undefined>,
  thresholdOrLevel: number | string,
  options?: BandOptions,
): Pattern<never> =>
  isProbabilityDecision(self)
    ? atLeastOfProbability(self, thresholdOrLevel, options)
    : atLeastOfRate(self, thresholdOrLevel)

/** Read a probability estimate as strictly below a threshold. */
export const below: {
  (threshold: number, options?: BandOptions): <Input, S extends Schema.Constraint | undefined>(
    self: ProbabilityDecision<Input, S>,
  ) => Pattern<Input>
  <Input, S extends Schema.Constraint | undefined>(
    self: ProbabilityDecision<Input, S>,
    threshold: number,
    options?: BandOptions,
  ): Pattern<Input>
} = dual(
  (args: IArguments) => typeof args[0] === 'object',
  <Input, S extends Schema.Constraint | undefined>(
    self: ProbabilityDecision<Input, S>,
    threshold: number,
    options?: BandOptions,
  ): Pattern<Input> => belowOf(self, threshold, false, options),
)

/** Read a probability estimate or a rating as at most a threshold or level. */
export const atMost: {
  (threshold: number, options?: BandOptions): <Input, S extends Schema.Constraint | undefined>(
    self: ProbabilityDecision<Input, S>,
  ) => Pattern<Input>
  <Level extends string>(
    level: Level,
  ): <Input, All extends string, S extends Schema.Constraint | undefined>(
    self: [Level] extends [All] ? RateDecision<Input, All, S> : never,
  ) => Pattern<Input>
  <Input, S extends Schema.Constraint | undefined>(
    self: ProbabilityDecision<Input, S>,
    threshold: number,
    options?: BandOptions,
  ): Pattern<Input>
  <Level extends string, Input, All extends string, S extends Schema.Constraint | undefined>(
    self: [Level] extends [All] ? RateDecision<Input, All, S> : never,
    level: Level,
  ): Pattern<Input>
} = dual(
  (args: IArguments) => typeof args[0] === 'object',
  (
    self:
      | ProbabilityDecision<never, Schema.Constraint | undefined>
      | RateDecision<never, string, Schema.Constraint | undefined>,
    thresholdOrLevel: number | string,
    options?: BandOptions,
  ): Pattern<never> => atMostOf(self, thresholdOrLevel, options),
)

const atMostOfRate = (
  self: RateDecision<never, string, Schema.Constraint | undefined>,
  level: number | string,
): Pattern<never> => {
  const position = typeof level === 'number' ? level : ratePositionOf(self.levels, level)
  return where(self, (answer) => answer.rating <= position, { description: `${self.id} <= ${level}` })
}

const atMostOfProbability = (
  self: ProbabilityDecision<never, Schema.Constraint | undefined>,
  thresholdOrLevel: number | string,
  options?: BandOptions,
): Pattern<never> =>
  typeof thresholdOrLevel === 'number'
    ? belowOf(self, thresholdOrLevel, true, options)
    : unmatchedLeaf(self, `${self.id} <= ${thresholdOrLevel}`)

const atMostOf = (
  self:
    | ProbabilityDecision<never, Schema.Constraint | undefined>
    | RateDecision<never, string, Schema.Constraint | undefined>,
  thresholdOrLevel: number | string,
  options?: BandOptions,
): Pattern<never> =>
  isProbabilityDecision(self)
    ? atMostOfProbability(self, thresholdOrLevel, options)
    : atMostOfRate(self, thresholdOrLevel)

/** Read a probability estimate or a rating as sitting inside a span. */
export const between: {
  (low: number, high: number): <Input, S extends Schema.Constraint | undefined>(
    self: ProbabilityDecision<Input, S>,
  ) => Pattern<Input>
  <Level extends string>(
    low: Level,
    high: Level,
  ): <Input, All extends string, S extends Schema.Constraint | undefined>(
    self: [Level] extends [All] ? RateDecision<Input, All, S> : never,
  ) => Pattern<Input>
  <Input, S extends Schema.Constraint | undefined>(
    self: ProbabilityDecision<Input, S>,
    low: number,
    high: number,
  ): Pattern<Input>
  <Level extends string, Input, All extends string, S extends Schema.Constraint | undefined>(
    self: [Level] extends [All] ? RateDecision<Input, All, S> : never,
    low: Level,
    high: Level,
  ): Pattern<Input>
} = dual(
  (args: IArguments) => typeof args[0] === 'object',
  (
    self:
      | ProbabilityDecision<never, Schema.Constraint | undefined>
      | RateDecision<never, string, Schema.Constraint | undefined>,
    low: number | string,
    high: number | string,
  ): Pattern<never> =>
    isProbabilityDecision(self) ? betweenOfProbability(self, low, high) : betweenOfRate(self, low, high),
)

const probabilityBoundOf = (bound: number | string): number => (typeof bound === 'number' ? bound : Number.NaN)

const betweenOfProbability = (
  self: ProbabilityDecision<never, Schema.Constraint | undefined>,
  low: number | string,
  high: number | string,
): Pattern<never> => {
  const lower = probabilityBoundOf(low)
  const upper = probabilityBoundOf(high)
  return where(self, (answer) => answer.probability >= lower && answer.probability <= upper, {
    description: `${self.id} between ${low} and ${high}`,
  })
}

const betweenOfRate = (
  self: RateDecision<never, string, Schema.Constraint | undefined>,
  low: number | string,
  high: number | string,
): Pattern<never> =>
  where(self, (answer) => betweenRatings(answer, self.levels, low, high), {
    description: `${self.id} between ${low} and ${high}`,
  })

const ratingBoundOf = (levels: ReadonlyArray<string>, bound: number | string): number =>
  typeof bound === 'number' ? bound : ratePositionOf(levels, bound)

const betweenRatings = (
  answer: Decision.Answer<Decision.Rate<string>>,
  levels: ReadonlyArray<string>,
  low: number | string,
  high: number | string,
): boolean => {
  const lower = ratingBoundOf(levels, low)
  const upper = ratingBoundOf(levels, high)
  return answer.rating >= lower && answer.rating <= upper
}

/**
 * The leaf for a node/argument pairing the exported signatures refuse: the
 * pattern can never match, and the description says what was asked.
 */
const unmatchedLeaf = (
  self: DecisionNode<never, AnyDecision, Schema.Constraint | undefined>,
  description: string,
): Pattern<never> => where(self, () => false, { description })

/** Read a probability estimate as sitting inside a named band. */
export const band: {
  (limits: ProbabilityBand): <Input, S extends Schema.Constraint | undefined>(
    self: ProbabilityDecision<Input, S>,
  ) => Pattern<Input>
  <Input, S extends Schema.Constraint | undefined>(
    self: ProbabilityDecision<Input, S>,
    limits: ProbabilityBand,
  ): Pattern<Input>
} = dual(
  (args: IArguments) => typeof args[0] === 'object',
  bandOf,
)
