import { Sandwich } from '@systemfsoftware/effect-cell-types'
import { Array as Arr, Effect, Option, Order, Ordering, Result } from 'effect'
import { dual } from 'effect/Function'
import type * as AiError from 'effect/unstable/ai/AiError'
import { DecisionIdCollisionError } from './DiscernError.schema.js'
import { CurrentDepth, MaxDepth } from './procedure-depth.service.js'
import { type FallbackInvocation, handlerEffectOf, type InvokeOptions } from './procedure.blueprint.js'
import {
  DepthExceededError,
  NoEligibleProcedureError,
  ProcedureCommandRejectedError,
  RoutingUncertainError,
} from './ProcedureError.schema.js'
import { region } from './region.service.js'
import { Probability } from './Route.schema.js'
import type { RouteCandidate, RouteOptions } from './Route.schema.js'
import { selectEligibility } from './select-eligibility.workflow.js'
import {
  ManyEligible,
  NoEligible,
  OneEligible,
  type Route,
  RouteMatched,
  RouteUncertain,
  SelectRoute,
  selectRoute,
} from './select-route.workflow.js'

/** The part of the routing answer a registry routes on: the whole distribution. */
export interface RoutingAnswer {
  readonly probabilities: Record<string, Probability>
}

/**
 * How the routing decision is asked for one request: narrowed to the eligible
 * candidates. The ask travels through the registry's routing decision, so it
 * can also refuse with that decision's own typed failures.
 */
export type AskRouting<Projected, R, Ids extends string = string> = (
  candidates: ReadonlyArray<Ids>,
  input: Projected,
) => Effect.Effect<RoutingAnswer, AiError.AiError | DecisionIdCollisionError, R>

/**
 * What the routing shell needs from the registry to route one request.
 *
 * The ids are the registry's own keys at their narrowest, so the member the
 * routing picks can be handed to `runMember` without a lookup that could miss.
 */
export interface RoutingView<Input, Projected, R, Ids extends string = string> {
  /** Every member key, so the none-eligible reason names what was considered. */
  readonly membership: ReadonlyArray<Ids>
  /** The keys of the members whose eligibility holds for this input. */
  readonly eligibleIds: (input: Input) => ReadonlyArray<Ids>
  readonly select: (input: Input) => Projected
  readonly askRouting: AskRouting<Projected, R, Ids>
}

export interface InvokeProcedureOptions<
  Input,
  Projected,
  Value,
  Failure,
  Requirements,
  R,
  Ids extends string = string,
> extends RoutingView<Input, Projected, R, Ids> {
  /** Run one member by its registry key. The key comes from eligibility, so it is always held. */
  readonly runMember: (id: Ids, input: Input) => Effect.Effect<Value, Failure, Requirements>
}

/** One invocation of a registry: the request and how its caller handles uncertainty. */
export interface InvokeRequest<Input> {
  readonly input: Input
  readonly options: InvokeOptions<Input>
}

/**
 * What the read phase hands the routing decision: the encoded command plus the
 * live request, and the ranked candidates with their ids still held at the
 * registry's own keys — the member the decision runs is read off this ranking
 * by position, never looked up again.
 */
export type InvokeRead<Input, Ids extends string = string> = (typeof SelectRoute)['Type'] & {
  readonly ranking: ReadonlyArray<RouteCandidate<Ids>>
} & InvokeRequest<Input>

interface Thresholds {
  readonly minProbability: number
  readonly minMargin: number
}

/** What one request's routing gathers: the eligibility outcome and the ranking it holds. */
interface RouteFacts<Ids extends string> {
  readonly eligibility: (typeof SelectRoute)['Type']['eligibility']
  readonly ranking: ReadonlyArray<RouteCandidate<Ids>>
}

/**
 * What the eligibility cell's read gathers: the registry's view of one request.
 * `keys` holds the registry's own keys at their narrowest — the ranking the
 * outer decision reads its member off by position is built from them — while
 * `candidates` is the command's own spelling of the same keys.
 */
interface EligibilityView<Input, Projected, R, Ids extends string> {
  readonly keys: ReadonlyArray<Ids>
  readonly membership: ReadonlyArray<string>
  readonly candidates: ReadonlyArray<string>
  readonly select: (input: Input) => Projected
  readonly askRouting: AskRouting<Projected, R, Ids>
  readonly input: Input
}

