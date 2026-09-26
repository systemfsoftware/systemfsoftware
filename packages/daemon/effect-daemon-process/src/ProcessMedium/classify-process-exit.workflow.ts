import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Match, Option, Schema } from 'effect'
import * as Result from 'effect/Result'
import { ProcessExit } from './ProcessExit.schema.js'

const ProcessExitDecisionTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/effect-daemon-process/ProcessExitDecision',
)
type ProcessExitDecisionTypeId = typeof ProcessExitDecisionTypeId

export class ProcessExitNormal extends Schema.TaggedClass<ProcessExitNormal>()('ProcessExitNormal', {}) {
  readonly [ProcessExitDecisionTypeId] = ProcessExitDecisionTypeId
}

export class ProcessExitAbnormal extends Schema.TaggedClass<ProcessExitAbnormal>()('ProcessExitAbnormal', {
  code: Schema.Int,
  signal: Schema.String,
}) {
  readonly [ProcessExitDecisionTypeId] = ProcessExitDecisionTypeId
}

export const ProcessExitDecision = Schema.Union([ProcessExitNormal, ProcessExitAbnormal])
export type ProcessExitDecision = typeof ProcessExitDecision.Type

export class ClassifyProcessExit extends Schema.TaggedClass<ClassifyProcessExit>()('ClassifyProcessExit', {
  exit: ProcessExit,
}) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}

const SIGNAL_IN_DETAIL = /signal: '([A-Z0-9]+)'/

const NO_EXIT_CODE = 0

const signalNameIn = (detail: string): string =>
  Option.getOrElse(
    Option.flatMap(Option.fromNullishOr(SIGNAL_IN_DETAIL.exec(detail)), (found) => Option.fromNullishOr(found[1])),
    () => '',
  )

const abnormalOf = (code: number, signal: string): ProcessExitDecision => new ProcessExitAbnormal({ code, signal })

const classifyCode = (code: number): ProcessExitDecision =>
  Match.value(code === 0).pipe(
    Match.when(true, (): ProcessExitDecision => new ProcessExitNormal({})),
    Match.when(false, (): ProcessExitDecision => abnormalOf(code, '')),
    Match.exhaustive,
  )

const decideProcessExit = (command: ClassifyProcessExit): Result.Result<ProcessExitDecision, never> =>
  Result.succeed(
    Match.value(command.exit).pipe(
      Match.tag('Exited', (exited) => classifyCode(exited.code)),
      Match.tag('Signaled', (signaled): ProcessExitDecision => abnormalOf(NO_EXIT_CODE, signalNameIn(signaled.detail))),
      Match.exhaustive,
    ),
  )

export const classifyProcessExit = Workflow.make({
  command: ClassifyProcessExit,
  decision: ProcessExitDecision,
  error: Schema.Never,
  decide: decideProcessExit,
})
