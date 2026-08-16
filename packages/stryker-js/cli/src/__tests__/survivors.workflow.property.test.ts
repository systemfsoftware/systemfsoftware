import { describe, it } from '@systemfsoftware/effect-gherkin-spec'
import type { Mutant } from '@systemfsoftware/stryker-js-plugin-api/core'
import { schema } from '@systemfsoftware/stryker-js-plugin-api/core'
import * as Exit from 'effect/Exit'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'
import { FastCheck as fc } from 'effect/testing'
import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'

import {
  type AdmitSurvivorsRunInput,
  extractSurvivors,
  type HashContent,
  sourceContentHash,
  SURVIVORS_RUN_FIRST_REMEDIATION,
} from '../survivors.kernel.js'
import { admitSurvivorsRun, SurvivorsAdmission, SurvivorsRejection } from '../survivors.workflow.js'

const sha256Hex: HashContent = (content) => createHash('sha256').update(content, 'utf-8').digest('hex')

const absPath = (file: string): string => `/work/${file}`

const reportPositionArb = fc.record({
  line: fc.integer({ min: 1, max: 200 }),
  column: fc.integer({ min: 1, max: 200 }),
})

const reportLocationArb = fc.record({ start: reportPositionArb, end: reportPositionArb })

const nonSurvivedStatusArb = fc.constantFrom<schema.MutantStatus>(
  'Killed',
  'NoCoverage',
  'Timeout',
  'RuntimeError',
  'CompileError',
  'Ignored',
  'Pending',
)

const mutantResultArb = (
  status: fc.Arbitrary<schema.MutantStatus>,
): fc.Arbitrary<schema.MutantResult> =>
  fc.record(
    {
      id: fc.string({ minLength: 1, maxLength: 8 }),
      mutatorName: fc.string({ minLength: 1, maxLength: 8 }),
      location: reportLocationArb,
      status,
      replacement: fc.string({ maxLength: 8 }),
    },
    { requiredKeys: ['id', 'mutatorName', 'location', 'status'] },
  )

/** Keys are short enough that `survivorsPriorReport` can never be generated. */
const cleanConfigArb: fc.Arbitrary<Record<string, unknown>> = fc.dictionary(
  fc.string({ maxLength: 6 }),
  fc.oneof(fc.string({ maxLength: 6 }), fc.integer(), fc.boolean()),
  { maxKeys: 3 },
)

const sourceArb = fc.string({ maxLength: 16 })

const survivingFilesArb: fc.Arbitrary<Record<string, schema.FileResult>> = fc
  .tuple(
    fc.string({ minLength: 1, maxLength: 6 }),
    fc.array(mutantResultArb(nonSurvivedStatusArb), { maxLength: 3 }),
    mutantResultArb(fc.constant<schema.MutantStatus>('Survived')),
    sourceArb,
  )
  .map(([file, others, survivor, source]) => ({
    [file]: { language: 'javascript', source, mutants: [...others, survivor] },
  }))

const nonSurvivingFilesArb: fc.Arbitrary<Record<string, schema.FileResult>> = fc.dictionary(
  fc.string({ maxLength: 6 }),
  fc.record({
    language: fc.constant('javascript'),
    source: sourceArb,
    mutants: fc.array(mutantResultArb(nonSurvivedStatusArb), { maxLength: 3 }),
  }),
  { maxKeys: 3 },
)

const reportArb = (
  files: fc.Arbitrary<Record<string, schema.FileResult>>,
  config: fc.Arbitrary<Record<string, unknown>> = cleanConfigArb,
): fc.Arbitrary<schema.MutationTestResult> =>
  fc.record({
    config,
    schemaVersion: fc.constant('1'),
    thresholds: fc.record({ high: fc.integer(), low: fc.integer() }),
    framework: fc.record({
      name: fc.constant('stryker'),
      version: fc.string({ minLength: 1, maxLength: 6 }),
    }),
    files,
  })

