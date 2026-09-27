import { Match, Schema } from 'effect'
import type { SupervisionEvent } from '../kernel/SupervisionEvent.schema.js'
import { ChildId, Generation } from '../kernel/SupervisionLimits.schema.js'
import type { SupervisorReply } from '../kernel/SupervisorCommand.schema.js'

export const DynamicStartAccepted = Schema.Struct({
  outcome: Schema.Literal('accepted'),
  childId: ChildId,
  generation: Generation,
})
export type DynamicStartAccepted = typeof DynamicStartAccepted.Type

export const DynamicStartRefused = Schema.Struct({ outcome: Schema.Literal('refused') })
export type DynamicStartRefused = typeof DynamicStartRefused.Type

export const DynamicStartOutcome = Schema.Union([DynamicStartAccepted, DynamicStartRefused])
export type DynamicStartOutcome = typeof DynamicStartOutcome.Type

export const DynamicStopDone = Schema.Struct({ outcome: Schema.Literal('stopped') })
export type DynamicStopDone = typeof DynamicStopDone.Type

export const DynamicStopMissed = Schema.Struct({ outcome: Schema.Literal('missed') })
export type DynamicStopMissed = typeof DynamicStopMissed.Type

export const DynamicStopOutcome = Schema.Union([DynamicStopDone, DynamicStopMissed])
export type DynamicStopOutcome = typeof DynamicStopOutcome.Type

export const DynamicOutcome = Schema.Union([DynamicStartOutcome, DynamicStopOutcome])
export type DynamicOutcome = typeof DynamicOutcome.Type

export const outcomeOf = (reply: SupervisorReply): DynamicOutcome =>
  Match.value(reply).pipe(
    Match.tag('ReplyStartAccepted', (accepted): DynamicOutcome => ({
      outcome: 'accepted',
      childId: accepted.childId,
      generation: accepted.generation,
    })),
    Match.tag('ReplyStartRefused', (): DynamicOutcome => ({ outcome: 'refused' })),
    Match.tag('ReplyStopped', (): DynamicOutcome => ({ outcome: 'stopped' })),
    Match.exhaustive,
  )

export const staleOf = (event: SupervisionEvent): DynamicOutcome =>
  Match.value(event).pipe(
    Match.when({ _tag: 'DynamicStartRequested' }, (): DynamicOutcome => ({ outcome: 'refused' })),
    Match.orElse((): DynamicOutcome => ({ outcome: 'missed' })),
  )
