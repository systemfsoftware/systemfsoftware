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

if (import.meta.vitest !== void 0) {
  // Dynamic by necessity: tsdown defines `import.meta.vitest` as `undefined`, so this
  // branch is statically dead in the build and never enters the published module graph.
  const { refutes } = await import('@systemfsoftware/effect-schema-law')
  const { FastCheck: fc } = await import('effect/testing')

  const survivorWith = (
    start: { line: number | null; column: number | null },
    end: { line: number | null; column: number | null },
  ): unknown => ({
    _tag: 'Admitted',
    survivors: [
      {
        id: 'A',
        fileName: 'file.ts',
        mutatorName: 'mutator',
        replacement: 'replacement',
        location: { start, end },
      },
    ],
  })

  /**
   * `S.Finite` is one shared v4 node, so every location point weakens together
   * and the harness keeps a single obligation. Measured 2026-08-17: the stored
   * weakened arm accepts a non-finite number at `start.column` (the first
   * reaching path) but not at `start.line` — so the witness sits there. One
   * generator per schema discharges the shared obligation.
   */
  refutes(Admitted, {
    AdmittedLocationNonFinite: fc.constant(
      survivorWith({ line: 1, column: Number.POSITIVE_INFINITY }, { line: 1, column: 0 }),
    ),
  })

  refutes(SurvivorsAdmission, {
    SurvivorsAdmissionLocationNonFinite: fc.constant(
      survivorWith({ line: 1, column: Number.POSITIVE_INFINITY }, { line: 1, column: 0 }),
    ),
  })
}
