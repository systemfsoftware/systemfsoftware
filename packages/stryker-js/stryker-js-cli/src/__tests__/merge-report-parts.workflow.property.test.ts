import { describe, it } from '@systemfsoftware/effect-gherkin-spec'
import type { MutantStatus } from '@systemfsoftware/stryker-js/Report'
import type { MutationTestResult } from '@systemfsoftware/stryker-js/Report'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'
import { FastCheck as fc } from 'effect/testing'

import {
  DuplicatePackageLabel,
  MergedReports,
  mergeReportParts,
  MergeReportPartsCommand,
  MissingPackages,
  type NoMergedReports,
  type ReportPart,
} from '../merge-report-parts.workflow.js'

const LOCATION = {
  start: { line: 1, column: 1 },
  end: { line: 1, column: 10 },
}

const STATUS_ARB = fc.constantFrom<MutantStatus>(
  'Killed',
  'Survived',
  'NoCoverage',
  'CompileError',
  'RuntimeError',
  'Timeout',
  'Ignored',
  'Pending',
)

interface ModuleSpec {
  readonly label: string
  readonly testIds: readonly string[]
  readonly mutants: readonly {
    readonly id: string
    readonly status: MutantStatus
    readonly killingIds: readonly string[]
  }[]
}

const MODULE_ARB: fc.Arbitrary<ModuleSpec> = fc
  .record({
    label: fc.stringMatching(/^[a-z][a-z0-9]{0,5}$/),
    testIds: fc.uniqueArray(fc.stringMatching(/^t[0-9]{1,3}$/), { minLength: 1, maxLength: 3 }),
  })
  .chain(({ label, testIds }) =>
    fc.array(
      fc.record({ status: STATUS_ARB, reach: fc.nat({ max: testIds.length }) }),
      { minLength: 1, maxLength: 3 },
    ).map((specs) => ({
      label,
      testIds,
      mutants: specs.map((spec, index) => ({
        id: `m${index}`,
        status: spec.status,
        killingIds: testIds.slice(0, spec.reach),
      })),
    }))
  )

const MODULES_ARB = fc.array(MODULE_ARB, { minLength: 1, maxLength: 3 })

const reportOf = (spec: ModuleSpec): MutationTestResult => ({
  schemaVersion: '1.0',
  thresholds: { high: 80, low: 60 },
  files: {
    'src/target.ts': {
      language: 'typescript',
      source: 'const marker = true',
      mutants: spec.mutants.map((mutant) => ({
        id: mutant.id,
        mutatorName: 'BooleanLiteral',
        replacement: 'false',
        status: mutant.status,
        location: LOCATION,
        killedBy: [...mutant.killingIds],
        coveredBy: [...mutant.killingIds],
      })),
    },
  },
  testFiles: {
    'src/target.test.ts': { tests: spec.testIds.map((id) => ({ id, name: `test ${id}` })) },
  },
})

const partOf = (spec: ModuleSpec): S.Schema.Type<typeof ReportPart> => ({
  label: spec.label,
  outcome: 'success',
  incomplete: false,
  report: reportOf(spec),
})

const commandOf = (specs: readonly ModuleSpec[]): MergeReportPartsCommand =>
  MergeReportPartsCommand.make({ parts: specs.map(partOf) })

const hasDistinctLabels = (specs: readonly ModuleSpec[]): boolean =>
  new Set(specs.map((spec) => spec.label)).size === specs.length

const mergedOf = (
  result: Result.Result<MergedReports | NoMergedReports, DuplicatePackageLabel | MissingPackages>,
): MergedReports | undefined => {
  if (Result.isFailure(result)) {
    return undefined
  }
  if (!S.is(MergedReports)(result.success)) {
    return undefined
  }
  return result.success
}

describe('mergeReportParts', () => {
  it.prop('∀cs_Modules_≡MutantCountIsConserved', [MODULES_ARB], ([specs]) => {
    fc.pre(hasDistinctLabels(specs))
    const merged = mergedOf(mergeReportParts(commandOf(specs)))
    if (merged === undefined) {
      return false
    }
    const expected = specs.reduce((total, spec) => total + spec.mutants.length, 0)
    const actual = Object.values(merged.report.files).reduce((total, file) => total + file.mutants.length, 0)
    return actual === expected
  })

  it.prop('∀cs_Modules_≡EveryReferenceResolvesInsideTheMergedReport', [MODULES_ARB], ([specs]) => {
    fc.pre(hasDistinctLabels(specs))
    const merged = mergedOf(mergeReportParts(commandOf(specs)))
    if (merged === undefined) {
      return false
    }
    const testIds = new Set(
      Object.values(merged.report.testFiles ?? {}).flatMap((file) => file.tests.map((test) => test.id)),
    )
    return Object.values(merged.report.files).every((file) =>
      file.mutants.every((mutant) =>
        [...(mutant.killedBy ?? []), ...(mutant.coveredBy ?? [])].every((id) => testIds.has(id))
      )
    )
  })

  it.prop('∀cs_Modules_≡MergedKeysCarryTheModuleThatOwnsThem', [MODULES_ARB], ([specs]) => {
    fc.pre(hasDistinctLabels(specs))
    const merged = mergedOf(mergeReportParts(commandOf(specs)))
    if (merged === undefined) {
      return false
    }
    const labels = new Set(specs.map((spec) => spec.label))
    const entries = Object.entries(merged.report.files)
    return entries.length === specs.length &&
      entries.every(([key, file]) =>
        labels.has(key.slice(0, key.indexOf('/'))) &&
        file.mutants.every((mutant) => mutant.id.startsWith(`${key.slice(0, key.indexOf('/'))}_`))
      )
  })

  it.prop('∀cs_Modules_≡RepeatedModuleRefused', [MODULE_ARB], ([spec]) => {
    const repeated = MergeReportPartsCommand.make({ parts: [partOf(spec), partOf(spec)] })
    const result = mergeReportParts(repeated)
    return Result.isFailure(result) &&
      S.is(DuplicatePackageLabel)(result.failure) &&
      result.failure.label === spec.label
  })

  it.prop('∀cs_Modules_≡AbsentModuleBecomesAnEmptyReportRow', [MODULES_ARB], ([specs]) => {
    fc.pre(hasDistinctLabels(specs))
    const absent = 'not-a-generated-module'
    const result = mergeReportParts(
      MergeReportPartsCommand.make({ parts: specs.map(partOf), expectedPackages: [absent] }),
    )
    if (Result.isFailure(result)) {
      return false
    }
    return result.success.rows.some((row) => row.label === absent && row.score === 'no report')
  })
})
