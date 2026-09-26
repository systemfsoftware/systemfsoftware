import { Blueprint } from '@systemfsoftware/effect-cell-types'
import { Match, Schema } from 'effect'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import { dual } from 'effect/Function'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Result from 'effect/Result'
import * as AiError from 'effect/unstable/ai/AiError'
import * as Decision from 'effect/unstable/ai/Decision'
import * as DecisionModel from 'effect/unstable/ai/DecisionModel'
import type { BudgetExhausted } from './admit-budget-charge.workflow.js'
import { chargeBudgetCall } from './budget-provider.cell.js'
import type { Budget } from './budget.handle.js'
import { BudgetLimit } from './Budget.schema.js'
import { cacheObservations } from './cache-provider.cell.js'
import { get, isObservationStore, type ObservationStore, set, store } from './observation-store.handle.js'
import { Observation, Observations, ProviderAnswer } from './Observation.schema.js'
import { CurrentRegion } from './region.service.js'
import { replayObservations } from './replay-provider.cell.js'
import type { RecordingMissing } from './select-observation-source.workflow.js'

export const DiscernMethod = {
  unavailable: 'unavailable',
  intercept: 'intercept',
  replaying: 'replaying',
  caching: 'caching',
  budgeted: 'budgeted',
  refusing: 'refusing',
} as const
const DISCERN_MODULE = 'Discern'

const discernFailure = (method: string, reason: AiError.AiErrorReason): AiError.AiError =>
  new AiError.AiError({ module: DISCERN_MODULE, method, reason })

const isDiscernMethodOf = (error: AiError.AiError, method: string): boolean =>
  error.module === DISCERN_MODULE && error.method === method

/** True for the failure raised when a budget is exhausted. */
export const isBudgetExceeded = (error: unknown): error is AiError.AiError =>
  AiError.isAiError(error) && isDiscernMethodOf(error, DiscernMethod.budgeted)

/** True for the failure raised when replay has no recorded answer for a decision. */
export const isReplayMiss = (error: unknown): error is AiError.AiError =>
  AiError.isAiError(error) && isDiscernMethodOf(error, DiscernMethod.replaying)

const replayMissFailure = (refusal: (typeof RecordingMissing)['Encoded']): AiError.AiError =>
  discernFailure(DiscernMethod.replaying, new AiError.InvalidRequestError({ description: refusal.detail }))

const cacheFailure = (refusal: (typeof RecordingMissing)['Encoded']): AiError.AiError =>
  discernFailure(DiscernMethod.caching, new AiError.InvalidRequestError({ description: refusal.detail }))
const limitEntryOf = (key: 'maxDecisions' | 'maxCalls', limit: BudgetLimit): Record<string, number> =>
  Match.value(limit).pipe(
    Match.tag('Unlimited', () => ({})),
    Match.tag('Limited', (limited) => ({ [key]: limited.count })),
    Match.exhaustive,
  )

const budgetMetadataOf = (refusal: (typeof BudgetExhausted)['Encoded']): AiError.ProviderMetadata => ({
  reason: refusal.reason,
  spentDecisions: refusal.spentDecisions,
  spentCalls: refusal.spentCalls,
  requestedDecisions: refusal.requestedDecisions,
  ...limitEntryOf('maxDecisions', refusal.maxDecisions),
  ...limitEntryOf('maxCalls', refusal.maxCalls),
})

const budgetExceededFailure = (refusal: (typeof BudgetExhausted)['Encoded']): AiError.AiError =>
  discernFailure(DiscernMethod.budgeted, new AiError.QuotaExhaustedError({ metadata: budgetMetadataOf(refusal) }))

export type Hashable =
  | null
  | undefined
  | boolean
  | number
  | string
  | ReadonlyArray<Hashable>
  | { readonly [key: string]: Hashable }

type Scalarish = null | undefined | boolean | number | string
type Composite = ReadonlyArray<Hashable> | { readonly [key: string]: Hashable }

const scalarOf = (value: Hashable): string => (value === undefined ? 'undefined' : JSON.stringify(value))

const isScalarish = (value: Hashable): value is Scalarish => value === null || typeof value !== 'object'

const isList = (value: Composite): value is ReadonlyArray<Hashable> => Array.isArray(value)

const membersOf = (record: { readonly [key: string]: Hashable }, sortKeys: boolean): string =>
  (sortKeys ? Object.keys(record).sort() : Object.keys(record))
    .map((key) => `${JSON.stringify(key)}:${canonicalOf(record[key], sortKeys)}`)
    .join(',')

