import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Schema } from 'effect'

const WatchEventDecisionTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/effect-memfs/WatchEventDecision',
)
type WatchEventDecisionTypeId = typeof WatchEventDecisionTypeId

export class WatchCreate extends Schema.TaggedClass<WatchCreate>()('WatchCreate', {
  path: Schema.String,
}) {
  readonly [WatchEventDecisionTypeId] = WatchEventDecisionTypeId
}

export class WatchUpdate extends Schema.TaggedClass<WatchUpdate>()('WatchUpdate', {
  path: Schema.String,
}) {
  readonly [WatchEventDecisionTypeId] = WatchEventDecisionTypeId
}

export class WatchRemove extends Schema.TaggedClass<WatchRemove>()('WatchRemove', {
  path: Schema.String,
}) {
  readonly [WatchEventDecisionTypeId] = WatchEventDecisionTypeId
}

export const WatchEventDecision = Schema.Union([WatchCreate, WatchUpdate, WatchRemove])
export type WatchEventDecision = typeof WatchEventDecision.Type

export const DriverWatchEventType = Schema.Literals(['rename', 'change'])
export type DriverWatchEventType = typeof DriverWatchEventType.Type

export class DriverWatchEvent extends Schema.TaggedClass<DriverWatchEvent>()('DriverWatchEvent', {
  eventType: DriverWatchEventType,
  filename: Schema.String,
  exists: Schema.Boolean,
}) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}
