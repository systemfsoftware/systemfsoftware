/// <reference types="vitest/import-meta" />
import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Mutant } from '@systemfsoftware/stryker-js/Mutant'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

const DiffChangesSchema = S.Struct({ added: S.Finite, removed: S.Finite })
const DiffStatisticsSchema = S.Struct({
  changesByFile: S.Record(S.String, DiffChangesSchema),
  total: DiffChangesSchema,
})

const PositionSchema = S.Struct({ line: S.Finite, column: S.Finite })
const PreviousLocationSchema = S.Struct({ start: PositionSchema, end: PositionSchema })

const PreviousMutantSchema = S.Struct({
  mutatorName: S.String,
  replacement: S.String,
  location: PreviousLocationSchema,
  status: S.String,
  testsCompleted: S.optional(S.Finite),
  coveredBy: S.optional(S.Array(S.String)),
  killedBy: S.optional(S.Array(S.String)),
})

const PreviousFileSchema = S.Struct({
  source: S.optional(S.String),
  mutants: S.optional(S.Array(PreviousMutantSchema)),
})

const PreviousTestFileSchema = S.Struct({
  source: S.optional(S.String),
})

const RememberedMutantSchema = S.Struct({
  mutantId: S.String,
  status: S.String,
  testsCompleted: S.optional(S.Finite),
  coveredBy: S.optional(S.Array(S.String)),
  killedBy: S.optional(S.Array(S.String)),
})

export const PreviousFilesSchema = S.Record(S.String, PreviousFileSchema)
export const PreviousTestFilesSchema = S.Record(S.String, PreviousTestFileSchema)

export class IncrementalDiffCommand extends S.TaggedClass<IncrementalDiffCommand>()('IncrementalDiffCommand', {
  basePath: S.String,
  currentMutants: S.Array(Mutant),
  previousFiles: PreviousFilesSchema,
  previousTestFiles: PreviousTestFilesSchema,
  currentRelativeFiles: S.Record(S.String, S.String),
  testIdsByRelativeFile: S.Record(S.String, S.Array(S.String)),
  coveringTestFilesByMutantId: S.Record(S.String, S.Array(S.String)),
  force: S.Boolean,
}) {}

export class IncrementalDiffDecision extends S.TaggedClass<IncrementalDiffDecision>()('IncrementalDiffDecision', {
  mutants: S.Array(Mutant),
  remembered: S.Array(RememberedMutantSchema),
  mutantStatistics: DiffStatisticsSchema,
  testStatistics: DiffStatisticsSchema,
}) {}

export class IncrementalDiffError extends S.TaggedError<IncrementalDiffError>()('IncrementalDiffError', {
  message: S.String,
}) {}

type PreviousFile = S.Schema.Type<typeof PreviousFileSchema>
type PreviousTestFile = S.Schema.Type<typeof PreviousTestFileSchema>
type PreviousMutant = S.Schema.Type<typeof PreviousMutantSchema>
type RememberedMutant = S.Schema.Type<typeof RememberedMutantSchema>

export const REMEMBERED_REASON = 'Remembered'

const REMEMBERED_STATUS: ReadonlySet<string> = new Set(['Killed', 'Survived', 'Timeout', 'NoCoverage', 'Ignored'])

const normalizeFileName = (fileName: string): string => fileName.replaceAll('\\', '/')

export const toRelativeNormalizedFileName = (fileName: string | undefined, basePath: string): string => {
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
  previousFiles: Readonly<Record<string, PreviousFile>>,
  currentRelativeFiles: Readonly<Record<string, string>>,
): readonly string[] =>
  Object.entries(previousFiles)
    .filter(([name, previous]) => previous.source !== currentRelativeFiles[name])
    .map(([name]) => name)

const changedTestFiles = (
  previousTestFiles: Readonly<Record<string, PreviousTestFile>>,
  currentRelativeFiles: Readonly<Record<string, string>>,
  testIdsByRelativeFile: Readonly<Record<string, readonly string[]>>,
): readonly string[] =>
  Object.keys({ ...previousTestFiles, ...testIdsByRelativeFile }).filter(
    (name) => previousTestFiles[name]?.source !== currentRelativeFiles[name],
  )

