import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Match, Schema } from 'effect'
import * as Result from 'effect/Result'

const PeerCloseTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/effect-daemon-socket/PeerCloseDecision',
)
type PeerCloseTypeId = typeof PeerCloseTypeId

export class PeerClosedCleanly extends Schema.TaggedClass<PeerClosedCleanly>()('PeerClosedCleanly', {}) {
  readonly [PeerCloseTypeId] = PeerCloseTypeId
}

export class PeerClosedAbnormally extends Schema.TaggedClass<PeerClosedAbnormally>()('PeerClosedAbnormally', {}) {
  readonly [PeerCloseTypeId] = PeerCloseTypeId
}

export const PeerCloseDecision = Schema.Union([PeerClosedCleanly, PeerClosedAbnormally])
export type PeerCloseDecision = typeof PeerCloseDecision.Type

export class ClassifyPeerClose extends Schema.TaggedClass<ClassifyPeerClose>()('ClassifyPeerClose', {
  code: Schema.Int,
}) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}

const CLEAN_CLOSE_CODE = 1000

const decisionOf = (code: number): PeerCloseDecision =>
  Match.value(code === CLEAN_CLOSE_CODE).pipe(
    Match.when(true, () => PeerClosedCleanly.make()),
    Match.when(false, () => PeerClosedAbnormally.make()),
    Match.exhaustive,
  )

export const classifyPeerClose = Workflow.make({
  command: ClassifyPeerClose,
  decision: PeerCloseDecision,
  error: Schema.Never,
  decide: (command): Result.Result<PeerCloseDecision, never> => Result.succeed(decisionOf(command.code)),
})