const compositeOf = (value: Composite, sortKeys: boolean): string =>
  isList(value)
    ? `[${value.map((item) => canonicalOf(item, sortKeys)).join(',')}]`
    : `{${membersOf(value, sortKeys)}}`

const canonicalOf = (value: Hashable, sortKeys: boolean): string =>
  isScalarish(value) ? scalarOf(value) : compositeOf(value, sortKeys)

const digestOf = (input: string): string => {
  const [a, b] = input.split('').reduce<readonly [number, number]>(
    ([first, second], unit) => [
      Math.imul(first ^ unit.charCodeAt(0), 0x01000193),
      Math.imul(second ^ unit.charCodeAt(0), 0x85ebca6b),
    ],
    [0x811c9dc5, 0x9e3779b9],
  )
  return `${(a >>> 0).toString(36)}${(b >>> 0).toString(36).padStart(7, '0')}`
}

/**
 * A canonical string for any JSON-like value, treating objects as unordered.
 *
 * Use this for *data*: a JSON object's key order carries no meaning, so `{b, a}`
 * and `{a, b}` are the same input and should hash alike. Array order is always
 * preserved, because it is meaningful.
 */
export const hash = (value: Hashable): string => digestOf(typeof value === 'string' ? value : canonicalOf(value, true))

const decisionHashable = (decision: Decision.Any): Hashable =>
  Match.value(decision).pipe(
    Match.tag(
      'Classify',
      (classified): Hashable => ({
        _tag: 'Classify',
        instructions: classified.instructions,
        criteria: { ...classified.criteria },
      }),
    ),
    Match.tag(
      'Rate',
      (rated): Hashable => ({ _tag: 'Rate', instructions: rated.instructions, criteria: [...rated.criteria] }),
    ),
    Match.tag(
      'Probability',
      (probable): Hashable => ({
        _tag: 'Probability',
        instructions: probable.instructions,
        criteria: { ...probable.criteria },
      }),
    ),
    Match.exhaustive,
  )

/** Identity of a decision *definition* — instructions and criteria, not its id. */
export const decisionFingerprint = (decision: Decision.Any): string =>
  `df_${digestOf(canonicalOf(decisionHashable(decision), false))}`

/**
 * Content address of one semantic observation: the decision definition together
 * with the encoded input it was asked about.
 *
 * Addressing by definition-and-input rather than by decision id is what lets a
 * single store hold observations from many matchers, and from the same decision
 * asked about different inputs, without collisions.
 */
const observationAddress = (decision: Decision.Any, state: Schema.Json): string =>
  `o_${digestOf(`${canonicalOf(decisionHashable(decision), false)}|${canonicalOf(state, true)}`)}`

export interface ObservationSplit {
  /** The recorded answers, keyed by decision id. */
  readonly hits: Readonly<Record<string, ProviderAnswer>>
  /** The decisions with no recorded answer, keyed by decision id. */
  readonly missingDecisions: Readonly<Record<string, Decision.Any>>
}

interface Placement {
  readonly id: string
  readonly decision: Decision.Any
  readonly recorded: Observation | undefined
}

const isRecorded = (placement: Placement): placement is Placement & { readonly recorded: Observation } =>
  placement.recorded !== undefined

const placementsOf = (
  decisions: Readonly<Record<string, Decision.Any>>,
  state: Schema.Json,
  lookup: ObservationStore | undefined,
): Effect.Effect<ReadonlyArray<Placement>> =>
  lookup === undefined
    ? Effect.succeed(
      Object.entries(decisions).map(([id, decision]): Placement => ({ id, decision, recorded: undefined })),
    )
    : Effect.forEach(Object.entries(decisions), ([id, decision]) =>
      Effect.map(get(lookup, observationAddress(decision, state)), (recorded): Placement => ({
        id,
        decision,
        recorded: Option.getOrUndefined(recorded),
      })))

const splitObservations = (
  decisions: Readonly<Record<string, Decision.Any>>,
  state: Schema.Json,
  lookup: ObservationStore | undefined,
): Effect.Effect<ObservationSplit> =>
  Effect.map(placementsOf(decisions, state, lookup), (placements): ObservationSplit => ({
    hits: Object.fromEntries(
      placements.filter(isRecorded).map((placement): readonly [string, ProviderAnswer] => [
        placement.id,
        placement.recorded.answer,
      ]),
    ),
    missingDecisions: Object.fromEntries(
      placements
        .filter((placement) => !isRecorded(placement))
        .map((placement): readonly [string, Decision.Any] => [placement.id, placement.decision]),
    ),
  }))

