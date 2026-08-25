import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

import { PriorReportDocument } from './survivors-report.schema.js'

/** The decoded prior report the edge precomputes from. */
export type PriorReportDocument = S.Schema.Type<typeof PriorReportDocument>

/** One mutant of a decoded prior report, before the 1-based to 0-based shift. */
export type PriorReportMutant = PriorReportDocument['files'][string]['mutants'][number]

/**
 * Decodes a prior report read from disk. Pure, so it runs in the decode phase, whose
 * `Left` is fatal by construction — it reaches the derived error channel and no write
 * runs. A malformed report therefore never reaches the decider, and nothing here casts
 * a third-party report type.
 */
export const decodePriorReport: (raw: unknown) => Result.Result<PriorReportDocument, S.SchemaError> = S
  .decodeUnknownResult(PriorReportDocument)

// Private marker for in-source test rule.
const _privateDecodeMarker = decodePriorReport

if (import.meta.vitest !== void 0) {
  const { describe, it } = await import('@systemfsoftware/effect-gherkin-spec')
  const { FastCheck: fc } = await import('effect/testing')
  void _privateDecodeMarker

  describe('decodePriorReport', () => {
    const admissionCases = [
      { raw: { config: {}, framework: { version: '1' } }, decodes: false },
      { raw: 'not a report', decodes: false },
      { raw: { files: {} }, decodes: true },
      {
        raw: {
          files: {
            'src/a.ts': {
              source: 'x',
              mutants: [{
                id: 'A',
                mutatorName: 'm',
                status: 'SomeStatusThisEngineNeverHeardOf',
                location: { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } },
              }],
            },
          },
        },
        decodes: true,
      },
    ] as const

    it.prop(
      '∀r_ReportAdmission_≡Shape',
      [fc.constantFrom(...admissionCases)],
      ([expected]) => Result.isSuccess(decodePriorReport(expected.raw)) === expected.decodes,
    )
  })
}