const ROUTING_DEFAULTS: Thresholds = { minProbability: 0.7, minMargin: 0.15 }

const thresholdOf = (value: number | undefined, fallback: number): number =>
  Option.getOrElse(Option.fromUndefinedOr(value), () => fallback)

const thresholdsOf = (routing: RouteOptions | undefined): Thresholds => {
  const options = Option.getOrElse(Option.fromUndefinedOr(routing), () => ROUTING_DEFAULTS)
  return {
    minProbability: thresholdOf(options.minProbability, ROUTING_DEFAULTS.minProbability),
    minMargin: thresholdOf(options.minMargin, ROUTING_DEFAULTS.minMargin),
  }
}

const byDescendingProbability: Order.Order<RouteCandidate> = Order.make<RouteCandidate>((self, that) =>
  Ordering.reverse(Order.Number(self.probability, that.probability))
)

const zeroProbability = Probability.make(0)
const certainProbability = Probability.make(1)

/**
 * The candidates in descending probability, ties keeping the order they were
 * offered in: the ranking is the stable sort of what eligibility handed over.
 */
const rankedCandidatesOf = <Ids extends string>(
  candidates: ReadonlyArray<Ids>,
  probabilities: Record<string, Probability>,
): ReadonlyArray<RouteCandidate<Ids>> =>
  Arr.sort(
    Arr.map(candidates, (id): RouteCandidate<Ids> => ({ id, probability: probabilities[id] ?? zeroProbability })),
    byDescendingProbability,
  )

/**
 * The distribution the decision carries, named by its two longest: the decision
 * proved its candidates hold at least two, so the pair the ranking opens with
 * exists by construction.
 */
const distributionOf = (
  candidates: readonly [string, string, ...Array<string>],
  probabilities: Record<string, Probability>,
): {
  readonly leader: RouteCandidate
  readonly runnerUp: RouteCandidate
  readonly ranked: ReadonlyArray<RouteCandidate>
} => {
  const [first, ...rest] = candidates
  const score = (id: string): RouteCandidate => ({ id, probability: probabilities[id] ?? zeroProbability })
  const ranked = Arr.sort(Arr.appendAll(Arr.of(score(first)), Arr.map(rest, score)), byDescendingProbability)
  const [twoLongest] = Arr.splitAtNonEmpty(ranked, 2)
  return { leader: Arr.headNonEmpty(twoLongest), runnerUp: Arr.lastNonEmpty(twoLongest), ranked }
}

const noCandidateFactsOf = <Ids extends string>(membership: ReadonlyArray<string>): RouteFacts<Ids> => ({
  eligibility: new NoEligible({ membership }),
  ranking: Arr.empty<RouteCandidate<Ids>>(),
})

/**
 * The cell that decides whether the routing question needs the model at all.
 * Each handler runs one path, so a request that fits one procedure reaches it
 * without the model being consulted; only the distribution between two or more
 * spends the ask, inside the `route` region. The read hands this cell the
 * command it decodes, and every field the command declares decodes from the
 * gathered arrays, so a rejection is unreachable — if the wiring ever broke,
 * the run reports nothing eligible rather than picking a member to run.
 */
const eligibilityCellOf = <Input, Projected, R, Ids extends string>() =>
  Sandwich.named('discern.procedure.eligibility')((view: EligibilityView<Input, Projected, R, Ids>) =>
    Effect.succeed({
      _tag: 'EligibilityQuestion' as const,
      membership: view.membership,
      candidates: view.candidates,
      select: view.select,
      askRouting: view.askRouting,
      input: view.input,
      keys: view.keys,
    })
  )
    .decide(selectEligibility)
    .write({
      NoCandidateEligible: (decided) => Effect.succeed(noCandidateFactsOf<Ids>(decided.membership)),
      SingleCandidateEligible: (decided, view) =>
        Effect.succeed({
          eligibility: new OneEligible({
            candidate: { id: decided.candidate, probability: certainProbability },
          }),
          ranking: Arr.map(view.keys, (id): RouteCandidate<Ids> => ({ id, probability: certainProbability })),
        }),
      CandidateDistribution: (decided, view) =>
        Effect.map(
          region('route')(view.askRouting(view.keys, view.select(view.input))),
          (answer) => ({
            eligibility: new ManyEligible(distributionOf(decided.candidates, answer.probabilities)),
            ranking: rankedCandidatesOf(view.keys, answer.probabilities),
          }),
        ),
      CommandRejected: (_rejected, view) => Effect.succeed(noCandidateFactsOf<Ids>(view.membership)),
    })

