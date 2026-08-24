import path from 'node:path'

import {
  type FileDescriptions,
  type Location,
  type Mutant,
  type MutateDescription,
  type Position,
  schema,
  type StrykerOptions,
} from '@systemfsoftware/stryker-js-plugin-api/core'
import { normalizeFileName } from '@systemfsoftware/stryker-js-plugin-api/core'
import { type Logger } from '@systemfsoftware/stryker-js-plugin-api/logging'
import { type TestResult, TestStatus } from '@systemfsoftware/stryker-js-plugin-api/test-runner'
import { diff_match_patch as DiffMatchPatch } from 'diff-match-patch'
import * as Predicate from 'effect/Predicate'
import { type TestDefinition } from 'mutation-testing-report-schema'

import {
  type DiffStatistics,
  diffStatisticsCount,
  diffStatisticsDetailedReport,
  diffStatisticsTotalsReport,
  emptyDiffStatistics,
} from './diff-statistics-collector.js'
import { addCoverage, addTest, forMutant, hasCoverage, hasStaticCoverage, type TestCoverage } from './test-coverage.js'

export interface IncrementalDiffResult {
  readonly mutants: readonly Mutant[]
  readonly mutantStatistics: DiffStatistics
  readonly testStatistics: DiffStatistics
  readonly testCoverage: TestCoverage
}
const toMutateDescriptionMap = (
  fileDescriptions: FileDescriptions,
  basePath: string,
): ReadonlyMap<string, MutateDescription> =>
  new Map(
    Object.entries(fileDescriptions).map(([name, description]) => [
      toRelativeNormalizedFileName(basePath, name),
      description.mutate,
    ]),
  )

