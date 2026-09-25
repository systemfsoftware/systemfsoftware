import { Sandwich } from '@systemfsoftware/effect-cell-types'
import { Clock, Effect, PubSub, Ref, Result, Schema, Scope } from 'effect'
import { evolveSupervisor, SupervisionEvolution } from '../kernel/evolve-supervisor.workflow.js'
import {
  interpretSupervisionEvent,
  Stale,
  SupervisionDecision,
  SupervisionStep,
  type SupervisorState,
} from '../kernel/interpret-supervision-event.workflow.js'
import type { SupervisionEvent } from '../kernel/SupervisionEvent.schema.js'
import type { SupervisorCommands } from '../kernel/SupervisorCommand.schema.js'
import type { TraceEntry } from './running-supervisor.handle.js'
import { stateOf, tracePubSubOf } from './running-supervisor.handle.js'
import { type AcquiredSupervisor, Commands } from './supervisor-commands.js'

export interface StepRuntime {
  readonly acquired: AcquiredSupervisor
}

const readStep = (
  runtime: StepRuntime,
  event: SupervisionEvent,
): Effect.Effect<SupervisionStep, never, never> =>
  Effect.map(
    Effect.zip(Clock.currentTimeMillis, Ref.get(stateOf(runtime.acquired.handle))),
    ([now, state]) => new SupervisionStep({ state, event: { ...event, at: now } }, { disableChecks: true }),
  )
const persistedOf = (
  previous: SupervisorState,
  decision: typeof SupervisionDecision.Encoded,
): SupervisorState =>
  Result.getOrThrow(
    evolveSupervisor(
      new SupervisionEvolution({
        state: previous,
        decision: Result.getOrThrow(Schema.decodeResult(SupervisionDecision)(decision)),
      }),
    ),
  )
const persistStep = (
  runtime: StepRuntime,
  event: SupervisionEvent,
  previous: SupervisorState,
  decision: typeof SupervisionDecision.Encoded,
): Effect.Effect<void, never, never> =>
  Effect.flatMap(
    Effect.suspend(() => Effect.succeed(persistedOf(previous, decision))),
    (next) =>
      Effect.andThen(
        Ref.set(stateOf(runtime.acquired.handle), next),
        PubSub.publish(tracePubSubOf(runtime.acquired.handle), { event, decision } satisfies TraceEntry),
      ),
  )

const runBucketsOf = (
  runtime: StepRuntime,
  commands: SupervisorCommands,
): Effect.Effect<void, never, Scope.Scope> => Commands.runBuckets(runtime.acquired, commands)

const Steps = {
  runtimeOf: (acquired: AcquiredSupervisor): StepRuntime => ({ acquired }),
} as const

export const supervisorStepFor = (runtime: StepRuntime) =>
  Sandwich.named('supervisor.step')((event: SupervisionEvent) => readStep(runtime, event))
    .decide(interpretSupervisionEvent)
    .write({
      Stale: (decision, command) =>
        Effect.andThen(
          persistStep(runtime, command.event, command.state, decision),
          Commands.answerStale(runtime.acquired, command.event),
        ),
      Continue: (decision, command) =>
        Effect.andThen(
          persistStep(runtime, command.event, command.state, decision),
          runBucketsOf(runtime, decision.commands),
        ),
      RestartChildren: (decision, command) =>
        Effect.andThen(
          persistStep(runtime, command.event, command.state, decision),
          runBucketsOf(runtime, decision.commands),
        ),
      StartChildren: (decision, command) =>
        Effect.andThen(
          persistStep(runtime, command.event, command.state, decision),
          runBucketsOf(runtime, decision.commands),
        ),
      CoolDown: (decision, command) =>
        Effect.andThen(
          persistStep(runtime, command.event, command.state, decision),
          runBucketsOf(runtime, decision.commands),
        ),
      StopChildren: (decision, command) =>
        Effect.andThen(
          persistStep(runtime, command.event, command.state, decision),
          runBucketsOf(runtime, decision.commands),
        ),
      Terminate: (decision, command) =>
        Effect.andThen(
          persistStep(runtime, command.event, command.state, decision),
          runBucketsOf(runtime, decision.commands),
        ),
      RefuseDynamicStart: (decision, command) =>
        Effect.andThen(
          persistStep(runtime, command.event, command.state, decision),
          runBucketsOf(runtime, decision.commands),
        ),
      CommandRejected: (_rejected, command) =>
        Effect.andThen(
          persistCommandRejection(runtime, command.event),
          Commands.answerStale(runtime.acquired, command.event),
        ),
    })
const persistCommandRejection = (
  runtime: StepRuntime,
  event: SupervisionEvent,
): Effect.Effect<void, never, never> =>
  PubSub.publish(tracePubSubOf(runtime.acquired.handle), {
    event,
    decision: new Stale({}) satisfies SupervisionDecision,
  }).pipe(Effect.asVoid)

export { Steps }

export interface SupervisorStepCell {
  readonly run: (event: SupervisionEvent) => Effect.Effect<void, never, Scope.Scope>
}