/**
 * The routing facts one request gathers: eligibility as the registry computed
 * it, and the ranking the decision reads its member off by position.
 */
const eligibilityFactsOf = <Input, Projected, R, Ids extends string>(
  view: RoutingView<Input, Projected, R, Ids>,
  input: Input,
): Effect.Effect<RouteFacts<Ids>, AiError.AiError | DecisionIdCollisionError, R> => {
  const candidates = view.eligibleIds(input)
  return eligibilityCellOf<Input, Projected, R, Ids>().run({
    keys: candidates,
    membership: view.membership,
    candidates,
    select: view.select,
    askRouting: view.askRouting,
    input,
  })
}

const routeDecisionOf = (command: SelectRoute): Route =>
  Result.match(selectRoute(command), {
    onFailure: (refusal) => refusal,
    onSuccess: (decision) => decision,
  })

/**
 * The gate both invoke shells open first: the read gathers the ceiling and the
 * current depth, and refuses before any eligibility is gathered and before any
 * member is asked about.
 */
const depthGate: Effect.Effect<{ readonly depth: number; readonly limit: number }, DepthExceededError> = Effect
  .filterOrFail(
    Effect.all({ depth: CurrentDepth.useSync((value) => value), limit: MaxDepth.useSync((value) => value) }),
    (gathered) => gathered.depth < gathered.limit,
    (gathered) => new DepthExceededError({ depth: gathered.depth, limit: gathered.limit }),
  )

/**
 * The imperative shell of one registry invocation: the read enforces the depth
 * limit, applies eligibility, asks the routing decision only when more than one
 * member is eligible, and ranks the distribution into a tuple that is at least
 * two long; the handlers run the chosen member at depth+1 inside a `route`
 * region or refuse.
 *
 * Without an `onUncertain` handler, an unroutable request fails with
 * {@link RoutingUncertainError} rather than guessing. The chain is built per
 * invocation because the fallback's type is the caller's; spans and the
 * duration metric belong to the name, so per-call construction shares them
 * with every other invocation.
 */