const isInMutatedScope = (
  mutateMap: ReadonlyMap<string, MutateDescription>,
  relativeFileName: string,
  mutant: schema.MutantResult,
): boolean => {
  const mutate = mutateMap.get(relativeFileName)
  return (
    mutate === true ||
    (Array.isArray(mutate) && mutate.some((range) => locationIncluded(range, mutant.location)))
  )
}
export const incrementalDiff = (
  input: Readonly<{
    logger: Logger
    options: StrykerOptions
    fileDescriptions: FileDescriptions
    currentMutants: readonly Mutant[]
    testCoverage: TestCoverage
    incrementalReport: schema.MutationTestResult
    currentRelativeFiles: ReadonlyMap<string, string>
    basePath: string
  }>,
): IncrementalDiffResult => {
  const mutateMap = toMutateDescriptionMap(input.fileDescriptions, input.basePath)
  const { files, testFiles } = input.incrementalReport
  let mutantStatistics = emptyDiffStatistics()
  let testStatistics = emptyDiffStatistics()
  let currentCoverage: TestCoverage = input.testCoverage

  const reusableMutantsByKey = collectReusableMutantsByKey(input.logger)
  const { byId: oldTestsById, byKey: oldTestInfoByKey } = collectReusableTestInfo(input.logger)

  const {
    oldCoverageByMutantKey: oldCoverageTestKeysByMutantKey,
    oldKilledByMutantKey: oldKilledTestKeysByMutantKey,
  } = collectOldKilledAndCoverageMatrix()
  const oldTestKeys = new Set([...oldTestsById.values()].map(({ key }) => key))
  const newTestKeys = new Set(
    [...currentCoverage.testsById].map(([, test]) =>
      testToIdentifyingKey(test, toRelativeNormalizedFileName(input.basePath, test.fileName))
    ),
  )

  const testInfoByKey = collectCurrentTestInfo()

  for (const [key, { relativeFileName }] of testInfoByKey) {
    if (!oldTestKeys.has(key)) {
      testStatistics = diffStatisticsCount(testStatistics, {
        file: relativeFileName,
        change: 'added',
      })
    }
  }

  for (
    const [
      testKey,
      {
        test: { name, location },
        relativeFileName,
      },
    ] of oldTestInfoByKey
  ) {
    if (!testInfoByKey.has(testKey)) {
      const test: TestResult = {
        status: TestStatus.Success,
        id: testKey,
        name,
        ...(location?.start === undefined ? {} : { startPosition: location.start }),
        timeSpentMs: 0,
        fileName: path.resolve(relativeFileName),
      }
      testInfoByKey.set(testKey, {
        test,
        relativeFileName,
      })
      currentCoverage = addTest(currentCoverage, test)
    }
  }

  let reusedMutantCount = 0
  const currentMutantKeys = new Set<string>()
  const mutants = input.currentMutants.map((mutant) => {
    const relativeFileName = toRelativeNormalizedFileName(input.basePath, mutant.fileName)
    const mutantKey = mutantToIdentifyingKey(mutant, relativeFileName)
    currentMutantKeys.add(mutantKey)
    if (!mutant.status && !input.options.force) {
      const oldMutant = reusableMutantsByKey.get(mutantKey)
      if (oldMutant) {
        const coveringTests = forMutant(currentCoverage, mutant.id)
        const killedByTestKeys = oldKilledTestKeysByMutantKey.get(mutantKey)
        if (
          mutantCanBeReused(
            mutant,
            oldMutant,
            mutantKey,
            coveringTests,
            killedByTestKeys,
          )
        ) {
          reusedMutantCount++
          const { status, statusReason, testsCompleted } = oldMutant
          return {
            ...mutant,
            ...(status === undefined ? {} : { status }),
            ...(statusReason === undefined ? {} : { statusReason }),
            ...(testsCompleted === undefined ? {} : { testsCompleted }),
            coveredBy: [...(coveringTests ?? [])].map(({ id }) => id),
            killedBy: testKeysToId(killedByTestKeys),
          }
        }
      } else {
        mutantStatistics = diffStatisticsCount(mutantStatistics, {
          file: relativeFileName,
          change: 'added',
        })
      }
    }
    return mutant
  })

  for (const [mutantKey, oldResult] of reusableMutantsByKey) {
    if (
      !currentMutantKeys.has(mutantKey) &&
      !isInMutatedScope(mutateMap, oldResult.relativeFileName, oldResult)
    ) {
      const coverage = oldCoverageTestKeysByMutantKey.get(mutantKey) ?? []
      const killed = oldKilledTestKeysByMutantKey.get(mutantKey) ?? []
      const coveredBy = testKeysToId(coverage)
      const killedBy = testKeysToId(killed)
      const reusedMutant = {
        ...oldResult,
        id: mutantKey,
        fileName: path.resolve(oldResult.relativeFileName),
        replacement: oldResult.replacement ?? oldResult.mutatorName,
        coveredBy,
        killedBy,
      }
      mutants.push(reusedMutant)
      currentCoverage = addCoverage(currentCoverage, reusedMutant.id, coveredBy)
    }
  }

  if (input.logger.isInfoEnabled()) {
    const testInfo = hasCoverage(currentCoverage)
      ? `\n\tTests:\t\t${diffStatisticsTotalsReport(testStatistics)}`
      : ''
    input.logger.info(
      `Incremental report:\n\tMutants:\t${diffStatisticsTotalsReport(mutantStatistics)}` +
        testInfo +
        `\n\tResult:\t\t${reusedMutantCount} of ${input.currentMutants.length} mutant result(s) are reused.`,
    )
  }
  if (input.logger.isDebugEnabled()) {
    const lineSeparator = '\n\t\t'
    const noChanges = 'No changes'
    const detailedMutantSummary = `${lineSeparator}${
      diffStatisticsDetailedReport(mutantStatistics).join(lineSeparator) || noChanges
    }`
    const detailedTestsSummary = `${lineSeparator}${
      diffStatisticsDetailedReport(testStatistics).join(lineSeparator) || noChanges
    }`
    input.logger.debug(
      `Detailed incremental report:\n\tMutants: ${detailedMutantSummary}\n\tTests: ${detailedTestsSummary}`,
    )
  }
  return { mutants, mutantStatistics, testStatistics, testCoverage: currentCoverage }

  function testKeysToId(testKeys: Iterable<string> | undefined): string[] {
    return [...(testKeys ?? [])]
      .map((id) => testInfoByKey.get(id))
      .filter(Predicate.isNotNullish)
      .map(({ test: { id } }) => id)
  }

  function collectReusableMutantsByKey(log: Logger) {
    return new Map(
      Object.entries(files).flatMap(([fileName, oldFile]) => {
        const relativeFileName = toRelativeNormalizedFileName(input.basePath, fileName)
        const currentFileSource = input.currentRelativeFiles.get(relativeFileName)
        if (currentFileSource) {
          log.trace('Diffing %s', relativeFileName)
          const { results, removeCount } = performFileDiff(oldFile.source, currentFileSource, oldFile.mutants)
          mutantStatistics = diffStatisticsCount(mutantStatistics, {
            file: relativeFileName,
            change: 'removed',
            amount: removeCount,
          })
          return results.map((m) => [
            mutantToIdentifyingKey(m, relativeFileName),
            {
              ...m,
              relativeFileName,
            },
          ])
        }
        mutantStatistics = diffStatisticsCount(mutantStatistics, {
          file: relativeFileName,
          change: 'removed',
          amount: oldFile.mutants.length,
        })
        return []
      }),
    )
  }

  function collectReusableTestInfo(log: Logger) {
    const byId = new Map<string, { relativeFileName: string; test: TestDefinition; key: string }>()
    const byKey = new Map<string, TestInfo>()

    for (const [fileName, oldTestFile] of Object.entries(testFiles ?? {})) {
      const relativeFileName = toRelativeNormalizedFileName(input.basePath, fileName)
      const currentFileSource = input.currentRelativeFiles.get(relativeFileName)
      if (currentFileSource === undefined && fileName !== '') {
        log.debug('Test file removed: %s', relativeFileName)
        testStatistics = diffStatisticsCount(testStatistics, {
          file: relativeFileName,
          change: 'removed',
          amount: oldTestFile.tests.length,
        })
      } else if (currentFileSource !== undefined && oldTestFile.source !== undefined) {
        log.trace('Diffing %s', relativeFileName)
        const locatedTests = closeLocations(oldTestFile)
        const { results, removeCount } = performFileDiff(oldTestFile.source, currentFileSource, locatedTests)
        testStatistics = diffStatisticsCount(testStatistics, {
          file: relativeFileName,
          change: 'removed',
          amount: removeCount,
        })
        for (const test of results) {
          const key = testToIdentifyingKey(test, relativeFileName)
          const testInfo = { key, test, relativeFileName }
          byId.set(test.id, testInfo)
          byKey.set(key, testInfo)
        }
      } else {
        for (const test of oldTestFile.tests) {
          const key = testToIdentifyingKey(test, relativeFileName)
          const testInfo = { key, test, relativeFileName }
          byId.set(test.id, testInfo)
          byKey.set(key, testInfo)
        }
      }
    }
    return { byId, byKey }
  }

  function collectOldKilledAndCoverageMatrix() {
    const oldCoverageByMutantKey = new Map<string, Set<string>>()
    const oldKilledByMutantKey = new Map<string, Set<string>>()

    for (const [key, mutant] of reusableMutantsByKey) {
      const killedRow = new Set(
        mutant.killedBy?.map((testId) => oldTestsById.get(testId)?.key).filter(Predicate.isNotNullish),
      )
      const coverageRow = new Set(
        mutant.coveredBy?.map((testId) => oldTestsById.get(testId)?.key).filter(Predicate.isNotNullish),
      )
      for (const killed of killedRow) {
        coverageRow.add(killed)
      }
      oldCoverageByMutantKey.set(key, coverageRow)
      oldKilledByMutantKey.set(key, killedRow)
    }
    return { oldCoverageByMutantKey, oldKilledByMutantKey }
  }

  function collectCurrentTestInfo() {
    const byTestKey = new Map<string, { relativeFileName: string; test: TestResult }>()
    for (const testResult of currentCoverage.testsById.values()) {
      const relativeFileName = toRelativeNormalizedFileName(input.basePath, testResult.fileName)
      const key = testToIdentifyingKey(testResult, relativeFileName)
      const info = { relativeFileName, test: testResult, key }
      byTestKey.set(key, info)
    }

    return byTestKey
  }

  function mutantCanBeReused(
    mutant: Mutant,
    oldMutant: schema.MutantResult,
    mutantKey: string,
    coveringTests: ReadonlySet<TestResult> | undefined,
    oldKillingTests: Set<string> | undefined,
  ): boolean {
    if (!hasCoverage(currentCoverage)) {
      return true
    }
    if (oldMutant.status === 'Ignored') {
      return false
    }

    if (
      coveringTests === undefined &&
      hasStaticCoverage(currentCoverage, mutant.id) &&
      (oldMutant.status === 'Survived' || oldMutant.status === 'NoCoverage')
    ) {
      return false
    }

    const testsDiff = diffTestCoverage(
      mutant.id,
      oldCoverageTestKeysByMutantKey.get(mutantKey),
      coveringTests,
    )
    if (oldMutant.status === 'Killed') {
      if (oldKillingTests) {
        for (const killingTest of oldKillingTests) {
          if (testsDiff.get(killingTest) === 'same') {
            return true
          }
        }
      }
      return false
    }
    for (const action of testsDiff.values()) {
      if (action === 'added') {
        return false
      }
    }
    return true
  }

  function diffTestCoverage(
    mutantId: string,
    oldCoveringTestKeys: Set<string> | undefined,
    newCoveringTests: ReadonlySet<TestResult> | undefined,
  ): Map<string, DiffAction> {
    const result = new Map<string, DiffAction>()
    if (newCoveringTests) {
      for (const newTest of newCoveringTests) {
        const key = testToIdentifyingKey(newTest, toRelativeNormalizedFileName(input.basePath, newTest.fileName))
        result.set(key, oldCoveringTestKeys?.has(key) ? 'same' : 'added')
      }
    }
    if (oldCoveringTestKeys) {
      const isStatic = hasStaticCoverage(currentCoverage, mutantId)
      for (const oldTestKey of oldCoveringTestKeys) {
        if (!result.has(oldTestKey)) {
          if (isStatic && newTestKeys.has(oldTestKey)) {
            result.set(oldTestKey, 'same')
          } else {
            result.set(oldTestKey, 'removed')
          }
        }
      }
    }
    return result
  }
}

