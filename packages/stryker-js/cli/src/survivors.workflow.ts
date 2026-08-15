import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Either from 'effect/Either'
import * as Match from 'effect/Match'
import * as S from 'effect/Schema'
import { admissionVerdict } from './survivors.kernel.js'
import type { AdmitSurvivorsRunInput } from './survivors.kernel.js'

export type SurvivorsRejectReason = 'no-report' | 'mismatch'

export const SurvivorsAdmissionTypeId: unique symbol = Symbol.for('@systemfsoftware/stryker-js-cli/SurvivorsAdmission')
export type SurvivorsAdmissionTypeId = typeof SurvivorsAdmissionTypeId

export class Admitted extends S.TaggedClass<Admitted>()('Admitted', {
  survivors: S.Array(
    S.Struct({
      id: S.String,
      fileName: S.String,
      mutatorName: S.String,
      replacement: S.String,
      location: S.Struct({
        start: S.Struct({ line: S.Number, column: S.Number }),
        end: S.Struct({ line: S.Number, column: S.Number }),
      }),
    }),
  ),
}) {
  readonly [SurvivorsAdmissionTypeId] = SurvivorsAdmissionTypeId
}
export class NoSurvivors extends S.TaggedClass<NoSurvivors>()('NoSurvivors', {}) {
  readonly [SurvivorsAdmissionTypeId] = SurvivorsAdmissionTypeId
}

export const SurvivorsAdmission = S.Union(Admitted, NoSurvivors)
export type SurvivorsAdmission = S.Schema.Type<typeof SurvivorsAdmission>
export class SurvivorsRejection extends S.TaggedError<SurvivorsRejection>()('SurvivorsRejection', {
  reason: S.Literal('no-report', 'mismatch'),
  remediation: S.String,
}) {
  readonly [SurvivorsAdmissionTypeId] = SurvivorsAdmissionTypeId
}

export type SurvivorsAdmissionWorkflow = Workflow.Workflow<
  AdmitSurvivorsRunInput,
  SurvivorsAdmission,
  SurvivorsRejection
>

export const admitSurvivorsRun = Workflow.make(
  (command: AdmitSurvivorsRunInput): Either.Either<SurvivorsAdmission, SurvivorsRejection> =>
    Match.value(admissionVerdict(command)).pipe(
      Match.discriminator('kind')(
        'reject',
        (verdict) => Either.left(new SurvivorsRejection({ reason: verdict.reason, remediation: verdict.remediation })),
      ),
      Match.discriminator('kind')('no-survivors', () => Either.right(new NoSurvivors())),
      Match.discriminator('kind')('admit', (verdict) => Either.right(new Admitted({ survivors: verdict.survivors }))),
      Match.exhaustive,
    ),
)
