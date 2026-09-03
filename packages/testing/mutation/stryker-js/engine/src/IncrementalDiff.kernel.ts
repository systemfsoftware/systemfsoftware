/// <reference types="vitest/import-meta" />
import { Mutant } from '@systemfsoftware/stryker-js/Mutant'

import { toRelativeNormalizedFileName } from './IncrementalDiff.paths.js'
import type { PreviousFileRecord, PreviousMutantRecord, PreviousTestFileRecord } from './IncrementalDiff.schema.js'

export interface RememberedMutant {
  readonly mutantId: string
  readonly status: string
  readonly testsCompleted?: number | undefined
  readonly coveredBy?: readonly string[] | undefined
  readonly killedBy?: readonly string[] | undefined
}

export interface DiffStatisticsLike {
  readonly changesByFile: Record<string, { readonly added: number; readonly removed: number }>
  readonly total: { readonly added: number; readonly removed: number }
}

export interface IncrementalDiffInput {
  readonly basePath: string
  readonly currentMutants: readonly Mutant[]
  readonly previousFiles: Record<string, PreviousFileRecord>
  readonly previousTestFiles: Record<string, PreviousTestFileRecord>
  readonly currentRelativeFiles: Record<string, string>
  readonly testIdsByRelativeFile: Record<string, readonly string[]>
  readonly coveringTestFilesByMutantId: Record<string, readonly string[]>
  readonly force: boolean
}

export interface IncrementalDiffOutput {
  readonly mutants: readonly Mutant[]
  readonly remembered: readonly RememberedMutant[]
  readonly mutantStatistics: DiffStatisticsLike
  readonly testStatistics: DiffStatisticsLike
}

const REMEMBERED_STATUS: ReadonlySet<string> = new Set(['Killed', 'Survived', 'Timeout', 'NoCoverage', 'Ignored'])

const normalizeFileName = (fileName: string): string => fileName.replaceAll('\\', '/')

const toRelativeNormalized = (fileName: string | undefined, basePath: string): string => {
  const raw = fileName ?? ''
  if (raw.startsWith(basePath)) {
    return normalizeFileName(raw.slice(basePath.length).replace(/^\/+/, ''))
  }
  return normalizeFileName(raw)
}

type KeyLocation = { readonly line: number; readonly column: number }

const mutantKeyOf = (
  mutatorName: string,
  replacement: string,
  start: KeyLocation,
  end: KeyLocation,
): string => `${mutatorName}\u0000${replacement}\u0000${start.line}:${start.column}:${end.line}:${end.column}`

type KeyedMutant = {
  readonly mutatorName: string
  readonly replacement: string
  readonly location: { readonly start: KeyLocation; readonly end: KeyLocation }
}

const currentMutantKey = (mutant: KeyedMutant): string =>
  mutantKeyOf(mutant.mutatorName, mutant.replacement, mutant.location.start, mutant.location.end)

const previousMutantKey = (mutant: KeyedMutant): string =>
  mutantKeyOf(
    mutant.mutatorName,
    mutant.replacement,
    { line: mutant.location.start.line - 1, column: mutant.location.start.column - 1 },
    { line: mutant.location.end.line - 1, column: mutant.location.end.column - 1 },
  )

const changedSourceFiles = (
  previousFiles: Readonly<Record<string, PreviousFileRecord>>,
  currentRelativeFiles: Readonly<Record<string, string>>,
): readonly string[] =>
  Object.entries(previousFiles)
    .filter(([name, previous]) => previous.source !== currentRelativeFiles[name])
    .map(([name]) => name)

const changedTestFiles = (
  previousTestFiles: Readonly<Record<string, PreviousTestFileRecord>>,
  currentRelativeFiles: Readonly<Record<string, string>>,
  testIdsByRelativeFile: Readonly<Record<string, readonly string[]>>,
): readonly string[] =>
  Object.keys({ ...previousTestFiles, ...testIdsByRelativeFile }).filter(
    (name) => previousTestFiles[name]?.source !== currentRelativeFiles[name],
  )

const findRemembered = (
  previousFiles: Readonly<Record<string, PreviousFileRecord>>,
  file: string,
  key: string,
): PreviousMutantRecord | undefined => {
  const candidates = previousFiles[file]?.mutants ?? []
  return candidates.find((candidate) => previousMutantKey(candidate) === key)
}

const hasChangedCoverage = (
  mutantId: string,
  coveringTestFilesByMutantId: Readonly<Record<string, readonly string[]>>,
  changedTests: readonly string[],
): boolean => (coveringTestFilesByMutantId[mutantId] ?? []).some((file) => changedTests.includes(file))

const decideForMutant = (
  mutant: Mutant,
  input: IncrementalDiffInput,
  changedFiles: readonly string[],
  changedTests: readonly string[],
): { readonly kind: 'run' } | { readonly kind: 'remembered'; readonly previous: PreviousMutantRecord } => {
  const file = toRelativeNormalized(mutant.fileName, input.basePath)
  if (changedFiles.includes(file)) return { kind: 'run' }
  const previous = findRemembered(input.previousFiles, file, currentMutantKey(mutant))
  if (previous === undefined) return { kind: 'run' }
  if (!REMEMBERED_STATUS.has(previous.status)) return { kind: 'run' }
  if (hasChangedCoverage(mutant.id, input.coveringTestFilesByMutantId, changedTests)) return { kind: 'run' }
  return { kind: 'remembered', previous }
}

