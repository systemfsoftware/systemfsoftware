import { Sandwich } from '@systemfsoftware/effect-cell-types'
import { Array as Arr, Effect } from 'effect'
import { dual } from 'effect/Function'
import type * as AiError from 'effect/unstable/ai/AiError'
import { DecisionIdCollisionError } from './DiscernError.schema.js'
import {
  DepthExceededError,
  NoEligibleProcedureError,
  ProcedureCommandRejectedError,
  RoutingUncertainError,
} from './ProcedureError.schema.js'
import { type InvokeProcedureOptions, type InvokeRequest, readInvokeOf, runChosenOf } from './routing.js'
import { type Route, selectRoute } from './select-route.workflow.js'

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
  > => {
    const readInvoke = (invocation: InvokeRequest<Input>) =>
      readInvokeOf({ view: options, input: invocation.input, options: invocation.options })

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
            (ranking) =>
              runChosenOf({
                view: options,
                id: Arr.headNonEmpty(ranking).id,
                input: read.input,
                matched,
                ranking: read.ranking,
              }),
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
