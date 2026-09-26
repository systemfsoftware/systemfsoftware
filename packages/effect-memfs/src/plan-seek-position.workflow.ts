import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Match, Schema } from 'effect'
import * as Result from 'effect/Result'

const SeekPositionDecisionTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/effect-memfs/SeekPositionDecision',
)
type SeekPositionDecisionTypeId = typeof SeekPositionDecisionTypeId

export class SeekMoved extends Schema.TaggedClass<SeekMoved>()('SeekMoved', {
  position: Schema.BigInt,
}) {
  readonly [SeekPositionDecisionTypeId] = SeekPositionDecisionTypeId
}

export class SeekRefused extends Schema.TaggedClass<SeekRefused>()('SeekRefused', {
  position: Schema.BigInt,
}) {
  readonly [SeekPositionDecisionTypeId] = SeekPositionDecisionTypeId
}

export const SeekPositionDecision = Schema.Union([SeekMoved, SeekRefused])
export type SeekPositionDecision = typeof SeekPositionDecision.Type

export class PlanSeekPosition extends Schema.TaggedClass<PlanSeekPosition>()('PlanSeekPosition', {
  position: Schema.BigInt,
  offset: Schema.BigInt,
  from: Schema.Literals(['start', 'current']),
}) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}

class SeekBeforeStart extends Schema.TaggedClass<SeekBeforeStart>()('SeekBeforeStart', {}) {}
class SeekWithinFile extends Schema.TaggedClass<SeekWithinFile>()('SeekWithinFile', {}) {}

type SeekStepOutcome = SeekBeforeStart | SeekWithinFile

const nextPositionOf = (command: PlanSeekPosition): bigint =>
  Match.value(command.from).pipe(
    Match.when('start', () => command.offset),
    Match.when('current', () => command.position + command.offset),
    Match.exhaustive,
  )

const classifySeek = (next: bigint): SeekStepOutcome =>
  Match.value(next < 0n).pipe(
    Match.when(true, (): SeekStepOutcome => new SeekBeforeStart({})),
    Match.when(false, (): SeekStepOutcome => new SeekWithinFile({})),
    Match.exhaustive,
  )

export const planSeekPosition = Workflow.make({
  command: PlanSeekPosition,
  decision: SeekPositionDecision,
  error: Schema.Never,
  decide: (command): Result.Result<SeekPositionDecision, never> => {
    const next = nextPositionOf(command)
    return Match.value(classifySeek(next)).pipe(
      Match.tag('SeekBeforeStart', () => Result.succeed(new SeekRefused({ position: next }))),
      Match.tag('SeekWithinFile', () => Result.succeed(new SeekMoved({ position: next }))),
      Match.exhaustive,
    )
  },
})