export const invokeProcedure: {
  <Input, Projected, Value, Failure, Requirements, R, Ids extends string = string>(
    options: InvokeProcedureOptions<Input, Projected, Value, Failure, Requirements, R, Ids>,
  ): (
    request: InvokeRequest<Input>,
  ) => Effect.Effect<
    { readonly route: Route; readonly value: Value },
    | Failure
    | AiError.AiError
    | DecisionIdCollisionError
    | ProcedureCommandRejectedError
    | NoEligibleProcedureError
    | DepthExceededError
    | RoutingUncertainError,
    R | Requirements
  >
  <Input, Projected, Value, Failure, Requirements, R, Ids extends string = string>(
    options: InvokeProcedureOptions<Input, Projected, Value, Failure, Requirements, R, Ids>,
    request: InvokeRequest<Input>,
  ): Effect.Effect<
    { readonly route: Route; readonly value: Value },
    | Failure
    | AiError.AiError
    | DecisionIdCollisionError
    | ProcedureCommandRejectedError
    | NoEligibleProcedureError
    | DepthExceededError
    | RoutingUncertainError,
    R | Requirements
  >
} = dual(
  2,
  <
    Input,
    Projected,
    Value,
    Failure,
    Requirements,
    R,
    Ids extends string = string,
  >(
    options: InvokeProcedureOptions<Input, Projected, Value, Failure, Requirements, R, Ids>,
    request: InvokeRequest<Input>,
  ): Effect.Effect<
    { readonly route: Route; readonly value: Value },
    | Failure
    | AiError.AiError
    | DecisionIdCollisionError
    | ProcedureCommandRejectedError
    | NoEligibleProcedureError
    | DepthExceededError
    | RoutingUncertainError,
    R | Requirements
  > => {
    const readInvoke = (
      invocation: InvokeRequest<Input>,
    ) =>
      Effect.gen(function*() {
        yield* depthGate
        const thresholds = thresholdsOf(invocation.options.routing)
        const facts = yield* eligibilityFactsOf(options, invocation.input)
        return {
          _tag: 'SelectRoute' as const,
          eligibility: facts.eligibility,
          ranking: facts.ranking,
          minProbability: thresholds.minProbability,
          minMargin: thresholds.minMargin,
          input: invocation.input,
          options: invocation.options,
        }
      })

    const runChosen = (
      id: Ids,
      input: Input,
      matched: (typeof RouteMatched)['Encoded'],
      ranking: ReadonlyArray<RouteCandidate>,
    ): Effect.Effect<
      { readonly route: Route; readonly value: Value },
      Failure | NoEligibleProcedureError,
      Requirements
    > =>
      Effect.flatMap(CurrentDepth.useSync((depth) => depth), (depth) =>
        Effect.map(
          Effect.provideService(options.runMember(id, input), CurrentDepth, depth + 1),
          (value) => ({ route: new RouteMatched({ ...matched, ranked: ranking }), value }),
        ))

    return Sandwich.named('discern.procedure.invoke')(readInvoke)
      .decide(selectRoute)
      .write({
        RouteMatched: (matched, read) =>
          Effect.flatMap(
            Effect.filterOrFail(
              Effect.succeed(read.ranking),
              Arr.isReadonlyArrayNonEmpty,
              () => new NoEligibleProcedureError({ reason: 'no procedure is eligible for this input' }),
            ),
            (ranking) => runChosen(Arr.headNonEmpty(ranking).id, read.input, matched, read.ranking),
          ),
        RouteUncertain: (uncertain, read) =>
          Effect.fail(
            new RoutingUncertainError({ reason: uncertain.reason, ranked: read.ranking }),
          ),
        RouteNone: (none) => Effect.fail(new NoEligibleProcedureError({ reason: none.reason })),
        CommandRejected: (rejected) =>
          Effect.fail(
            new ProcedureCommandRejectedError({
              membership: options.membership,
              issue: rejected.issue,
              cause: rejected,
            }),
          ),
      })
      .run(request)
  },
)

/**
 * The same shell for a caller that installed an `onUncertain` handler: the
 * handler's answer — a value or an Effect — becomes the invocation's value, so
 * the routing refusal never fires.
 */