const reportWithSurvivorsArb = reportArb(survivingFilesArb)
const reportWithoutSurvivorsArb = reportArb(nonSurvivingFilesArb)

const frameworklessReportArb: fc.Arbitrary<schema.MutationTestResult> = fc.record({
  config: cleanConfigArb,
  schemaVersion: fc.constant('1'),
  thresholds: fc.record({ high: fc.integer(), low: fc.integer() }),
  files: survivingFilesArb,
})

const survivorsProducedReportArb = reportArb(
  survivingFilesArb,
  cleanConfigArb.map((config) => ({ ...config, survivorsPriorReport: 'reports/prior.json' })),
)

const matchingInput = (report: schema.MutationTestResult): AdmitSurvivorsRunInput => ({
  priorReport: report,
  currentConfig: report.config ?? {},
  frameworkVersion: report.framework?.version ?? '',
  sourceContentHashes: Object.fromEntries(
    Object.entries(report.files).map(([file, fileResult]) => [
      file,
      sourceContentHash(fileResult.source, sha256Hex),
    ]),
  ),
  hashContent: sha256Hex,
  resolveAbsolutePath: absPath,
})

const driftedInput = (report: schema.MutationTestResult): AdmitSurvivorsRunInput => ({
  ...matchingInput(report),
  frameworkVersion: `${report.framework?.version ?? ''}-drifted`,
})

const fingerprint = (mutant: Mutant): string =>
  JSON.stringify([
    mutant.id,
    mutant.fileName,
    mutant.mutatorName,
    mutant.replacement,
    mutant.location.start.line,
    mutant.location.start.column,
    mutant.location.end.line,
    mutant.location.end.column,
  ])

const rejectionOf = (
  result: Result.Result<unknown, SurvivorsRejection>,
): SurvivorsRejection | undefined => (Result.isFailure(result) ? result.failure : undefined)

