import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'

import { Trace } from '../Config/config.schema.js'
import { RunStatus } from '../verdict/run-verdict.schema.js'

const EvidenceAdmissionTypeId: unique symbol = Symbol.for('@systemfsoftware/effect-e2e/EvidenceAdmission')

export class AdmitEvidence extends Schema.TaggedClass<AdmitEvidence>()('AdmitEvidence', {
  trace: Trace,
  status: RunStatus,
}) {
  static readonly [Workflow.InstrumentationBrand] = { trace: 'app.e2e.run.trace' } as const
}

export class EvidenceAdmitted extends Schema.TaggedClass<EvidenceAdmitted>()('EvidenceAdmitted', {}) {
  readonly [EvidenceAdmissionTypeId] = EvidenceAdmissionTypeId
}

export class EvidenceDeclined extends Schema.TaggedClass<EvidenceDeclined>()('EvidenceDeclined', {}) {
  readonly [EvidenceAdmissionTypeId] = EvidenceAdmissionTypeId
}

export const EvidenceAdmission = Schema.Union([EvidenceAdmitted, EvidenceDeclined])
export type EvidenceAdmission = typeof EvidenceAdmission.Type

const onFailure = (status: RunStatus): EvidenceAdmission =>
  Match.value(status).pipe(
    Match.when('passed', (): EvidenceAdmission => new EvidenceDeclined({})),
    Match.orElse((): EvidenceAdmission => new EvidenceAdmitted({})),
  )

const decide = (command: AdmitEvidence): Result.Result<EvidenceAdmission, never> =>
  Result.succeed(
    Match.value(command.trace).pipe(
      Match.when('off', (): EvidenceAdmission => new EvidenceDeclined({})),
      Match.when('on', (): EvidenceAdmission => new EvidenceAdmitted({})),
      Match.when('retain-on-failure', () => onFailure(command.status)),
      Match.exhaustive,
    ),
  )

export const admitEvidence = Workflow.make({
  command: AdmitEvidence,
  decision: EvidenceAdmission,
  error: Schema.Never,
  decide,
})
