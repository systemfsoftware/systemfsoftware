import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Match, Schema } from 'effect'
import * as Result from 'effect/Result'

const SeekDecisionTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/effect-memfs/SeekDecision',
)
type SeekDecisionTypeId = typeof SeekDecisionTypeId

export class SeekPlanned extends Schema.TaggedClass<SeekPlanned>()('SeekPlanned', {
  position: Schema.BigInt,
}) {
  readonly [SeekDecisionTypeId] = SeekDecisionTypeId
}

export class SeekBeforeStart extends Schema.TaggedError<SeekBeforeStart>()('SeekBeforeStart', {
  cause: Schema.optional(Schema.Unknown),
}) {
  readonly [SeekDecisionTypeId] = SeekDecisionTypeId
}

export type SeekDecision = SeekPlanned | SeekBeforeStart

export class PlanSeek extends Schema.TaggedClass<PlanSeek>()('PlanSeek', {
  position: Schema.BigInt,
  offset: Schema.BigInt,
  from: Schema.Literals(['start', 'current']),
}) {
  static readonly [Workflow.InstrumentationBrand] = [] as const
}

class SeekNegativeOutcome extends Schema.TaggedClass<SeekNegativeOutcome>()('SeekNegativeOutcome', {}) {}
class SeekValidOutcome extends Schema.TaggedClass<SeekValidOutcome>()('SeekValidOutcome', {}) {}

type SeekStepOutcome = SeekNegativeOutcome | SeekValidOutcome

const classifyPosition = (next: bigint): SeekStepOutcome =>
  Match.value(next < 0n).pipe(
    Match.when(true, (): SeekStepOutcome => new SeekNegativeOutcome({})),
    Match.when(false, (): SeekStepOutcome => new SeekValidOutcome({})),
    Match.exhaustive,
  )

const computeNext = (position: bigint, offset: bigint, from: 'start' | 'current'): bigint =>
  Match.value(from).pipe(
    Match.when('start', () => offset),
    Match.when('current', () => position + offset),
    Match.exhaustive,
  )

export const planSeek = Workflow.make(
  PlanSeek,
  (command): Result.Result<SeekDecision, SeekBeforeStart> => {
    const next = computeNext(command.position, command.offset, command.from)
    return Match.value(classifyPosition(next)).pipe(
      Match.tag('SeekNegativeOutcome', () => Result.fail(new SeekBeforeStart({}))),
      Match.tag('SeekValidOutcome', () => Result.succeed(new SeekPlanned({ position: next }))),
      Match.exhaustive,
    )
  },
)
