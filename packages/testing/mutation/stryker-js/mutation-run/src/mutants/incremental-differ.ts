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
import type * as Path from 'effect/Path'
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
  pathService: Path.Path,
): ReadonlyMap<string, MutateDescription> =>
  new Map(
    Object.entries(fileDescriptions).map(([name, description]) => [
      toRelativeNormalizedFileName(name, basePath, pathService),
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
  pathService: Path.Path,
): IncrementalDiffResult => {
  const mutateMap = toMutateDescriptionMap(input.fileDescriptions, input.basePath, pathService)
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
      testToIdentifyingKey(test, toRelativeNormalizedFileName(test.fileName, input.basePath, pathService))
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
        fileName: pathService.resolve(relativeFileName),
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
    const relativeFileName = toRelativeNormalizedFileName(mutant.fileName, input.basePath, pathService)
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
        fileName: pathService.resolve(oldResult.relativeFileName),
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
        const relativeFileName = toRelativeNormalizedFileName(fileName, input.basePath, pathService)
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
      const relativeFileName = toRelativeNormalizedFileName(fileName, input.basePath, pathService)
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
      const relativeFileName = toRelativeNormalizedFileName(testResult.fileName, input.basePath, pathService)
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
        const key = testToIdentifyingKey(
          newTest,
          toRelativeNormalizedFileName(newTest.fileName, input.basePath, pathService),
        )
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
  const diffs = new DiffMatchPatch().diff_main(oldCode, newCode)
  let removeCount = 0
  const results: T[] = []
  let oldOffset: Position = { line: 0, column: 0 }
  let newOffset: Position = { line: 0, column: 0 }
  let currentOldLocation: Location | undefined
  let currentItems: T[] = [...items].sort((a, b) => {
    if (a.location.start.line !== b.location.start.line) {
      return a.location.start.line - b.location.start.line
    }
    return a.location.start.column - b.location.start.column
  })
  for (const [op, text] of diffs) {
    const textOffset = calculateOffset(text)
    const nextOldOffset = positionMove(oldOffset, textOffset)
    const nextNewOffset = positionMove(newOffset, textOffset)
    if (op === 0) {
      const diff = positionMove(newOffset, negate(oldOffset))
      let i = 0
      for (; i < currentItems.length; i++) {
        const item = currentItems[i]
        if (item === undefined) {
          continue
        }
        if (gte(item.location.start, nextOldOffset)) {
          break
        }
        if (locationIncluded(item.location, { start: oldOffset, end: nextOldOffset })) {
          const newLocation = locationAdd(item.location, diff, currentOldLocation === undefined)
          results.push({ ...item, location: newLocation })
          currentOldLocation = item.location
        } else if (gte(item.location.start, oldOffset)) {
          removeCount++
        }
      }
      currentItems = currentItems.slice(i)
      oldOffset = nextOldOffset
      newOffset = nextNewOffset
    } else if (op === -1) {
      let i = 0
      for (; i < currentItems.length; i++) {
        const item = currentItems[i]
        if (item === undefined) {
          continue
        }
        if (gte(item.location.start, nextOldOffset)) {
          break
        }
        if (gte(item.location.start, oldOffset)) {
          removeCount++
        }
      }
      currentItems = currentItems.slice(i)
      oldOffset = nextOldOffset
    } else {
      newOffset = nextNewOffset
      currentOldLocation = undefined
    }
  }
  for (const item of currentItems) {
    if (gte(item.location.start, oldOffset)) {
      if (locationIncluded(item.location, { start: oldOffset, end: { line: Number.MAX_SAFE_INTEGER, column: 0 } })) {
        const diff = positionMove(newOffset, negate(oldOffset))
        const newLocation = locationAdd(item.location, diff, currentOldLocation === undefined)
        results.push({ ...item, location: newLocation })
      } else {
        removeCount++
      }
    }
  }
  return { results, removeCount }
}

function gte(a: Position, b: Position) {
  return a.line > b.line || (a.line === b.line && a.column >= b.column)
}

function locationIncluded(haystack: Location, needle: Location) {
  return gte(needle.start, haystack.start) && gte(haystack.end, needle.end)
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
  if (location?.start) {
    return `${relativeFileName}@${location.start.line}:${location.start.column}\n${name}`
  }
  if (startPosition) {
    return `${relativeFileName}@${startPosition.line}:${startPosition.column}\n${name}`
  }
  return `${relativeFileName}\n${name}`
}

export const toRelativeNormalizedFileName = (
  fileName: string | undefined,
  basePath: string,
  pathService: Path.Path,
): string => normalizeFileName(pathService.relative(basePath, fileName ?? ''))

function calculateOffset(text: string): Position {
  let line = 0
  let column = 0
  let lastNewlineIndex = -1
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') {
      line++
      lastNewlineIndex = i
    }
  }
  if (lastNewlineIndex === -1) {
    column = text.length
  } else {
    column = text.length - lastNewlineIndex - 1
  }
  return { line, column }
}

function positionMove(pos: Position, diff: Position): Position {
  if (diff.line === 0) {
    return { line: pos.line, column: pos.column + diff.column }
  }
  return { line: pos.line + diff.line, column: diff.column }
}

function locationAdd(
  { start, end }: Location,
  { line, column }: Position,
  currentLine: boolean,
): Location {
  if (line === 0 && currentLine) {
    return {
      start: { line: start.line + line, column: start.column + column },
      end: { line: end.line + line, column: end.column + column },
    }
  }
  if (line === 0) {
    return {
      start,
      end: { line: end.line + line, column: end.column + column },
    }
  }
  return {
    start: { line: start.line + line, column: start.column },
    end: { line: end.line + line, column: end.column },
  }
}

function negate({ line, column }: Position): Position {
  return { line: -1 * line, column: -1 * column }
}

interface TestInfo {
  key: string
  test: TestDefinition
  relativeFileName: string
}

type DiffAction = 'added' | 'removed' | 'same'

function closeLocations(testFile: schema.TestFile): LocatedTest[] {
  const fallback = testFile.tests
  const located: LocatedTest[] = []
  for (const test of fallback) {
    if (!testHasLocation(test)) {
      continue
    }
    if (isClosed(test)) {
      located.push(test)
    } else {
      const beginnings = fallback.filter(testHasLocation).map((t) => t.location.start).sort((a, b) =>
        a.line - b.line || a.column - b.column
      )
      const unique = uniqueStartPositions(beginnings)
      const idx = unique.findIndex((pos) =>
        pos.line === test.location.start.line && pos.column === test.location.start.column
      )
      const next = unique[idx + 1]
      const end = next ? { line: next.line, column: next.column } : { line: Number.MAX_SAFE_INTEGER, column: 0 }
      located.push({ ...test, location: { start: test.location.start, end } })
    }
  }
  return located
}

function uniqueStartPositions(sortedStarts: readonly Position[]): Position[] {
  const seen = new Set<string>()
  const result: Position[] = []
  for (const start of sortedStarts) {
    const key = `${start.line}:${start.column}`
    if (!seen.has(key)) {
      seen.add(key)
      result.push(start)
    }
  }
  return result
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
