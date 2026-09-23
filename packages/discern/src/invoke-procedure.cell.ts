import { Sandwich } from '@systemfsoftware/effect-cell-types'
import { Array as Arr, Effect, Option, Order, Ordering, Result } from 'effect'
import * as AiError from 'effect/unstable/ai/AiError'
import { CurrentDepth, MaxDepth } from './procedure-depth.service.js'
import { type FallbackInvocation, handlerEffectOf, type InvokeOptions } from './procedure.resource.js'
import { DepthExceededError, NoEligibleProcedureError, RoutingUncertainError } from './ProcedureError.schema.js'
import { region } from './region.service.js'
import type { RouteCandidate, RouteOptions } from './Route.schema.js'
import {
  type EligibilityOutcome,
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

/** How the routing decision is asked for one request: narrowed to the eligible candidates. */
export type AskRouting<Projected, R> = (
  candidates: ReadonlyArray<string>,
  input: Projected,
) => Effect.Effect<RoutingAnswer, AiError.AiError, R>

/** What the routing shell needs from the registry to route one request. */
export interface RoutingView<Input, Projected, R> {
  /** Every member id, so the none-eligible reason names what was considered. */
  readonly membership: ReadonlyArray<string>
  /** The ids of the members whose eligibility holds for this input. */
  readonly eligibleIds: (input: Input) => ReadonlyArray<string>
  readonly select: (input: Input) => Projected
  readonly askRouting: AskRouting<Projected, R>
}

export interface InvokeProcedureOptions<Input, Projected, Value, Failure, Requirements, R>
  extends RoutingView<Input, Projected, R>
{
  /** Run one member by id. Reaching it with an id outside the registry is a defect. */
  readonly runMember: (id: string, input: Input) => Effect.Effect<Value, Failure, Requirements>
}

/** One invocation of a registry: the request and how its caller handles uncertainty. */
export interface InvokeRequest<Input> {
  readonly input: Input
  readonly options: InvokeOptions<Input>
}

/** What the read phase hands the routing decision: the encoded command plus the live request. */
export type InvokeRead<Input> = (typeof SelectRoute)['Encoded'] & InvokeRequest<Input>

interface Thresholds {
  readonly minProbability: number
  readonly minMargin: number
}

interface RouteQuestion {
  readonly eligibility: EligibilityOutcome
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

const questionOf = (eligibility: EligibilityOutcome, thresholds: Thresholds): RouteQuestion => ({
  eligibility,
  thresholds,
})

const byDescendingProbability: Order.Order<RouteCandidate> = Order.make<RouteCandidate>((self, that) =>
  Ordering.reverse(Order.Number(self.probability, that.probability))
)

const rankedOf = (
  candidates: ReadonlyArray<string>,
  probabilities: Record<string, number>,
): ReadonlyArray<RouteCandidate> =>
  Arr.sort(
    Arr.map(candidates, (id) => ({ id, probability: probabilities[id] ?? 0 })),
    byDescendingProbability,
  )

const leadingPairOf = (
  ranked: ReadonlyArray<RouteCandidate>,
): Option.Option<readonly [RouteCandidate, RouteCandidate]> =>
  Option.flatMap(
    Arr.head(ranked),
    (leader) =>
      Option.map(Arr.head(Arr.drop(ranked, 1)), (runnerUp): readonly [RouteCandidate, RouteCandidate] => [
        leader,
        runnerUp,
      ]),
  )

const rankedQuestion = (
  candidates: ReadonlyArray<string>,
  probabilities: Record<string, number>,
  thresholds: Thresholds,
): Effect.Effect<RouteQuestion> => {
  const ranked = rankedOf(candidates, probabilities)
  return Option.match(leadingPairOf(ranked), {
    onNone: () => Effect.die(new Error('routing ranked fewer than two candidates for two or more eligible procedures')),
    onSome: ([leader, runnerUp]) =>
      Effect.succeed(questionOf(new ManyEligible({ leader, runnerUp, ranked }), thresholds)),
  })
}

const routeDecisionOf = (command: SelectRoute): Route =>
  Result.match(selectRoute(command), {
    onFailure: (refusal) => refusal,
    onSuccess: (decision) => decision,
  })

const prepareRouting = <Input, Projected, R>(
  view: RoutingView<Input, Projected, R>,
  input: Input,
  thresholds: Thresholds,
): Effect.Effect<RouteQuestion, AiError.AiError, R> => {
  const candidates = view.eligibleIds(input)
  return Option.match(Arr.head(candidates), {
    onNone: () => Effect.succeed(questionOf(new NoEligible({ membership: view.membership }), thresholds)),
    onSome: (first) =>
      Option.match(Arr.head(Arr.drop(candidates, 1)), {
        onNone: () =>
          Effect.succeed(questionOf(new OneEligible({ candidate: { id: first, probability: 1 } }), thresholds)),
        onSome: () =>
          Effect.flatMap(
            region('route')(view.askRouting(candidates, view.select(input))),
            (answer) => rankedQuestion(candidates, answer.probabilities, thresholds),
          ),
      }),
  })
}

/**
 * The imperative shell of one registry invocation: the read enforces the depth
 * limit, applies eligibility, asks the routing decision only when more than one
 * member is eligible, and ranks the distribution; the handlers run the chosen
 * procedure at depth+1 inside a `route` region or refuse.
 *
 * Without an `onUncertain` handler, an unroutable request fails with
 * {@link RoutingUncertainError} rather than guessing. The chain is built per
 * invocation because the fallback's type is the caller's; spans and the
 * duration metric belong to the name, so per-call construction shares them
 * with every other invocation.
 */
export const invokeProcedure = <Input, Projected, Value, Failure, Requirements, R>(
  options: InvokeProcedureOptions<Input, Projected, Value, Failure, Requirements, R>,
  request: InvokeRequest<Input>,
): Effect.Effect<
  { readonly route: Route; readonly value: Value },
  | Failure
  | AiError.AiError
  | AiError.InvalidRequestError
  | NoEligibleProcedureError
  | DepthExceededError
  | RoutingUncertainError,
  R | Requirements
> => {
  const readInvoke = (invocation: InvokeRequest<Input>) =>
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
          minProbability: question.thresholds.minProbability,
          minMargin: question.thresholds.minMargin,
          input: invocation.input,
          options: invocation.options,
        }),
      )
    })

  return Sandwich.named('discern.procedure.invoke')(readInvoke)
    .decide(selectRoute)
    .write({
      RouteMatched: (matched, read) =>
        Effect.flatMap(CurrentDepth.useSync((depth) => depth), (depth) =>
          Effect.map(
            Effect.provideService(options.runMember(matched.id, read.input), CurrentDepth, depth + 1),
            (value) => ({ route: new RouteMatched(matched), value }),
          )),
      RouteUncertain: (uncertain) =>
        Effect.fail(new RoutingUncertainError({ reason: uncertain.reason, ranked: uncertain.ranked })),
      RouteNone: (none) => Effect.fail(new NoEligibleProcedureError({ reason: none.reason })),
      CommandRejected: (rejected) => Effect.fail(new AiError.InvalidRequestError({ description: rejected.issue })),
    })
    .run(request)
}