const countBy = (files: readonly string[]): Readonly<Record<string, number>> =>
  files.reduce<Record<string, number>>((acc, file) => {
    acc[file] = (acc[file] ?? 0) + 1
    return acc
  }, {})

const uniqueFiles = (files: readonly string[]): readonly string[] =>
  files.filter((file, index, all) => all.indexOf(file) === index)

const statisticsOf = (addedFiles: readonly string[], removedFiles: readonly string[]) => {
  const addedByFile = countBy(addedFiles)
  const removedByFile = countBy(removedFiles)
  const files = uniqueFiles([...Object.keys(addedByFile), ...Object.keys(removedByFile)])
  const changesByFile: Record<string, { added: number; removed: number }> = {}
  for (const file of files) {
    changesByFile[file] = { added: addedByFile[file] ?? 0, removed: removedByFile[file] ?? 0 }
  }
  const total = files.reduce(
    (acc, file) => ({ added: acc.added + (addedByFile[file] ?? 0), removed: acc.removed + (removedByFile[file] ?? 0) }),
    { added: 0, removed: 0 },
  )
  return { changesByFile, total }
}

const testStatisticsOf = (
  previousTestFiles: Readonly<Record<string, PreviousTestFileRecord>>,
  testIdsByRelativeFile: Readonly<Record<string, readonly string[]>>,
) => {
  const currentTestFiles = Object.keys(testIdsByRelativeFile)
  const added = currentTestFiles.filter((name) => previousTestFiles[name] === undefined)
  const removed = Object.keys(previousTestFiles).filter((name) => testIdsByRelativeFile[name] === undefined)
  return statisticsOf(added, removed)
}

const removedMutantFiles = (
  input: IncrementalDiffInput,
  currentKeysByFile: Readonly<Record<string, readonly string[]>>,
): readonly string[] =>
  Object.entries(input.previousFiles).flatMap(([file, previous]) => {
    const keys = currentKeysByFile[file]
    const removed = (previous.mutants ?? []).filter((candidate) => {
      if (keys === undefined) return true
      return !keys.includes(previousMutantKey(candidate))
    })
    return removed.map(() => file)
  })

const rememberedEntryOf = (mutant: Mutant, previous: PreviousMutantRecord): RememberedMutant => {
  const entry: RememberedMutant = { mutantId: mutant.id, status: previous.status }
  if (previous.testsCompleted !== undefined) {
    Object.assign(entry, { testsCompleted: previous.testsCompleted })
  }
  if (previous.coveredBy !== undefined) {
    Object.assign(entry, { coveredBy: previous.coveredBy })
  }
  if (previous.killedBy !== undefined) {
    Object.assign(entry, { killedBy: previous.killedBy })
  }
  return entry
}

export const computeIncrementalDiff = (
  input: IncrementalDiffInput,
): IncrementalDiffOutput => {
  if (input.force) {
    const added = input.currentMutants.map((mutant) => toRelativeNormalizedFileName(mutant.fileName, input.basePath))
    return {
      mutants: [...input.currentMutants],
      remembered: [],
      mutantStatistics: statisticsOf(added, []),
      testStatistics: testStatisticsOf(input.previousTestFiles, input.testIdsByRelativeFile),
    }
  }
  const changedFiles = changedSourceFiles(input.previousFiles, input.currentRelativeFiles)
  const changedTests = changedTestFiles(
    input.previousTestFiles,
    input.currentRelativeFiles,
    input.testIdsByRelativeFile,
  )
  const toRun: Mutant[] = []
  const remembered: RememberedMutant[] = []
  const addedFiles: string[] = []
  for (const mutant of input.currentMutants) {
    const decision = decideForMutant(mutant, input, changedFiles, changedTests)
    if (decision.kind === 'run') {
      toRun.push(mutant)
      addedFiles.push(toRelativeNormalizedFileName(mutant.fileName, input.basePath))
      continue
    }
    remembered.push(rememberedEntryOf(mutant, decision.previous))
  }
  const currentKeysByFile = input.currentMutants.reduce<Record<string, string[]>>((acc, mutant) => {
    const file = toRelativeNormalizedFileName(mutant.fileName, input.basePath)
    const keys = acc[file] ?? []
    acc[file] = [...keys, currentMutantKey(mutant)]
    return acc
  }, {})
  const removedFiles = removedMutantFiles(input, currentKeysByFile)
  return {
    mutants: toRun,
    remembered,
    mutantStatistics: statisticsOf(addedFiles, removedFiles),
    testStatistics: testStatisticsOf(input.previousTestFiles, input.testIdsByRelativeFile),
  }
}

if (import.meta.vitest !== void 0) {
  const { expect, it } = await import('vitest')

  it('Should_KeepKilledBy_When_BuildingARememberedEntry', () => {
    const location = { start: { line: 1, column: 0 }, end: { line: 1, column: 1 } }
    const mutant = new Mutant({
      id: 'm1',
      fileName: '/proj/src/a.ts',
      mutatorName: 'BooleanLiteral',
      replacement: 'false',
      location,
    })
    const previous = {
      mutatorName: 'BooleanLiteral',
      replacement: 'false',
      location,
      status: 'Killed',
      killedBy: ['t1'],
      coveredBy: ['t1'],
    }
    expect(rememberedEntryOf(mutant, previous)).toEqual({
      mutantId: 'm1',
      status: 'Killed',
      killedBy: ['t1'],
      coveredBy: ['t1'],
    })
  })
}
