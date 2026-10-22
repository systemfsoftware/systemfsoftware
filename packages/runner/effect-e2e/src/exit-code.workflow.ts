import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Match, Schema } from 'effect'
import * as Result from 'effect/Result'
import { ReportStatus } from './report.schema.js'

const ExitCodeTypeId: unique symbol = Symbol.for('@systemfsoftware/effect-e2e/ExitCode')
type ExitCodeTypeId = typeof ExitCodeTypeId

export class ExitClean extends Schema.TaggedClass<ExitClean>()('ExitClean', {
  code: Schema.Literals([0]),
}) {
  readonly [ExitCodeTypeId] = ExitCodeTypeId
}
export class ExitTestsFailed extends Schema.TaggedClass<ExitTestsFailed>()('ExitTestsFailed', {
  code: Schema.Literals([1]),
}) {
  readonly [ExitCodeTypeId] = ExitCodeTypeId
}
export class ExitEnvironmentFailed extends Schema.TaggedClass<ExitEnvironmentFailed>()('ExitEnvironmentFailed', {
  code: Schema.Literals([3]),
}) {
  readonly [ExitCodeTypeId] = ExitCodeTypeId
}
export class ExitInternalError extends Schema.TaggedClass<ExitInternalError>()('ExitInternalError', {
  code: Schema.Literals([4]),
}) {
  readonly [ExitCodeTypeId] = ExitCodeTypeId
}
export class ExitInterrupted extends Schema.TaggedClass<ExitInterrupted>()('ExitInterrupted', {
  code: Schema.Literals([130]),
}) {
  readonly [ExitCodeTypeId] = ExitCodeTypeId
}
export const ExitCode = Schema.Union([
  ExitClean,
  ExitTestsFailed,
  ExitEnvironmentFailed,
  ExitInternalError,
  ExitInterrupted,
])
export type ExitCode = typeof ExitCode.Type

export class DecideExitCode extends Schema.TaggedClass<DecideExitCode>()('DecideExitCode', {
  status: ReportStatus,
}) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}

const decide = (command: DecideExitCode): Result.Result<ExitCode, never> =>
  Result.succeed(
    Match.value(command.status).pipe(
      Match.when('passed', () => new ExitClean({ code: 0 })),
      Match.when('failed', () => new ExitTestsFailed({ code: 1 })),
      Match.when('blocked', () => new ExitEnvironmentFailed({ code: 3 })),
      Match.when('error', () => new ExitInternalError({ code: 4 })),
      Match.when('interrupted', () => new ExitInterrupted({ code: 130 })),
      Match.exhaustive,
    ),
  )

export const exitCode = Workflow.make({
  command: DecideExitCode,
  decision: ExitCode,
  error: Schema.Never,
  decide,
})