const observationOf = (
  decisionId: string,
  decision: Decision.Any,
  regionPath: ReadonlyArray<string>,
  answer: ProviderAnswer,
): Observation =>
  Observation.make({
    decisionId,
    fingerprint: decisionFingerprint(decision),
    kind: decision._tag,
    region: [...regionPath],
    answer,
  })

const observedAnswerOf = (answer: DecisionModel.ProviderAnswer): Effect.Effect<ProviderAnswer, AiError.AiError> =>
  Effect.mapError(
    Effect.fromResult(Schema.decodeResult(ProviderAnswer)(answer)),
    (issue) =>
      AiError.make({
        module: 'Discern',
        method: 'recording',
        reason: new AiError.InvalidOutputError({ description: issue.message }),
      }),
  )

const recordAnswers = (
  into: ObservationStore,
  decisions: Readonly<Record<string, Decision.Any>>,
  state: Schema.Json,
  answers: Readonly<Record<string, DecisionModel.ProviderAnswer>>,
  regionPath: ReadonlyArray<string>,
): Effect.Effect<void, AiError.AiError> =>
  Effect.forEach(
    Object.entries(answers),
    ([id, answer]) => {
      const decision = decisions[id]
      return decision === undefined
        ? Effect.void
        : Effect.flatMap(observedAnswerOf(answer), (observed) =>
          set(into, observationAddress(decision, state), observationOf(id, decision, regionPath, observed)))
    },
    { discard: true },
  )

/**
 * A `DecisionModel` decorator. Interceptors are listed outermost-first, so in
 * `[recording, caching, budgeted]` the recorder observes every answer, the cache
 * is consulted next, and only genuine model calls draw from the budget.
 */
export type Interceptor = (inner: Provider) => Provider

export interface Provider {
  readonly decide: (
    options: DecisionModel.ProviderOptions,
  ) => Effect.Effect<DecisionModel.ProviderResponse, AiError.AiError>
}

export const provider = (decide: Provider['decide']): Provider => ({ decide })

const asStore = (source: Observations | ObservationStore): ObservationStore =>
  'entries' in source ? store(source) : source

export const recording = (into: ObservationStore): Interceptor => (inner) =>
  provider((options) =>
    Effect.flatMap(
      CurrentRegion.useSync((path) => path),
      (regionPath) =>
        Effect.flatMap(inner.decide(options), (response) =>
          Effect.as(
            recordAnswers(into, options.decisions, options.state, response.answers, regionPath),
            response,
          )),
    )
  )

/**
 * Answer from recorded observations instead of calling the model.
 *
 * Because the address covers the decision definition *and* the input, a changed
 * decision simply has no recorded answer — there is no separate fingerprint
 * check to keep in sync.
 *
 * `onMissing: "ask"` passes unrecorded decisions through to the model but does
 * not write them back — `replaying` only reads. To top up a recording as you
 * go, put a cache underneath it:
 * `[replaying(fixture, { onMissing: "ask" }), caching(store)]`.
 */
export interface ReplayOptions {
  readonly onMissing?: 'fail' | 'ask' | undefined
}

const policyOf = (options: ReplayOptions): 'fail' | 'ask' => options.onMissing ?? 'fail'

const onMissingOf = (options: ReplayOptions | undefined): 'fail' | 'ask' =>
  options === undefined ? 'fail' : policyOf(options)

export const replaying: {
  (options?: ReplayOptions): (source: Observations | ObservationStore) => Interceptor
  (source: Observations | ObservationStore, options?: ReplayOptions): Interceptor
} = dual(
  (args: IArguments) => 'entries' in args[0] || isObservationStore(args[0]),
  (source: Observations | ObservationStore, options?: ReplayOptions): Interceptor => {
    const lookup = asStore(source)
    const onMissing = onMissingOf(options)
    return (inner) =>
      provider((request) =>
        Effect.flatMap(
          splitObservations(request.decisions, request.state, lookup),
          (split) =>
            Effect.flatMap(
              replayObservations.run({ options: request, inner, split, onMissing }),
              (answer) =>
                Match.value(answer).pipe(
                  Match.tag('RecordingMissing', (refusal) => Effect.fail(replayMissFailure(refusal))),
                  Match.orElse((response) => Effect.succeed(response)),
                ),
            ),
        )
      )
  },
)

/**
 * Reuse observations across runs, asking the model only for decisions that are
 * not already known. Unlike a whole-result cache this is partial: a batch of
 * four decisions with three hits sends one decision onward.
 */
