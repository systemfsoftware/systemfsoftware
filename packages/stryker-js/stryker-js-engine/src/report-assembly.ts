import type { MutantResult } from '@systemfsoftware/stryker-js/Mutant'
import type * as schema from '@systemfsoftware/stryker-js/Report'
import type { TestResult } from '@systemfsoftware/stryker-js/TestRunner'
import * as HashMap from 'effect/HashMap'
import * as Option from 'effect/Option'

export interface TestIdRemap {
  readonly testId: (id: string) => string
  readonly testIds: (ids: readonly string[] | undefined) => readonly string[] | undefined
}

export const testIdRemap = (testIds: readonly string[]): TestIdRemap => {
  const positions = HashMap.fromIterable(
    testIds.map((id, position): readonly [string, string] => [id, position.toString()]),
  )
  const remapId = (id: string): string => Option.getOrElse(HashMap.get(positions, id), () => id)
  const remapIds = (ids: readonly string[] | undefined): readonly string[] | undefined => {
    if (ids === undefined) {
      return undefined
    }
    return ids.map(remapId)
  }
  return { testId: remapId, testIds: remapIds }
}

export const toReportMutant = (mutant: MutantResult, remap: TestIdRemap): schema.MutantResult => ({
  id: mutant.id,
  mutatorName: mutant.mutatorName,
  replacement: mutant.replacement,
  status: mutant.status,
  location: mutant.location,
  statusReason: mutant.statusReason,
  testsCompleted: mutant.testsCompleted,
  description: mutant.description,
  static: mutant.static,
  killedBy: remap.testIds(mutant.killedBy),
  coveredBy: remap.testIds(mutant.coveredBy),
})

export const toReportTest = (test: TestResult, remap: TestIdRemap): schema.TestDefinition => {
  const base: schema.TestDefinition = { id: remap.testId(test.id), name: test.name }
  if (test.startPosition === undefined) {
    return base
  }
  return { ...base, location: { start: test.startPosition } }
}

interface MutantGroup {
  readonly sourceFileName: string
  readonly mutants: readonly schema.MutantResult[]
}

export interface FileResultsInput {
  readonly sources: HashMap.HashMap<string, schema.FileResult>
  readonly reportNames: HashMap.HashMap<string, string>
  readonly mutants: readonly MutantResult[]
  readonly remap: TestIdRemap
}

export const assembleFileResults = (input: FileResultsInput): schema.FileResultDictionary => {
  const grouped = input.mutants.reduce<HashMap.HashMap<string, MutantGroup>>((accumulator, mutant) => {
    const reportFileName = HashMap.get(input.reportNames, mutant.fileName)
    if (Option.isNone(reportFileName)) {
      return accumulator
    }
    const existing = HashMap.get(accumulator, reportFileName.value)
    const mapped = toReportMutant(mutant, input.remap)
    if (Option.isNone(existing)) {
      return HashMap.set(accumulator, reportFileName.value, { sourceFileName: mutant.fileName, mutants: [mapped] })
    }
    return HashMap.set(accumulator, reportFileName.value, {
      sourceFileName: existing.value.sourceFileName,
      mutants: [...existing.value.mutants, mapped],
    })
  }, HashMap.empty<string, MutantGroup>())

  const entries: Array<readonly [string, schema.FileResult]> = []
  for (const [reportFileName, group] of grouped) {
    const source = HashMap.get(input.sources, group.sourceFileName)
    if (Option.isNone(source)) {
      continue
    }
    entries.push([reportFileName, { ...source.value, mutants: group.mutants }])
  }
  return Object.fromEntries(entries)
}

interface TestGroup {
  readonly sourceFileName: string
  readonly tests: readonly schema.TestDefinition[]
}

export interface TestFilesInput {
  readonly testSources: HashMap.HashMap<string, schema.TestFile>
  readonly reportNames: HashMap.HashMap<string, string>
  readonly tests: readonly TestResult[]
  readonly remap: TestIdRemap
}

export const assembleTestFiles = (input: TestFilesInput): schema.TestFileDefinitionDictionary => {
  const grouped = input.tests.reduce<HashMap.HashMap<string, TestGroup>>((accumulator, test) => {
    if (test.fileName === undefined) {
      return accumulator
    }
    const reportFileName = HashMap.get(input.reportNames, test.fileName)
    if (Option.isNone(reportFileName)) {
      return accumulator
    }
    const existing = HashMap.get(accumulator, reportFileName.value)
    const mapped = toReportTest(test, input.remap)
    if (Option.isNone(existing)) {
      return HashMap.set(accumulator, reportFileName.value, { sourceFileName: test.fileName, tests: [mapped] })
    }
    return HashMap.set(accumulator, reportFileName.value, {
      sourceFileName: existing.value.sourceFileName,
      tests: [...existing.value.tests, mapped],
    })
  }, HashMap.empty<string, TestGroup>())

  const entries: Array<readonly [string, schema.TestFile]> = []
  for (const [reportFileName, group] of grouped) {
    const source = HashMap.get(input.testSources, group.sourceFileName)
    if (Option.isNone(source)) {
      continue
    }
    entries.push([reportFileName, { ...source.value, tests: group.tests }])
  }
  return Object.fromEntries(entries)
}
