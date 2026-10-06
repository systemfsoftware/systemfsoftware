import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Match, Schema } from 'effect'
import * as Result from 'effect/Result'

const AsyncReadDecisionTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/effect-atom/AsyncReadDecision',
)
type AsyncReadDecisionTypeId = typeof AsyncReadDecisionTypeId

export class SuspendImmediately extends Schema.TaggedClass<SuspendImmediately>()('SuspendImmediately', {}) {
  readonly [AsyncReadDecisionTypeId] = AsyncReadDecisionTypeId
}

export class AwaitNextResult extends Schema.TaggedClass<AwaitNextResult>()('AwaitNextResult', {}) {
  readonly [AsyncReadDecisionTypeId] = AsyncReadDecisionTypeId
}

export class KeepAwaiting extends Schema.TaggedClass<KeepAwaiting>()('KeepAwaiting', {}) {
  readonly [AsyncReadDecisionTypeId] = AsyncReadDecisionTypeId
}

export class ResolveWithResult extends Schema.TaggedClass<ResolveWithResult>()('ResolveWithResult', {}) {
  readonly [AsyncReadDecisionTypeId] = AsyncReadDecisionTypeId
}

export const AsyncReadDecision = Schema.Union([
  SuspendImmediately,
  AwaitNextResult,
  KeepAwaiting,
  ResolveWithResult,
])
export type AsyncReadDecision = typeof AsyncReadDecision.Type

export const AsyncReadStage = Schema.Literals(['immediate', 'await-start', 'await-event'])
export type AsyncReadStage = typeof AsyncReadStage.Type

export const AsyncResultPhase = Schema.Literals(['initial', 'success', 'failure'])
export type AsyncResultPhase = typeof AsyncResultPhase.Type

export class AsyncRead extends Schema.TaggedClass<AsyncRead>()('AsyncRead', {
  stage: AsyncReadStage,
  phase: AsyncResultPhase,
  waiting: Schema.Boolean,
  suspendOnWaiting: Schema.Boolean,
}) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}

const waitingSuspends = (command: AsyncRead): boolean => ![command.suspendOnWaiting, command.waiting].includes(false)

const suspends = (command: AsyncRead): boolean => [command.phase === 'initial', waitingSuspends(command)].includes(true)

const suspendOrResolve = (
  command: AsyncRead,
  suspended: AsyncReadDecision,
): AsyncReadDecision =>
  Match.value(suspends(command)).pipe(
    Match.when(true, () => suspended),
    Match.when(false, () => ResolveWithResult.make({})),
    Match.exhaustive,
  )

const stageVerdict = (command: AsyncRead): AsyncReadDecision =>
  Match.value(command.stage).pipe(
    Match.when('immediate', () => suspendOrResolve(command, SuspendImmediately.make({}))),
    Match.when('await-start', () => suspendOrResolve(command, AwaitNextResult.make({}))),
    Match.when('await-event', () => suspendOrResolve(command, KeepAwaiting.make({}))),
    Match.exhaustive,
  )

export const judgeAsyncRead = Workflow.make({
  command: AsyncRead,
  decision: AsyncReadDecision,
  error: Schema.Never,
  decide: (command): Result.Result<AsyncReadDecision, never> => Result.succeed(stageVerdict(command)),
})
