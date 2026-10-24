import * as Cause from 'effect/Cause'
import * as Duration from 'effect/Duration'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Function from 'effect/Function'
import * as Option from 'effect/Option'
import * as Ref from 'effect/Ref'

import type { ModelFailure, ModelRequest, ModelResponse } from '../model/model.schema.js'
import type { ModelGatewayShape } from '../model/model.service.js'
import type { StepId } from '../verdict/step-record.schema.js'
import { type CallOutcome, type ModelCall, tracedRequestOf } from './ai-trace.schema.js'

type GatewayExit = Exit.Exit<ModelResponse, ModelFailure>

const answeredOf = (response: ModelResponse): CallOutcome => ({
  _tag: 'Answered',
  answer: response.answer,
  finishReason: response.finishReason,
  usage: response.usage,
  served: response.served,
  latencyMillis: Duration.toMillis(response.latency),
})

const failedOf = (failure: ModelFailure): CallOutcome => ({
  _tag: 'Failed',
  code: failure._tag,
  message: failure.message,
})

const outcomeOfCause = (cause: Cause.Cause<ModelFailure>): CallOutcome =>
  Option.match(Cause.findErrorOption(cause), {
    onSome: failedOf,
    onNone: (): CallOutcome =>
      Cause.hasInterruptsOnly(cause) ? { _tag: 'Interrupted' } : { _tag: 'Died', cause: Cause.pretty(cause) },
  })

const outcomeOf = (exit: GatewayExit): CallOutcome =>
  Exit.match(exit, { onSuccess: answeredOf, onFailure: outcomeOfCause })

const appended = (log: Ref.Ref<ReadonlyArray<ModelCall>>, step: StepId, request: ModelRequest, exit: GatewayExit) =>
  Ref.update(log, (calls) => [...calls, { step, request: tracedRequestOf(request), outcome: outcomeOf(exit) }])

/**
 * Records every call the gateway makes, whatever its outcome, appending each to `log` under `step`. The inner
 * exit is returned unchanged; the append runs on exit and is uninterruptible, so an interrupted call is recorded
 * too. The request is projected with its images elided before it reaches the log.
 */
export const recordModelCalls: {
  (log: Ref.Ref<ReadonlyArray<ModelCall>>, step: StepId): (gateway: ModelGatewayShape) => ModelGatewayShape
  (step: StepId): (log: Ref.Ref<ReadonlyArray<ModelCall>>) => (gateway: ModelGatewayShape) => ModelGatewayShape
} = Function.dual(
  2,
  (log: Ref.Ref<ReadonlyArray<ModelCall>>, step: StepId): (gateway: ModelGatewayShape) => ModelGatewayShape =>
  (gateway) => ({
    complete: (request: ModelRequest) =>
      gateway.complete(request).pipe(
        Effect.onExit((exit) => Effect.uninterruptible(appended(log, step, request, exit))),
      ),
  }),
)