/**
 * The same shell for a caller that installed an `onUncertain` handler: the
 * handler's answer — a value or an Effect — becomes the invocation's value, so
 * the routing refusal never fires.
 */
export const invokeProcedureWithFallback = <
  Input,
  Projected,
  Value,
  Failure,
  Requirements,
  R,
  FallbackValue,
  FallbackError = never,
  FallbackServices = never,
>(
  options: InvokeProcedureOptions<Input, Projected, Value, Failure, Requirements, R>,
  request: FallbackInvocation<Input, FallbackValue, FallbackError, FallbackServices>,
): Effect.Effect<
  { readonly route: Route; readonly value: Value | FallbackValue },
  | Failure
  | FallbackError
  | AiError.AiError
  | AiError.InvalidRequestError
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
          minProbability: question.thresholds.minProbability,
          minMargin: question.thresholds.minMargin,
          input: invocation.input,
          options: invocation.options,
        }),
      )
    })

  return Sandwich.named('discern.procedure.invoke')(readInvoke)
    .decide(selectRoute)
    .write({
      RouteMatched: (matched, read) =>
        Effect.flatMap(CurrentDepth.useSync((depth) => depth), (depth) =>
          Effect.map(
            Effect.provideService(options.runMember(matched.id, read.input), CurrentDepth, depth + 1),
            (value) => ({ route: new RouteMatched(matched), value }),
          )),
      RouteUncertain: (uncertain, read) =>
        Effect.map(handlerEffectOf(read.options.onUncertain(read.input, uncertain)), (value) => ({
          route: new RouteUncertain(uncertain),
          value,
        })),
      RouteNone: (none) => Effect.fail(new NoEligibleProcedureError({ reason: none.reason })),
      CommandRejected: (rejected) => Effect.fail(new AiError.InvalidRequestError({ description: rejected.issue })),
    })
    .run(request)
}

/**
 * The routing projection of the invoke cell: eligibility, one model ask at
 * most, and the ranked distribution — the same question the cell's read asks,
 * answered without running any procedure.
 */
export const prepareRoute = <Input, Projected, R>(
  view: RoutingView<Input, Projected, R>,
  input: Input,
  routing: RouteOptions | undefined,
): Effect.Effect<Route, AiError.AiError, R> => {
  const thresholds = thresholdsOf(routing)
  return Effect.map(prepareRouting(view, input, thresholds), (question) =>
    routeDecisionOf(
      new SelectRoute({
        eligibility: question.eligibility,
        minProbability: question.thresholds.minProbability,
        minMargin: question.thresholds.minMargin,
      }),
    ))
}
