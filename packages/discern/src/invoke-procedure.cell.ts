import { Sandwich } from '@systemfsoftware/effect-cell-types'
import { Array as Arr, Effect, Match, Option, Order, Ordering, Result } from 'effect'
import { dual } from 'effect/Function'
import type * as AiError from 'effect/unstable/ai/AiError'
import { DecisionIdCollisionError } from './DiscernError.schema.js'
import { CurrentDepth, MaxDepth } from './procedure-depth.service.js'
import { type FallbackInvocation, handlerEffectOf, type InvokeOptions } from './procedure.resource.js'
import {
  DepthExceededError,
  NoEligibleProcedureError,
  ProcedureCommandRejectedError,
  RoutingUncertainError,
} from './ProcedureError.schema.js'
import { region } from './region.service.js'
import type { RouteCandidate, RouteOptions } from './Route.schema.js'
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
  readonly probabilities: Record<string, number>
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
export type InvokeRead<Input, Ids extends string = string> = (typeof SelectRoute)['Encoded'] & {
  readonly ranking: ReadonlyArray<RouteCandidate<Ids>>
} & InvokeRequest<Input>

interface Thresholds {
  readonly minProbability: number
  readonly minMargin: number
}

interface RouteQuestion<Ids extends string> {
  readonly eligibility: (typeof SelectRoute)['Encoded']['eligibility']
  readonly ranking: ReadonlyArray<RouteCandidate<Ids>>
  readonly thresholds: Thresholds
}

const ROUTING_DEFAULTS: Thresholds = { minProbability: 0.7, minMargin: 0.15 }

const thresholdOf = (value: number | undefined, fallback: number): number =>
  Option.match(Option.fromUndefinedOr(value), { onNone: () => fallback, onSome: (threshold) => threshold })

const thresholdsOf = (routing: RouteOptions | undefined): Thresholds =>
  Option.match(Option.fromUndefinedOr(routing), {
    onNone: () => ROUTING_DEFAULTS,
    onSome: (options) => ({
      minProbability: thresholdOf(options.minProbability, ROUTING_DEFAULTS.minProbability),
      minMargin: thresholdOf(options.minMargin, ROUTING_DEFAULTS.minMargin),
    }),
  })

const byDescendingProbability: Order.Order<RouteCandidate> = Order.make<RouteCandidate>((self, that) =>
  Ordering.reverse(Order.Number(self.probability, that.probability))
)

/**
 * Slot one candidate into a ranking that already holds at least two, keeping
 * the ranking ordered by descending probability. The ranking is built this way
 * — element by element into a tuple that is two long by construction — so no
 * stage of routing ever holds a ranking that could be short.
 */
const insertByDescendingProbability = <Ids extends string>(
  ranked: readonly [RouteCandidate<Ids>, RouteCandidate<Ids>, ...Array<RouteCandidate<Ids>>],
  candidate: RouteCandidate<Ids>,
): readonly [RouteCandidate<Ids>, RouteCandidate<Ids>, ...Array<RouteCandidate<Ids>>] => {
  const [leader, runnerUp, ...others] = ranked
  return Match.value(candidate.probability > leader.probability).pipe(
    Match.when(true, () => [candidate, ...Arr.sort([leader, runnerUp, ...others], byDescendingProbability)] as const),
    Match.when(
      false,
      () =>
        Match.value(candidate.probability > runnerUp.probability).pipe(
          Match.when(true, () => [leader, candidate, runnerUp, ...others] as const),
          Match.when(
            false,
            () => [leader, runnerUp, ...Arr.sort([...others, candidate], byDescendingProbability)] as const,
          ),
          Match.exhaustive,
        ),
    ),
    Match.exhaustive,
  )
}

const rankedTupleOf = <Ids extends string>(
  candidates: readonly [Ids, Ids, ...Array<Ids>],
  probabilities: Record<string, number>,
): readonly [RouteCandidate<Ids>, RouteCandidate<Ids>, ...Array<RouteCandidate<Ids>>] => {
  const [first, second, ...rest] = candidates
  const score = (id: Ids): RouteCandidate<Ids> => ({ id, probability: probabilities[id] ?? 0 })
  const initial: readonly [RouteCandidate<Ids>, RouteCandidate<Ids>, ...Array<RouteCandidate<Ids>>] = Match.value(
    score(first).probability >= score(second).probability,
  ).pipe(
    Match.when(true, () => [score(first), score(second)] as const),
    Match.when(false, () => [score(second), score(first)] as const),
    Match.exhaustive,
  )
  return Arr.reduce(rest, initial, (ranked, id) => insertByDescendingProbability(ranked, score(id)))
}

