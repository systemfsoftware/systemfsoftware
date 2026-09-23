import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Match, Schema } from 'effect'
import * as Result from 'effect/Result'

const WatchEventDecisionTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/effect-memfs/WatchEventDecision',
)
type WatchEventDecisionTypeId = typeof WatchEventDecisionTypeId

/**
 * The decision variants are declared here rather than in a sibling `*.schema.ts`:
 * a decision's pure body may import no other module's values (`make-body-purity`),
 * so the workflow owns the decision it constructs. The schema-law generator picks
 * the exported schemas up from this module like any other in `src/`.
 */
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
  static readonly [Workflow.InstrumentationBrand] = [] as const
}

class WatchCreateOutcome extends Schema.TaggedClass<WatchCreateOutcome>()('WatchCreateOutcome', {}) {}
class WatchRemoveOutcome extends Schema.TaggedClass<WatchRemoveOutcome>()('WatchRemoveOutcome', {}) {}
class WatchUpdateOutcome extends Schema.TaggedClass<WatchUpdateOutcome>()('WatchUpdateOutcome', {}) {}

type WatchStepOutcome = WatchCreateOutcome | WatchRemoveOutcome | WatchUpdateOutcome

const classifyRename = (exists: boolean): WatchStepOutcome =>
  Match.value(exists).pipe(
    Match.when(true, (): WatchStepOutcome => new WatchCreateOutcome({})),
    Match.when(false, (): WatchStepOutcome => new WatchRemoveOutcome({})),
    Match.exhaustive,
  )

const classifyWatchEvent = (eventType: 'rename' | 'change', exists: boolean): WatchStepOutcome =>
  Match.value(eventType).pipe(
    Match.when('rename', (): WatchStepOutcome => classifyRename(exists)),
    Match.when('change', (): WatchStepOutcome => new WatchUpdateOutcome({})),
    Match.exhaustive,
  )

export const decodeWatchEvent = Workflow.make({
  command: DriverWatchEvent,
  decision: WatchEventDecision,
  error: Schema.Never,
  decide: (command): Result.Result<WatchEventDecision, never> =>
    Match.value(classifyWatchEvent(command.eventType, command.exists)).pipe(
      Match.tag('WatchCreateOutcome', () => Result.succeed(new WatchCreate({ path: command.filename }))),
      Match.tag('WatchRemoveOutcome', () => Result.succeed(new WatchRemove({ path: command.filename }))),
      Match.tag('WatchUpdateOutcome', () => Result.succeed(new WatchUpdate({ path: command.filename }))),
      Match.exhaustive,
    ),
})