export const caching = (into: ObservationStore): Interceptor => (inner) =>
  provider((request) =>
    Effect.flatMap(
      splitObservations(request.decisions, request.state, into),
      (split) =>
        Effect.flatMap(
          cacheObservations.run({
            options: request,
            inner,
            split,
            record: (answers, regionPath) => recordAnswers(into, request.decisions, request.state, answers, regionPath),
          }),
          (answer) =>
            Match.value(answer).pipe(
              Match.tag('RecordingMissing', (refusal) => Effect.fail(cacheFailure(refusal))),
              Match.orElse((response) => Effect.succeed(response)),
            ),
        ),
    )
  )

/**
 * Refuse model calls once a budget is spent. Place it innermost, below
 * `caching`, so that reused observations cost nothing.
 */
export const budgeted = (limit: Budget): Interceptor => (inner) =>
  provider((request) =>
    Effect.flatMap(
      chargeBudgetCall.run({ options: request, inner, budget: limit }),
      (answer) =>
        Match.value(answer).pipe(
          Match.tag('BudgetExhausted', (refusal) => Effect.fail(budgetExceededFailure(refusal))),
          Match.orElse((response) => Effect.succeed(response)),
        ),
    )
  )

const unusableAnswerOf = (id: string, detail: string): AiError.AiError =>
  discernFailure(
    DiscernMethod.intercept,
    new AiError.InvalidOutputError({
      description: `Provider returned an unusable answer for decision "${id}": ${detail}`,
    }),
  )

const CLASSIFY_ANSWER = { _tag: 'Classify' } as const
const RATE_ANSWER = { _tag: 'Rate' } as const
const PROBABILITY_ANSWER = { _tag: 'Probability' } as const

const taggedOf = (decision: Decision.Any, answer: Decision.Answer<Decision.Any>) =>
  Match.value(decision).pipe(
    Match.tag('Classify', () => ({ ...CLASSIFY_ANSWER, ...answer })),
    Match.tag('Rate', () => ({ ...RATE_ANSWER, ...answer })),
    Match.tag('Probability', () => ({ ...PROBABILITY_ANSWER, ...answer })),
    Match.exhaustive,
  )

const answerEntryOf = (
  id: string,
  decision: Decision.Any,
  answer: Decision.Answer<Decision.Any> | undefined,
): Effect.Effect<readonly [string, ProviderAnswer], AiError.AiError> =>
  answer === undefined
    ? Effect.fail(unusableAnswerOf(id, 'the model returned no answer for it'))
    : Result.match(Schema.decodeUnknownResult(ProviderAnswer)(taggedOf(decision, answer)), {
      onSuccess: (decoded): Effect.Effect<readonly [string, ProviderAnswer], AiError.AiError> =>
        Effect.succeed([id, decoded]),
      onFailure: (issue) => Effect.fail(unusableAnswerOf(id, issue.message)),
    })

const providerAnswersOf = (
  decisions: Readonly<Record<string, Decision.Any>>,
  answers: Decision.Answers<Record<string, Decision.Any>>,
): Effect.Effect<Readonly<Record<string, ProviderAnswer>>, AiError.AiError> =>
  Effect.map(
    Effect.forEach(Object.entries(decisions), ([id, decision]) => answerEntryOf(id, decision, answers[id])),
    (entries) => Object.fromEntries(entries),
  )

const asProvider = (inner: DecisionModel.DecisionModel): Provider =>
  provider((options) =>
    Effect.flatMap(
      inner.decide(Decision.make({ input: Schema.Json, decisions: options.decisions }), { input: options.state }),
      (response) =>
        Effect.map(
          providerAnswersOf(options.decisions, response.answers),
          (answers): DecisionModel.ProviderResponse => ({
            answers,
            usage: { inputTokens: response.usage.inputTokens, outputTokens: response.usage.outputTokens },
          }),
        ),
    )
  )

const decorate = (interceptors: ReadonlyArray<Interceptor>, inner: Provider): Provider =>
  interceptors.reduceRight((next, wrap) => wrap(next), inner)

export const fromProvider = (source: Provider): Layer.Layer<DecisionModel.DecisionModel> =>
  Layer.effect(DecisionModel.DecisionModel)(DecisionModel.make({ decide: source.decide }))

const decoratedModel = (
  interceptors: ReadonlyArray<Interceptor>,
  context: Context.Context<DecisionModel.DecisionModel>,
): Effect.Effect<DecisionModel.DecisionModel> =>
  DecisionModel.make({
    decide: decorate(interceptors, asProvider(Context.get(context, DecisionModel.DecisionModel))).decide,
  })