/**
 * Finds the diff of mutants and tests. Removes mutants / tests that no longer exist (changed or removed). Updates locations of mutants or tests that do still exist.
 * @param oldCode The old code to use for the diff
 * @param newCode The new (current) code to use for the diff
 * @param items The mutants or tests to be looked . These will be treated as immutable.
 * @returns A list of items with updated locations, without items that are changed.
 */
function performFileDiff<T extends { location: Location }>(
  oldCode: string,
  newCode: string,
  items: T[],
): { results: T[]; removeCount: number } {
  const diffMatchPatch = new DiffMatchPatch()
  const oldSourceNormalized = oldCode.replace(/\r\n/g, '\n')
  const currentSrcNormalized = newCode.replace(/\r\n/g, '\n')
  const diffChanges = diffMatchPatch.diff_main(oldSourceNormalized, currentSrcNormalized)

  const toDo = new Set(items.map((m) => ({ ...m, location: deepClone(m.location) })))
  const added = 1
  const removed = -1
  const done: T[] = []
  const currentPosition: Position = { column: 0, line: 0 }
  let removeCount = 0
  for (const [change, text] of diffChanges) {
    if (toDo.size === 0) {
      break
    }
    const offset = calculateOffset(text)
    if (change === added) {
      for (const test of toDo) {
        const { location } = test
        if (gte(currentPosition, location.start) && gte(location.end, currentPosition)) {
          removeCount++
          toDo.delete(test)
        } else {
          locationAdd(location, offset, currentPosition.line === location.start.line)
        }
      }
      positionMove(currentPosition, offset)
    } else if (change === removed) {
      for (const item of toDo) {
        const {
          location: { start },
        } = item
        const endOffset = positionMove({ ...currentPosition }, offset)
        if (gte(endOffset, start)) {
          removeCount++
          toDo.delete(item)
        } else {
          locationAdd(item.location, negate(offset), currentPosition.line === start.line)
        }
      }
    } else {
      positionMove(currentPosition, offset)
      for (const item of toDo) {
        const { end } = item.location
        if (gte(currentPosition, end)) {
          toDo.delete(item)
          done.push(item)
        }
      }
    }
  }
  done.push(...toDo)
  return { results: done, removeCount }
}

