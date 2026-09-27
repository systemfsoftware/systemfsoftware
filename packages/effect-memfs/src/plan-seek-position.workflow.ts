import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Match, Schema } from 'effect'
import * as Result from 'effect/Result'
import { PlanSeekPosition, SeekMoved, SeekPositionDecision, SeekRefused } from './plan-seek-position.schema.js'

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