const findRemembered = (
  previousFiles: Readonly<Record<string, PreviousFile>>,
  file: string,
  key: string,
): PreviousMutant | undefined => {
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
  command: IncrementalDiffCommand,
  changedFiles: readonly string[],
  changedTests: readonly string[],
): { readonly kind: 'run' } | { readonly kind: 'remembered'; readonly previous: PreviousMutant } => {
  const file = toRelativeNormalizedFileName(mutant.fileName, command.basePath)
  if (changedFiles.includes(file)) return { kind: 'run' }
  const previous = findRemembered(command.previousFiles, file, currentMutantKey(mutant))
  if (previous === undefined) return { kind: 'run' }
  if (!REMEMBERED_STATUS.has(previous.status)) return { kind: 'run' }
  if (hasChangedCoverage(mutant.id, command.coveringTestFilesByMutantId, changedTests)) return { kind: 'run' }
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
  previousTestFiles: Readonly<Record<string, PreviousTestFile>>,
  testIdsByRelativeFile: Readonly<Record<string, readonly string[]>>,
) => {
  const currentTestFiles = Object.keys(testIdsByRelativeFile)
  const added = currentTestFiles.filter((name) => previousTestFiles[name] === undefined)
  const removed = Object.keys(previousTestFiles).filter((name) => testIdsByRelativeFile[name] === undefined)
  return statisticsOf(added, removed)
}

const removedMutantFiles = (
  command: IncrementalDiffCommand,
  currentKeysByFile: Readonly<Record<string, readonly string[]>>,
): readonly string[] =>
  Object.entries(command.previousFiles).flatMap(([file, previous]) => {
    const keys = currentKeysByFile[file]
    const removed = (previous.mutants ?? []).filter((candidate) => {
      if (keys === undefined) return true
      return !keys.includes(previousMutantKey(candidate))
    })
    return removed.map(() => file)
  })

const rememberedEntryOf = (mutant: Mutant, previous: PreviousMutant): RememberedMutant => {
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

const decideIncremental = (
  command: IncrementalDiffCommand,
): Result.Result<IncrementalDiffDecision, IncrementalDiffError> => {
  if (command.force) {
    const added = command.currentMutants.map((mutant) =>
      toRelativeNormalizedFileName(mutant.fileName, command.basePath)
    )
    return Result.succeed(
      IncrementalDiffDecision.make({
        mutants: [...command.currentMutants],
        remembered: [],
        mutantStatistics: statisticsOf(added, []),
        testStatistics: testStatisticsOf(command.previousTestFiles, command.testIdsByRelativeFile),
      }),
    )
  }
  const changedFiles = changedSourceFiles(command.previousFiles, command.currentRelativeFiles)
  const changedTests = changedTestFiles(
    command.previousTestFiles,
    command.currentRelativeFiles,
    command.testIdsByRelativeFile,
  )
  const toRun: Mutant[] = []
  const remembered: RememberedMutant[] = []
  const addedFiles: string[] = []
  for (const mutant of command.currentMutants) {
    const decision = decideForMutant(mutant, command, changedFiles, changedTests)
    if (decision.kind === 'run') {
      toRun.push(mutant)
      addedFiles.push(toRelativeNormalizedFileName(mutant.fileName, command.basePath))
      continue
    }
    remembered.push(rememberedEntryOf(mutant, decision.previous))
  }
  const currentKeysByFile = command.currentMutants.reduce<Record<string, string[]>>((acc, mutant) => {
    const file = toRelativeNormalizedFileName(mutant.fileName, command.basePath)
    const keys = acc[file] ?? []
    acc[file] = [...keys, currentMutantKey(mutant)]
    return acc
  }, {})
  const removedFiles = removedMutantFiles(command, currentKeysByFile)
  return Result.succeed(
    IncrementalDiffDecision.make({
      mutants: toRun,
      remembered,
      mutantStatistics: statisticsOf(addedFiles, removedFiles),
      testStatistics: testStatisticsOf(command.previousTestFiles, command.testIdsByRelativeFile),
    }),
  )
}

export const incrementalDifferWorkflow = Workflow.make(IncrementalDiffCommand, (command) => decideIncremental(command))

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
