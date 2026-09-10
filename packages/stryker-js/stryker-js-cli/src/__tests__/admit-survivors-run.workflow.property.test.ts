import { sha256 } from '@noble/hashes/sha256'
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils'
import { describe, it } from '@systemfsoftware/effect-gherkin-spec'
import * as Equivalence from 'effect/Equivalence'
import * as Exit from 'effect/Exit'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

import {
  ContentText,
  EitherReport,
  FrameworklessReport,
  MalformedLocation,
  PartialSurvivor,
  ReportWithoutSurvivors,
  ReportWithSurvivors,
  SurvivorFields,
  SurvivorsProducedReport,
} from '../../tests/__fixtures__/admit-survivors-run.schema.js'
import {
  admitSurvivorsRun,
  AdmitSurvivorsRunCommand,
  Admitted,
  NoSurvivors,
  PriorReportFacts,
  SurvivorsAdmission,
  SurvivorsRejection,
} from '../admit-survivors-run.workflow.js'
import { SURVIVORS_RUN_FIRST_REMEDIATION } from '../Survivors.js'
import {
  extractSurvivors,
  type HashContent,
  type PriorReportDocument,
  priorSourceHashes,
  sourceContentHash,
} from '../Survivors.js'
const stringArrayEquivalence = Equivalence.Array(Equivalence.String)

const sha256Hex: HashContent = (content) => bytesToHex(sha256(utf8ToBytes(content)))
const absPath = (file: string): string => `/work/${file}`

const matchingFields = (report: PriorReportDocument) => ({
  priorReport: PriorReportFacts.make({
    config: report.config ?? {},
    frameworkVersion: report.framework?.version,
  }),
  currentConfig: report.config ?? {},
  frameworkVersion: report.framework?.version ?? '',
  sourceContentHashes: Object.fromEntries(
    Object.entries(report.files).map(([file, fileResult]) => [
      file,
      sourceContentHash(fileResult.source, sha256Hex),
    ]),
  ),
  priorSourceHashes: priorSourceHashes(report, sha256Hex),
  priorSurvivors: extractSurvivors(report, absPath),
})

const matchingCommand = (report: PriorReportDocument): AdmitSurvivorsRunCommand =>
  AdmitSurvivorsRunCommand.make(matchingFields(report))

const driftedCommand = (report: PriorReportDocument): AdmitSurvivorsRunCommand =>
  AdmitSurvivorsRunCommand.make({
    ...matchingFields(report),
    frameworkVersion: `${report.framework?.version ?? ''}-drifted`,
  })

const commandWithoutPriorReport = (report: PriorReportDocument): AdmitSurvivorsRunCommand =>
  AdmitSurvivorsRunCommand.make({
    ...matchingFields(report),
    priorReport: undefined,
  })

const fingerprint = (
  mutant: {
    readonly id: string
    readonly fileName: string
    readonly mutatorName: string
    readonly replacement: string
    readonly location: {
      readonly start: { readonly line: number; readonly column: number }
      readonly end: { readonly line: number; readonly column: number }
    }
  },
): string =>
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

const rejectionOf = (result: Result.Result<unknown, SurvivorsRejection>): SurvivorsRejection | undefined => {
  if (Result.isFailure(result)) {
    return result.failure
  }
  return undefined
}