function gte(a: Position, b: Position) {
  return a.line > b.line || (a.line === b.line && a.column >= b.column)
}

function locationIncluded(haystack: Location, needle: Location) {
  const startIncluded = gte(needle.start, haystack.start)
  const endIncluded = gte(haystack.end, needle.end)
  return startIncluded && endIncluded
}

function deepClone(loc: Location): Location {
  return { start: { ...loc.start }, end: { ...loc.end } }
}

function mutantToIdentifyingKey(
  {
    mutatorName,
    replacement,
    location: { start, end },
  }: Pick<Mutant, 'location' | 'mutatorName'> & { replacement?: string },
  relativeFileName: string,
) {
  return `${relativeFileName}@${start.line}:${start.column}-${end.line}:${end.column}\n${mutatorName}: ${replacement}`
}

function testToIdentifyingKey(
  {
    name,
    location,
    startPosition,
  }: Pick<schema.TestDefinition, 'location' | 'name'> & Pick<TestResult, 'startPosition'>,
  relativeFileName: string | undefined,
) {
  const effectiveStart = startPosition ?? location?.start ?? { line: 0, column: 0 }
  return `${relativeFileName}@${effectiveStart.line}:${effectiveStart.column}\n${name}`
}

export const toRelativeNormalizedFileName = (basePath: string, fileName: string | undefined): string =>
  normalizeFileName(path.relative(basePath, fileName ?? ''))