const prepareRouting = <Input, Projected, R, Ids extends string>(
  view: RoutingView<Input, Projected, R, Ids>,
  input: Input,
  thresholds: Thresholds,
): Effect.Effect<RouteQuestion<Ids>, AiError.AiError | DecisionIdCollisionError, R> => {
  const candidates = view.eligibleIds(input)
  return Arr.match(candidates, {
    onEmpty: () =>
      Effect.succeed({ eligibility: new NoEligible({ membership: view.membership }), ranking: [], thresholds }),
    onNonEmpty: ([first, ...rest]) =>
      Arr.match(rest, {
        onEmpty: () =>
          Effect.succeed({
            eligibility: new OneEligible({ candidate: { id: first, probability: 1 } }),
            ranking: [{ id: first, probability: 1 }],
            thresholds,
          }),
        onNonEmpty: ([second, ...more]) =>
          Effect.map(
            region('route')(view.askRouting(candidates, view.select(input))),
            (answer) => {
              const ranking = rankedTupleOf([first, second, ...more], answer.probabilities)
              const [leader, runnerUp] = ranking
              return {
                eligibility: new ManyEligible({ leader, runnerUp, ranked: ranking }),
                ranking,
                thresholds,
              }
            },
          ),
      }),
  })
}

const routeDecisionOf = (command: SelectRoute): Route =>
  Result.match(selectRoute(command), {
    onFailure: (refusal) => refusal,
    onSuccess: (decision) => decision,
  })

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
        const limit = yield* MaxDepth.useSync((value) => value)
        const depth = yield* CurrentDepth.useSync((value) => value)
        if (depth >= limit) {
          return yield* new DepthExceededError({ depth, limit })
        }
        return yield* Effect.map(
          prepareRouting(options, invocation.input, thresholdsOf(invocation.options.routing)),
          (question) => ({
            _tag: 'SelectRoute' as const,
            eligibility: question.eligibility,
            ranking: question.ranking,
            minProbability: question.thresholds.minProbability,
            minMargin: question.thresholds.minMargin,
            input: invocation.input,
            options: invocation.options,
          }),
        )
      })

    const runChosen = (
      id: Ids,
      input: Input,
      matched: (typeof RouteMatched)['Encoded'],
    ): Effect.Effect<
      { readonly route: Route; readonly value: Value },
      Failure | NoEligibleProcedureError,
      Requirements
    > =>
      Effect.flatMap(CurrentDepth.useSync((depth) => depth), (depth) =>
        Effect.map(
          Effect.provideService(options.runMember(id, input), CurrentDepth, depth + 1),
          (value) => ({ route: new RouteMatched(matched), value }),
        ))

    return Sandwich.named('discern.procedure.invoke')(readInvoke)
      .decide(selectRoute)
      .write({
        RouteMatched: (matched, read) =>
          Arr.match(read.ranking, {
            onEmpty: () =>
              Effect.fail(new NoEligibleProcedureError({ reason: 'no procedure is eligible for this input' })),
            onNonEmpty: ([leader]) => runChosen(leader.id, read.input, matched),
          }),
        RouteUncertain: (uncertain) =>
          Effect.fail(new RoutingUncertainError({ reason: uncertain.reason, ranked: uncertain.ranked })),
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
        const limit = yield* MaxDepth.useSync((value) => value)
        const depth = yield* CurrentDepth.useSync((value) => value)
        if (depth >= limit) {
          return yield* new DepthExceededError({ depth, limit })
        }
        return yield* Effect.map(
          prepareRouting(options, invocation.input, thresholdsOf(invocation.options.routing)),
          (question) => ({
            _tag: 'SelectRoute' as const,
            eligibility: question.eligibility,
            ranking: question.ranking,
            minProbability: question.thresholds.minProbability,
            minMargin: question.thresholds.minMargin,
            input: invocation.input,
            options: invocation.options,
          }),
        )
      })

    const runChosen = (
      id: Ids,
      input: Input,
      matched: (typeof RouteMatched)['Encoded'],
    ): Effect.Effect<
      { readonly route: Route; readonly value: Value },
      Failure | NoEligibleProcedureError,
      Requirements
    > =>
      Effect.flatMap(CurrentDepth.useSync((depth) => depth), (depth) =>
        Effect.map(
          Effect.provideService(options.runMember(id, input), CurrentDepth, depth + 1),
          (value) => ({ route: new RouteMatched(matched), value }),
        ))

    return Sandwich.named('discern.procedure.invoke')(readInvoke)
      .decide(selectRoute)
      .write({
        RouteMatched: (matched, read) =>
          Arr.match(read.ranking, {
            onEmpty: () =>
              Effect.fail(new NoEligibleProcedureError({ reason: 'no procedure is eligible for this input' })),
            onNonEmpty: ([leader]) => runChosen(leader.id, read.input, matched),
          }),
        RouteUncertain: (uncertain, read) =>
          Effect.map(handlerEffectOf(read.options.onUncertain(read.input, uncertain)), (value) => ({
            route: new RouteUncertain(uncertain),
            value,
          })),
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
    return Effect.map(prepareRouting(view, input, thresholds), (question) =>
      routeDecisionOf(
        new SelectRoute({
          eligibility: question.eligibility,
          minProbability: question.thresholds.minProbability,
          minMargin: question.thresholds.minMargin,
        }),
      ))
  },
)