describe('admitSurvivorsRun', () => {
  it.prop(
    '∀i_NoPriorReport_≡NoReportRejection',
    [ReportWithSurvivors],
    ([report]) => {
      const rejection = rejectionOf(
        admitSurvivorsRun(commandWithoutPriorReport(report)),
      )
      if (rejection === undefined) {
        return false
      }
      return rejection.reason === 'no-report' &&
        rejection.remediation.includes('No prior mutation report found')
    },
  )

  it.prop(
    '∀r_SurvivorsProducedReport_≡RejectedAsUnusableSource',
    [SurvivorsProducedReport],
    ([report]) => {
      const rejection = rejectionOf(admitSurvivorsRun(matchingCommand(report)))
      if (rejection === undefined) {
        return false
      }
      return rejection.reason === 'mismatch' &&
        rejection.remediation.includes('itself produced by a --survivors run')
    },
  )

  it.prop(
    '∀r_NoSurvivors_≡AdmittedEmptyEvenWhenHashesDrift',
    [ReportWithoutSurvivors],
    ([report]) => {
      const drifted = admitSurvivorsRun(driftedCommand(report))
      if (!Result.isSuccess(drifted)) {
        return false
      }
      return S.is(NoSurvivors)(drifted.success)
    },
  )

  it.prop(
    '∀r_SurvivorsWithDriftedHashes_≡MismatchRejection',
    [ReportWithSurvivors],
    ([report]) => {
      const rejection = rejectionOf(admitSurvivorsRun(driftedCommand(report)))
      if (rejection === undefined) {
        return false
      }
      return rejection.reason === 'mismatch' &&
        rejection.remediation.includes('does not match the current run')
    },
  )

  it.prop(
    '∀r_SurvivorsWithMatchingHashes_≡AdmittedWithExactSurvivors',
    [ReportWithSurvivors],
    ([report]) => {
      const admission = admitSurvivorsRun(matchingCommand(report))
      if (!Result.isSuccess(admission)) {
        return false
      }
      if (!S.is(Admitted)(admission.success)) {
        return false
      }
      const expected = extractSurvivors(report, absPath)
      return expected.length > 0 &&
        stringArrayEquivalence(
          admission.success.survivors.map(fingerprint),
          expected.map(fingerprint),
        )
    },
  )

  it.prop(
    '∀r_EveryRejection_≡EndsWithRunFirstRemediation',
    [EitherReport],
    ([report]) => {
      const rejections = [
        rejectionOf(admitSurvivorsRun(commandWithoutPriorReport(report))),
        rejectionOf(admitSurvivorsRun(driftedCommand(report))),
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
    [FrameworklessReport],
    ([report]) => {
      const rejection = rejectionOf(admitSurvivorsRun(matchingCommand(report)))
      if (rejection === undefined) {
        return false
      }
      return rejection.reason === 'mismatch' && S.is(SurvivorsRejection)(rejection)
    },
  )

  it.prop(
    '∀i_EveryRejection_≡CarriesTheRejectionTag',
    [ReportWithSurvivors],
    ([report]) =>
      (() => {
        const r = rejectionOf(admitSurvivorsRun(commandWithoutPriorReport(report)))
        if (r === undefined) {
          return false
        }
        return S.is(SurvivorsRejection)(r)
      })(),
  )

  it.prop(
    '∀m_MalformedSurvivor_≡RefusedByAdmissionDecode',
    [PartialSurvivor],
    ([partial]) =>
      Exit.isFailure(
        S.decodeUnknownExit(SurvivorsAdmission)({ _tag: 'Admitted', survivors: [partial] }),
      ),
  )

  it.prop(
    '∀l_MalformedLocation_≡RefusedByAdmissionDecode',
    [MalformedLocation, SurvivorFields],
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
    [ReportWithSurvivors],
    ([report]) =>
      Exit.isSuccess(
        S.decodeExit(SurvivorsAdmission)({
          _tag: 'Admitted',
          survivors: extractSurvivors(report, absPath),
        }),
      ),
  )

  it.prop(
    '∀r_EveryVariant_≡BrandedWithTheRegistryScopedTypeId',
    [ReportWithSurvivors],
    ([report]) => {
      const crossRealmBrand = Symbol.for('@systemfsoftware/stryker-js-cli/SurvivorsAdmission')
      const admitted = admitSurvivorsRun(matchingCommand(report))
      const empty = admitSurvivorsRun(matchingCommand({ ...report, files: {} }))
      const rejected = admitSurvivorsRun(commandWithoutPriorReport(report))
      return Result.isSuccess(admitted) && Result.isSuccess(empty) && Result.isFailure(rejected) &&
        crossRealmBrand in admitted.success &&
        crossRealmBrand in empty.success &&
        crossRealmBrand in rejected.failure
    },
  )
})

describe('sourceContentHash', () => {
  it.prop(
    '∀c_Empty_≡FipsVector',
    [S.Literal('')],
    ([content]) =>
      sourceContentHash(content, sha256Hex) === 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  )

  it.prop(
    '∀c_Abc_≡FipsVector',
    [S.Literal('abc')],
    ([content]) =>
      sourceContentHash(content, sha256Hex) === 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  )

  it.prop(
    '∀c_NonAscii_≡Utf8Vector',
    [S.Literal('✓')],
    ([content]) =>
      sourceContentHash(content, sha256Hex) === '1dabba21cdad44541f6b15796f8d22978fc7ea10c46aeceeeeb66c23b3ac7604',
  )

  it.prop(
    '∀c_Content_≡Deterministic',
    [ContentText],
    ([content]) => sourceContentHash(content, sha256Hex) === sourceContentHash(content, sha256Hex),
  )

  it.prop(
    '∀a,b_Content_≠Distinct',
    [ContentText, S.String.check(S.isMinLength(1), S.isMaxLength(4))],
    ([a, extra]) => {
      const b = `${a}${extra}`
      return sourceContentHash(a, sha256Hex) !== sourceContentHash(b, sha256Hex)
    },
  )
})

describe('Survivors not-found', () => {
  it.prop('∀c_NotFound_≡Rejection', [S.Null], () =>
    Result.match(
      admitSurvivorsRun(
        AdmitSurvivorsRunCommand.make({
          priorReport: undefined,
          currentConfig: {},
          frameworkVersion: '1.0.0',
          sourceContentHashes: {},
          priorSourceHashes: {},
          priorSurvivors: [],
        }),
      ),
      {
        onSuccess: () => false,
        onFailure: (rejection) => S.is(SurvivorsRejection)(rejection),
      },
    ))
})