function calculateOffset(text: string): Position {
  const pos: Position = { line: 0, column: 0 }
  for (const char of text) {
    if (char === '\n') {
      pos.line++
      pos.column = 0
    } else {
      pos.column++
    }
  }
  return pos
}

function positionMove(pos: Position, diff: Position): Position {
  pos.line += diff.line
  if (diff.line === 0) {
    pos.column += diff.column
  } else {
    pos.column = diff.column
  }
  return pos
}

function locationAdd(
  { start, end }: Location,
  { line, column }: Position,
  currentLine: boolean,
) {
  start.line += line
  if (currentLine) {
    start.column += column
  }
  end.line += line
  if (line === 0 && currentLine) {
    end.column += column
  }
}

function negate({ line, column }: Position): Position {
  return { line: -1 * line, column: -1 * column }
}

interface TestInfo {
  relativeFileName: string
  test: TestDefinition
  key: string
}

type DiffAction = 'added' | 'removed' | 'same'

function closeLocations(testFile: schema.TestFile): LocatedTest[] {
  const locatedTests: LocatedTest[] = []
  const openEndedTests: OpenEndedTest[] = []

  for (const test of testFile.tests) {
    if (testHasLocation(test)) {
      if (isClosed(test)) {
        locatedTests.push(test)
      } else {
        openEndedTests.push(test)
      }
    } else {
      locatedTests.push({
        ...test,
        location: {
          start: { line: 0, column: 0 },
          end: { line: Number.POSITIVE_INFINITY, column: 0 },
        },
      })
    }
  }

  if (openEndedTests.length) {
    openEndedTests.sort((a, b) => a.location.start.line - b.location.start.line)
    const openEndedTestSet = new Set(openEndedTests)
    const startPositions = uniqueStartPositions(openEndedTests)

    let currentPositionIndex = 0
    for (const test of openEndedTestSet) {
      if (eqPosition(test.location.start, startPositions[currentPositionIndex])) {
        currentPositionIndex++
      }
      const nextPosition = startPositions[currentPositionIndex]
      if (nextPosition) {
        locatedTests.push({
          ...test,
          location: {
            start: test.location.start,
            end: nextPosition,
          },
        })
        openEndedTestSet.delete(test)
      }
    }

    for (const lastTest of openEndedTestSet) {
      locatedTests.push({
        ...lastTest,
        location: {
          start: lastTest.location.start,
          end: { line: Number.POSITIVE_INFINITY, column: 0 },
        },
      })
    }
  }

  return locatedTests
}

function uniqueStartPositions(sortedTests: OpenEndedTest[]) {
  let current: Position | undefined
  const startPositions = sortedTests.reduce<Position[]>(
    (collector, { location: { start } }) => {
      if (!current || current.line !== start.line || current.column !== start.column) {
        current = start
        collector.push(current)
      }
      return collector
    },
    [],
  )
  return startPositions
}

function testHasLocation(test: schema.TestDefinition): test is OpenEndedTest {
  return !!test.location?.start
}

function isClosed(test: Required<schema.TestDefinition>): test is LocatedTest {
  return !!test.location.end
}

function eqPosition(start: Position, end?: Position): boolean {
  return start.column === end?.column && start.line === end.line
}

type LocatedTest = schema.TestDefinition & { location: Location }
type OpenEndedTest = schema.TestDefinition & {
  location: schema.OpenEndLocation
}