describe('admitSurvivorsRun', () => {
  it.prop(
    '∀i_NoPriorReport_≡NoReportRejection',
    [reportWithSurvivorsArb],
    ([report]) => {
      const rejection = rejectionOf(
        admitSurvivorsRun({ ...matchingInput(report), priorReport: undefined }),
      )
      return rejection?.reason === 'no-report' &&
        rejection.remediation.includes('No prior mutation report found')
    },
  )

  it.prop(
    '∀r_SurvivorsProducedReport_≡RejectedAsUnusableSource',
    [survivorsProducedReportArb],
    ([report]) => {
      const rejection = rejectionOf(admitSurvivorsRun(matchingInput(report)))
      return rejection?.reason === 'mismatch' &&
        rejection.remediation.includes('itself produced by a --survivors run')
    },
  )

  it.prop(
    '∀r_NoSurvivors_≡AdmittedEmptyEvenWhenHashesDrift',
    [reportWithoutSurvivorsArb],
    ([report]) => {
      const drifted = admitSurvivorsRun(driftedInput(report))
      return Result.isSuccess(drifted) && drifted.success._tag === 'NoSurvivors'
    },
  )

  it.prop(
    '∀r_SurvivorsWithDriftedHashes_≡MismatchRejection',
    [reportWithSurvivorsArb],
    ([report]) => {
      const rejection = rejectionOf(admitSurvivorsRun(driftedInput(report)))
      return rejection?.reason === 'mismatch' &&
        rejection.remediation.includes('does not match the current run')
    },
  )

  it.prop(
    '∀r_SurvivorsWithMatchingHashes_≡AdmittedWithExactSurvivors',
    [reportWithSurvivorsArb],
    ([report]) => {
      const admission = admitSurvivorsRun(matchingInput(report))
      if (!Result.isSuccess(admission) || admission.success._tag !== 'Admitted') return false
      const expected = extractSurvivors(report, absPath)
      return expected.length > 0 &&
        isDeepStrictEqual(
          admission.success.survivors.map(fingerprint),
          expected.map(fingerprint),
        )
    },
  )

  it.prop(
    '∀r_EveryRejection_≡EndsWithRunFirstRemediation',
    [fc.oneof(reportWithSurvivorsArb, survivorsProducedReportArb)],
    ([report]) => {
      const rejections = [
        rejectionOf(admitSurvivorsRun({ ...matchingInput(report), priorReport: undefined })),
        rejectionOf(admitSurvivorsRun(driftedInput(report))),
      ].filter((rejection): rejection is SurvivorsRejection => rejection !== undefined)
      return rejections.length === 2 &&
        rejections.every((rejection) =>
          rejection.remediation.endsWith(` ${SURVIVORS_RUN_FIRST_REMEDIATION}`) &&
          rejection.remediation.length > SURVIVORS_RUN_FIRST_REMEDIATION.length + 1
        )
    },
  )

  it.prop(
    '∀r_ReportWithoutFramework_≡DecidesWithoutThrowing',
    [frameworklessReportArb],
    ([report]) => {
      const rejection = rejectionOf(admitSurvivorsRun(matchingInput(report)))
      return rejection?.reason === 'mismatch' &&
        rejection._tag === 'SurvivorsRejection'
    },
  )

  it.prop(
    '∀i_EveryRejection_≡CarriesTheRejectionTag',
    [reportWithSurvivorsArb],
    ([report]) =>
      rejectionOf(admitSurvivorsRun({ ...matchingInput(report), priorReport: undefined }))?._tag ===
        'SurvivorsRejection',
  )

  it.prop(
    '∀m_MalformedSurvivor_≡RefusedByAdmissionDecode',
    [fc.record({ id: fc.string(), fileName: fc.string() })],
    ([partial]) =>
      Exit.isFailure(
        S.decodeUnknownExit(SurvivorsAdmission)({ _tag: 'Admitted', survivors: [partial] }),
      ),
  )

  it.prop(
    '∀l_MalformedLocation_≡RefusedByAdmissionDecode',
    [
      fc.oneof(
        fc.constant({}),
        fc.record({ start: fc.constant({}), end: reportPositionArb }),
        fc.record({ start: reportPositionArb, end: fc.constant({}) }),
      ),
      fc.record({
        id: fc.string({ minLength: 1 }),
        fileName: fc.string({ minLength: 1 }),
        mutatorName: fc.string({ minLength: 1 }),
        replacement: fc.string({ minLength: 1 }),
      }),
    ],
    ([location, fields]) =>
      Exit.isFailure(
        S.decodeUnknownExit(SurvivorsAdmission)({
          _tag: 'Admitted',
          survivors: [{ ...fields, location }],
        }),
      ),
  )

  it.prop(
    '∀r_WellFormedSurvivors_≡AcceptedByAdmissionDecode',
    [reportWithSurvivorsArb],
    ([report]) =>
      Exit.isSuccess(
        S.decodeUnknownExit(SurvivorsAdmission)({
          _tag: 'Admitted',
          survivors: extractSurvivors(report, absPath),
        }),
      ),
  )

  it.prop(
    '∀r_EveryVariant_≡BrandedWithTheRegistryScopedTypeId',
    [reportWithSurvivorsArb],
    ([report]) => {
      const crossRealmBrand = Symbol.for('@systemfsoftware/stryker-js-cli/SurvivorsAdmission')
      const admitted = admitSurvivorsRun(matchingInput(report))
      const empty = admitSurvivorsRun(matchingInput({ ...report, files: {} }))
      const rejected = admitSurvivorsRun({ ...matchingInput(report), priorReport: undefined })
      return Result.isSuccess(admitted) && Result.isSuccess(empty) && Result.isFailure(rejected) &&
        crossRealmBrand in admitted.success &&
        crossRealmBrand in empty.success &&
        crossRealmBrand in rejected.failure
    },
  )
})
