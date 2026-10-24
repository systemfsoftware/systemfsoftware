import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'

import { RunStatus } from '../verdict/run-verdict.schema.js'

const AiTraceAdmissionTypeId: unique symbol = Symbol.for('@systemfsoftware/effect-e2e/AiTraceAdmission')

/**
 * Whether a try writes `ai-trace.json`: admitted only when ai-trace is on and the try did not pass.
 *
 * Admission is independent of the `trace` setting (design §13.3), so a failing try with `trace` off still writes
 * its ai-trace (requirements R6, R7).
 */
export class AdmitAiTrace extends Schema.TaggedClass<AdmitAiTrace>()('AdmitAiTrace', {
  aiTrace: Schema.Boolean,
  status: RunStatus,
}) {
  static readonly [Workflow.InstrumentationBrand] = { aiTrace: 'app.e2e.run.ai-trace' } as const
}

export class AiTraceAdmitted extends Schema.TaggedClass<AiTraceAdmitted>()('AiTraceAdmitted', {}) {
  readonly [AiTraceAdmissionTypeId] = AiTraceAdmissionTypeId
}

export class AiTraceDeclined extends Schema.TaggedClass<AiTraceDeclined>()('AiTraceDeclined', {}) {
  readonly [AiTraceAdmissionTypeId] = AiTraceAdmissionTypeId
}

export const AiTraceAdmission = Schema.Union([AiTraceAdmitted, AiTraceDeclined])
export type AiTraceAdmission = typeof AiTraceAdmission.Type

const onFailure = (status: RunStatus): AiTraceAdmission =>
  Match.value(status).pipe(
    Match.when('passed', (): AiTraceAdmission => new AiTraceDeclined({})),
    Match.orElse((): AiTraceAdmission => new AiTraceAdmitted({})),
  )

const decide = (command: AdmitAiTrace): Result.Result<AiTraceAdmission, never> =>
  Result.succeed(
    Match.value(command.aiTrace).pipe(
      Match.when(true, () => onFailure(command.status)),
      Match.when(false, (): AiTraceAdmission => new AiTraceDeclined({})),
      Match.exhaustive,
    ),
  )

export const admitAiTrace = Workflow.make({
  command: AdmitAiTrace,
  decision: AiTraceAdmission,
  error: Schema.Never,
  decide,
})