export const invokeProcedureWithFallback: {
  <
    Input,
    Projected,
    Value,
    Failure,
    Requirements,
    R,
    Ids extends string,
    FallbackValue,
    FallbackError = never,
    FallbackServices = never,
  >(
    options: InvokeProcedureOptions<Input, Projected, Value, Failure, Requirements, R, Ids>,
  ): (
    request: FallbackInvocation<Input, FallbackValue, FallbackError, FallbackServices>,
  ) => Effect.Effect<
    { readonly route: Route; readonly value: Value | FallbackValue },
    | Failure
    | FallbackError
    | AiError.AiError
    | DecisionIdCollisionError
    | ProcedureCommandRejectedError
    | NoEligibleProcedureError
    | DepthExceededError,
    R | Requirements | FallbackServices
  >
  <
    Input,
    Projected,
    Value,
    Failure,
    Requirements,
    R,
    Ids extends string,
    FallbackValue,
    FallbackError = never,
    FallbackServices = never,
  >(
    options: InvokeProcedureOptions<Input, Projected, Value, Failure, Requirements, R, Ids>,
    request: FallbackInvocation<Input, FallbackValue, FallbackError, FallbackServices>,
  ): Effect.Effect<
    { readonly route: Route; readonly value: Value | FallbackValue },
    | Failure
    | FallbackError
    | AiError.AiError
    | DecisionIdCollisionError
    | ProcedureCommandRejectedError
    | NoEligibleProcedureError
    | DepthExceededError,
    R | Requirements | FallbackServices
  >
} = dual(
  2,
  <
    Input,
    Projected,
    Value,
    Failure,
    Requirements,
    R,
    Ids extends string,
    FallbackValue,
    FallbackError = never,
    FallbackServices = never,
  >(
    options: InvokeProcedureOptions<Input, Projected, Value, Failure, Requirements, R, Ids>,
    request: FallbackInvocation<Input, FallbackValue, FallbackError, FallbackServices>,
  ): Effect.Effect<
    { readonly route: Route; readonly value: Value | FallbackValue },
    | Failure
    | FallbackError
    | AiError.AiError
    | DecisionIdCollisionError
    | ProcedureCommandRejectedError
    | NoEligibleProcedureError
    | DepthExceededError,
    R | Requirements | FallbackServices
  > => {
    const readInvoke = (
      invocation: FallbackInvocation<Input, FallbackValue, FallbackError, FallbackServices>,
    ) =>
      Effect.gen(function*() {
        yield* depthGate
        const thresholds = thresholdsOf(invocation.options.routing)
        const facts = yield* eligibilityFactsOf(options, invocation.input)
        return {
          _tag: 'SelectRoute' as const,
          eligibility: facts.eligibility,
          ranking: facts.ranking,
          minProbability: thresholds.minProbability,
          minMargin: thresholds.minMargin,
          input: invocation.input,
          options: invocation.options,
        }
      })

    const runChosen = (
      id: Ids,
      input: Input,
      matched: (typeof RouteMatched)['Encoded'],
      ranking: ReadonlyArray<RouteCandidate>,
    ): Effect.Effect<
      { readonly route: Route; readonly value: Value },
      Failure | NoEligibleProcedureError,
      Requirements
    > =>
      Effect.flatMap(CurrentDepth.useSync((depth) => depth), (depth) =>
        Effect.map(
          Effect.provideService(options.runMember(id, input), CurrentDepth, depth + 1),
          (value) => ({ route: new RouteMatched({ ...matched, ranked: ranking }), value }),
        ))

    return Sandwich.named('discern.procedure.invoke')(readInvoke)
      .decide(selectRoute)
      .write({
        RouteMatched: (matched, read) =>
          Effect.flatMap(
            Effect.filterOrFail(
              Effect.succeed(read.ranking),
              Arr.isReadonlyArrayNonEmpty,
              () => new NoEligibleProcedureError({ reason: 'no procedure is eligible for this input' }),
            ),
            (ranking) => runChosen(Arr.headNonEmpty(ranking).id, read.input, matched, read.ranking),
          ),
        RouteUncertain: (uncertain, read) => {
          const route = new RouteUncertain({ ...uncertain, ranked: read.ranking })
          return Effect.map(handlerEffectOf(read.options.onUncertain(read.input, route)), (value) => ({ route, value }))
        },
        RouteNone: (none) => Effect.fail(new NoEligibleProcedureError({ reason: none.reason })),
        CommandRejected: (rejected) =>
          Effect.fail(
            new ProcedureCommandRejectedError({
              membership: options.membership,
              issue: rejected.issue,
              cause: rejected,
            }),
          ),
      })
      .run(request)
  },
)

/**
 * The routing projection of the invoke cell: eligibility, one model ask at
 * most, and the ranked distribution — the same question the cell's read asks,
 * answered without running any procedure.
 */
export const prepareRoute: {
  <Input, Projected, R, Ids extends string = string>(
    input: Input,
    routing: RouteOptions | undefined,
  ): (
    view: RoutingView<Input, Projected, R, Ids>,
  ) => Effect.Effect<Route, AiError.AiError | DecisionIdCollisionError, R>
  <Input, Projected, R, Ids extends string = string>(
    view: RoutingView<Input, Projected, R, Ids>,
    input: Input,
    routing: RouteOptions | undefined,
  ): Effect.Effect<Route, AiError.AiError | DecisionIdCollisionError, R>
} = dual(
  3,
  <Input, Projected, R, Ids extends string = string>(
    view: RoutingView<Input, Projected, R, Ids>,
    input: Input,
    routing: RouteOptions | undefined,
  ): Effect.Effect<Route, AiError.AiError | DecisionIdCollisionError, R> => {
    const thresholds = thresholdsOf(routing)
    return Effect.map(eligibilityFactsOf(view, input), (facts) =>
      routeDecisionOf(
        new SelectRoute({
          eligibility: facts.eligibility,
          minProbability: thresholds.minProbability,
          minMargin: thresholds.minMargin,
        }),
      ))
  },
)
