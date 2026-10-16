import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Match, Schema } from 'effect'
import * as Result from 'effect/Result'
import { BatchPhaseName } from './batch-phase.schema.js'

const ListenerNotifyDecisionTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/effect-atom/ListenerNotifyDecision',
)
type ListenerNotifyDecisionTypeId = typeof ListenerNotifyDecisionTypeId

export class StaySilent extends Schema.TaggedClass<StaySilent>()('StaySilent', {}) {
  readonly [ListenerNotifyDecisionTypeId] = ListenerNotifyDecisionTypeId
}

export class QueueForBatch extends Schema.TaggedClass<QueueForBatch>()('QueueForBatch', {}) {
  readonly [ListenerNotifyDecisionTypeId] = ListenerNotifyDecisionTypeId
}

export class NotifyNow extends Schema.TaggedClass<NotifyNow>()('NotifyNow', {}) {
  readonly [ListenerNotifyDecisionTypeId] = ListenerNotifyDecisionTypeId
}

export const ListenerNotifyDecision = Schema.Union([StaySilent, QueueForBatch, NotifyNow])
export type ListenerNotifyDecision = typeof ListenerNotifyDecision.Type

export class ListenerNotify extends Schema.TaggedClass<ListenerNotify>()('ListenerNotify', {
  batchPhase: BatchPhaseName,
  hasListeners: Schema.Boolean,
}) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}

const queuesForBatch = (command: ListenerNotify): boolean => command.batchPhase === 'collect'

const audibleVerdict = (command: ListenerNotify): ListenerNotifyDecision =>
  Match.value(queuesForBatch(command)).pipe(
    Match.when(true, () => QueueForBatch.make({})),
    Match.when(false, () => NotifyNow.make({})),
    Match.exhaustive,
  )

export const judgeListenerNotify = Workflow.make({
  command: ListenerNotify,
  decision: ListenerNotifyDecision,
  error: Schema.Never,
  decide: (command): Result.Result<ListenerNotifyDecision, never> =>
    Result.succeed(
      Match.value(command.hasListeners).pipe(
        Match.when(true, () => audibleVerdict(command)),
        Match.when(false, () => StaySilent.make({})),
        Match.exhaustive,
      ),
    ),
})