export interface ModelSpec {
  readonly provider: Provider
  readonly interceptors: ReadonlyArray<Interceptor>
}

export const TypeId = Symbol.for('@systemfsoftware/discern/Model')
export type TypeId = typeof TypeId

const appendOf = (spec: ModelSpec, interceptor: Interceptor): ModelSpec => ({
  provider: spec.provider,
  interceptors: [...spec.interceptors, interceptor],
})

const layerOf = (spec: ModelSpec): Layer.Layer<DecisionModel.DecisionModel> =>
  fromProvider(decorate(spec.interceptors, spec.provider))

export const Model = Blueprint.make<ModelSpec>()(TypeId).steps({
  steps: {
    recording: (spec, into: ObservationStore): ModelSpec => appendOf(spec, recording(into)),
    caching: (spec, into: ObservationStore): ModelSpec => appendOf(spec, caching(into)),
    replaying: (spec, source: Observations | ObservationStore, options?: ReplayOptions): ModelSpec =>
      appendOf(spec, replaying(source, options)),
    budgeted: (spec, limit: Budget): ModelSpec => appendOf(spec, budgeted(limit)),
  },
  targets: { layer: layerOf },
})

export type Model = Blueprint.Of<typeof Model>

export const model = (source: Provider): Model => Model.of({ provider: source, interceptors: [] })

/**
 * Decorate an existing `DecisionModel` layer — including one from a provider
 * package you do not own.
 */
export const intercept =
  (interceptors: ReadonlyArray<Interceptor>) =>
  <E, R>(self: Layer.Layer<DecisionModel.DecisionModel, E, R>): Layer.Layer<DecisionModel.DecisionModel, E, R> =>
    interceptors.length === 0
      ? self
      : Layer.flatMap(
        self,
        (context) => Layer.effect(DecisionModel.DecisionModel, decoratedModel(interceptors, context)),
      )

/** Build a `DecisionModel` layer from a provider and an interceptor stack. */
export const layer: {
  (interceptors?: ReadonlyArray<Interceptor>): (source: Provider) => Layer.Layer<DecisionModel.DecisionModel>
  (source: Provider, interceptors?: ReadonlyArray<Interceptor>): Layer.Layer<DecisionModel.DecisionModel>
} = dual(
  (args: IArguments) => !Array.isArray(args[0]),
  (source: Provider, interceptors?: ReadonlyArray<Interceptor>): Layer.Layer<DecisionModel.DecisionModel> =>
    Model.of({ provider: source, interceptors: interceptors ?? [] }).layer,
)

/** A layer that answers only from recorded observations and never reaches a model. */
export const replayLayer = (source: Observations | ObservationStore): Layer.Layer<DecisionModel.DecisionModel> =>
  layer(unavailable, [replaying(source)])

export const unavailable: Provider = provider(() =>
  Effect.fail(
    discernFailure(
      DiscernMethod.unavailable,
      new AiError.InvalidRequestError({
        description: 'No decision provider is available; this program was expected to run without one',
      }),
    ),
  )
)

export interface RegionTree {
  readonly name: string
  readonly observations: ReadonlyArray<Observation>
  readonly children: ReadonlyArray<RegionTree>
}

interface Branch {
  readonly name: string
  readonly observations: Array<Observation>
  readonly children: Map<string, Branch>
}

const branchOf = (name: string): Branch => ({ name, observations: [], children: new Map() })

const childAt = (node: Branch, name: string): Branch =>
  Option.match(Option.fromUndefinedOr(node.children.get(name)), {
    onNone: () => branchOf(name),
    onSome: (child) => child,
  })

const branchAt = (node: Branch, path: ReadonlyArray<string>): Branch => {
  const [head, ...rest] = path
  if (head === undefined) return node
  const child = childAt(node, head)
  node.children.set(head, child)
  return branchAt(child, rest)
}

const frozenOf = (node: Branch): RegionTree => ({
  name: node.name,
  observations: node.observations,
  children: [...node.children.values()].map(frozenOf),
})

/**
 * Arrange a recording as the tree of regions it happened in. Observations made
 * outside any `discern.model.region` land at the root.
 */
export const tree: {
  (rootName?: string): (source: Observations) => RegionTree
  (source: Observations, rootName?: string): RegionTree
} = dual(
  (args: IArguments) => typeof args[0] !== 'string',
  (source: Observations, rootName?: string): RegionTree => {
    const root = branchOf(rootName ?? '')
    Object.values(source.entries).forEach((observation) => {
      branchAt(root, observation.region).observations.push(observation)
    })
    return frozenOf(root)
  },
)
