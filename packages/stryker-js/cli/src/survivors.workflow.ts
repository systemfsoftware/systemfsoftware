import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
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
        start: S.Struct({ line: S.Finite, column: S.Finite }),
        end: S.Struct({ line: S.Finite, column: S.Finite }),
      }),
    }),
  ),
}) {
  readonly [SurvivorsAdmissionTypeId] = SurvivorsAdmissionTypeId
}
export class NoSurvivors extends S.TaggedClass<NoSurvivors>()('NoSurvivors', {}) {
  readonly [SurvivorsAdmissionTypeId] = SurvivorsAdmissionTypeId
}

export const SurvivorsAdmission = S.Union([Admitted, NoSurvivors])
export type SurvivorsAdmission = S.Schema.Type<typeof SurvivorsAdmission>
export class SurvivorsRejection extends S.TaggedError<SurvivorsRejection>()('SurvivorsRejection', {
  reason: S.Literals(['no-report', 'mismatch']),
  remediation: S.String,
}) {
  readonly [SurvivorsAdmissionTypeId] = SurvivorsAdmissionTypeId
}

export const admitSurvivorsRun = Workflow.make(
  (command: AdmitSurvivorsRunInput): Result.Result<SurvivorsAdmission, SurvivorsRejection> =>
    Match.value(admissionVerdict(command)).pipe(
      Match.discriminator('kind')(
        'reject',
        (verdict) => Result.fail(SurvivorsRejection.make({ reason: verdict.reason, remediation: verdict.remediation })),
      ),
      Match.discriminator('kind')('no-survivors', () => Result.succeed(NoSurvivors.make())),
      Match.discriminator('kind')(
        'admit',
        (verdict) => Result.succeed(Admitted.make({ survivors: verdict.survivors })),
      ),
      Match.exhaustive,
    ),
)
