import { Cause, Exit, Match, Option, Schema } from 'effect'
import { abnormalReasonOfCause } from '../kernel/TerminationReport.schema.js'
import type { TerminationReason } from '../kernel/TerminationReport.schema.js'
import type { SupervisorTerminated } from './SupervisorTerminated.schema.js'

const ChildExitTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/effect-daemon-spec/ChildExitDecision',
)
type ChildExitTypeId = typeof ChildExitTypeId

/** The child ended on its own success. */
export class NormalExit extends Schema.TaggedClass<NormalExit>()('Normal', {}) {
  readonly [ChildExitTypeId] = ChildExitTypeId
}

/** The child was interrupted — an owned shutdown, or one it raised itself. */
export class ShutdownExit extends Schema.TaggedClass<ShutdownExit>()('Shutdown', {}) {
  readonly [ChildExitTypeId] = ChildExitTypeId
}

/** The child failed with something other than an interruption. */
export class AbnormalExit extends Schema.TaggedClass<AbnormalExit>()('Abnormal', {}) {
  readonly [ChildExitTypeId] = ChildExitTypeId
}

export const ChildExitDecision = Schema.Union([NormalExit, ShutdownExit, AbnormalExit])
export type ChildExitDecision = typeof ChildExitDecision.Type

/** A classified exit beside the exit it classified, so the abnormal report can name its cause. */
export interface ChildExitTermination {
  readonly decision: ChildExitDecision
  readonly exit: Exit.Exit<void, SupervisorTerminated>
}

const NORMAL: TerminationReason = { _tag: 'Normal' }

const SHUTDOWN: TerminationReason = { _tag: 'Shutdown' }

const causeOf = (exit: Exit.Exit<void, SupervisorTerminated>): Cause.Cause<SupervisorTerminated> =>
  exit.pipe(Exit.getCause, Option.getOrElse(() => Cause.empty))

export const terminationReasonOf = (bearing: ChildExitTermination): TerminationReason =>
  Match.value(bearing.decision).pipe(
    Match.tag('Normal', (): TerminationReason => NORMAL),
    Match.tag('Shutdown', (): TerminationReason => SHUTDOWN),
    Match.tag('Abnormal', (): TerminationReason => bearing.exit.pipe(causeOf, abnormalReasonOfCause)),
    Match.exhaustive,
  )
