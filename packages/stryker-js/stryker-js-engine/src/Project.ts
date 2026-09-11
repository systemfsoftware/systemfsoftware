import type { File as InstrumentFile } from '@systemfsoftware/stryker-js-instrumenter'
import type { FileDescription, FileDescriptions, MutateDescription } from '@systemfsoftware/stryker-js/Mutant'
import type { MutationTestResult } from '@systemfsoftware/stryker-js/Report'
import type { StrykerOptions } from '@systemfsoftware/stryker-js/Schema'
import * as Effect from 'effect/Effect'
import * as Equivalence from 'effect/Equivalence'
import * as FileSystem from 'effect/FileSystem'
import * as HashMap from 'effect/HashMap'
import * as HashSet from 'effect/HashSet'
import * as Match from 'effect/Match'
import * as MutableHashMap from 'effect/MutableHashMap'
import * as Option from 'effect/Option'
import * as Path from 'effect/Path'
import type { PlatformError } from 'effect/PlatformError'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'
import { Minimatch } from 'minimatch'

import { defaultOptions } from './Config.js'
import { IncrementalReportError, IncrementalReportSchema } from './IncrementalReport.schema.js'
import { ALWAYS_IGNORE, IGNORE_PATTERN_CHARACTER, MUTATION_RANGE_REGEX } from './Project.ignore.js'

const DEFAULT_GLOB = '**/*.{js,ts,jsx,tsx,html,vue,mjs,mts,cts,cjs}'

const normalizeFileName = (fileName: string): string => fileName.replace(/\\/g, '/')

export interface FileSelectionInput {
  readonly inputFileNames: readonly string[]
  readonly mutatePatterns: readonly string[]
  readonly targetMutatePatterns?: readonly string[]
  readonly testFilePatterns: readonly string[]
  readonly basePath: string
}

export interface SelectedFiles {
  readonly fileDescriptions: Record<string, { readonly mutate: boolean | readonly Location[] }>
  readonly testFiles: readonly string[]
}

type Location = {
  readonly start: { readonly line: number; readonly column: number }
  readonly end: { readonly line: number; readonly column: number }
}

type FileMutate = boolean | readonly Location[]
type FileDescriptionLike = { readonly mutate: FileMutate }

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

interface GlobStep {
  readonly consumed: number
  readonly output: string
}

function consumeDoubleStar(pattern: string, index: number): GlobStep {
  if (pattern[index + 2] === '/') {
    return { consumed: 3, output: '(?:.*\\/)?' }
  }
  return { consumed: 2, output: '.*' }
}

function consumeStar(pattern: string, index: number): GlobStep {
  if (pattern[index + 1] === '*') {
    return consumeDoubleStar(pattern, index)
  }
  return { consumed: 1, output: '[^/]*' }
}

function consumeBrace(pattern: string, index: number): GlobStep {
  const close = pattern.indexOf('}', index)
  if (close === -1) {
    return { consumed: 1, output: '\\{' }
  }
  const escaped = pattern
    .slice(index + 1, close)
    .split(',')
    .map((part) => escapeRegExp(part))
  return { consumed: close - index + 1, output: `(${escaped.join('|')})` }
}

function consumeCharClass(pattern: string, index: number): GlobStep {
  const close = pattern.indexOf(']', index)
  if (close === -1) {
    return { consumed: 1, output: '\\[' }
  }
  return { consumed: close - index + 1, output: pattern.slice(index, close + 1) }
}

function consumeGlobChar(pattern: string, index: number): GlobStep {
  const char = pattern[index]
  return Match.value(char).pipe(
    Match.when('*', () => consumeStar(pattern, index)),
    Match.when('?', () => ({ consumed: 1, output: '[^/]' })),
    Match.when('{', () => consumeBrace(pattern, index)),
    Match.when('[', () => consumeCharClass(pattern, index)),
    Match.orElse(() => ({
      consumed: 1,
      output: escapeRegExp(Option.getOrElse(Option.fromUndefinedOr(char), () => '')),
    })),
  )
}

function globToRegExp(pattern: string): RegExp {
  let index = 0
  let acc = ''
  while (index < pattern.length) {
    const step = consumeGlobChar(pattern, index)
    acc += step.output
    index += step.consumed
  }
  return new RegExp(`^${acc}$`)
}

function resolveAgainstBase(basePath: string, pattern: string): string {
  const normalized = normalizeFileName(pattern)
  const base = trimTrailingSlashes(normalizeFileName(basePath))
  return Match.value(normalized.startsWith('/')).pipe(
    Match.when(true, () => normalized),
    Match.orElse(() =>
      Match.value(normalized.startsWith('./')).pipe(
        Match.when(true, () => `${base}/${normalized.slice(2)}`),
        Match.orElse(() => `${base}/${normalized}`),
      )
    ),
  )
}

function trimTrailingSlashes(value: string): string {
  const trimmed = value.replace(/\/+$/, '')
  return Match.value(trimmed.length === 0).pipe(
    Match.when(true, () => value.slice(0, 1)),
    Match.orElse(() => trimmed),
  )
}

function globPatternOf(pattern: boolean | string): string | undefined {
  if (typeof pattern === 'boolean') {
    return Match.value(pattern).pipe(
      Match.when(true, () => DEFAULT_GLOB),
      Match.orElse(() => undefined),
    )
  }
  return normalizeFileName(pattern)
}

function hasHiddenSegment(fileName: string, base: string): boolean {
  const relative = Match.value(fileName.startsWith(base)).pipe(
    Match.when(true, () => fileName.slice(base.length)),
    Match.orElse(() => fileName),
  )
  return relative.split('/').some((segment) => segment.startsWith('.'))
}

const isExcludedHiddenFile = (
  normalizedFile: string,
  base: string,
  allowHiddenFiles: boolean,
  patternHasDot: boolean,
): boolean =>
  Match.value(allowHiddenFiles).pipe(
    Match.when(true, () => false),
    Match.orElse(() =>
      Match.value(hasHiddenSegment(normalizedFile, base)).pipe(
        Match.when(false, () => false),
        Match.orElse(() => !patternHasDot),
      )
    ),
  )

function createPureMatcher(
  pattern: boolean | string,
  allowHiddenFiles: boolean,
  basePath: string,
): (fileName: string) => boolean {
  const relative = globPatternOf(pattern)
  if (relative === undefined) {
    return (): boolean => false
  }
  const regex = globToRegExp(resolveAgainstBase(basePath, relative))

  const patternHasDot = relative.includes('.')
  const base = `${trimTrailingSlashes(normalizeFileName(basePath))}/`
  return (fileName: string): boolean => {
    const normalizedFile = normalizeFileName(fileName)
    return Match.value(isExcludedHiddenFile(normalizedFile, base, allowHiddenFiles, patternHasDot)).pipe(
      Match.when(true, () => false),
      Match.orElse(() => regex.test(normalizedFile)),
    )
  }
}

const rangeListOf = (mutate: FileMutate): Option.Option<readonly Location[]> =>
  Option.filter(Option.fromUndefinedOr(mutate), Array.isArray)

function unionPair(first: FileDescriptionLike, second: FileDescriptionLike): FileDescriptionLike {
  const ranges = Option.all([rangeListOf(first.mutate), rangeListOf(second.mutate)])
  return Option.match(ranges, {
    onSome: ([firstRanges, secondRanges]) => ({ mutate: [...secondRanges, ...firstRanges] }),
    onNone: () =>
      Match.value(second.mutate).pipe(
        Match.when(true, () => ({ mutate: true })),
        Match.orElse(() =>
          Match.value(first.mutate).pipe(
            Match.when(false, () => ({ mutate: second.mutate })),
            Match.orElse(() => ({ mutate: first.mutate })),
          )
        ),
      ),
  })
}

function unionFileDescriptions(
  first: FileDescriptionLike,
  second?: FileDescriptionLike,
): FileDescriptionLike {
  return Option.match(Option.fromUndefinedOr(second), {
    onNone: () => first,
    onSome: (defined) => unionPair(first, defined),
  })
}

function overlapOf(firstRange: Location, secondRange: Location): Location | undefined {
  const startLine = Math.max(firstRange.start.line, secondRange.start.line)
  const endLine = Math.min(firstRange.end.line, secondRange.end.line)
  const startColumn = Match.value(firstRange.start.line === startLine).pipe(
    Match.when(true, () => firstRange.start.column),
    Match.orElse(() => secondRange.start.column),
  )
  const endColumn = Match.value(firstRange.end.line === endLine).pipe(
    Match.when(true, () => firstRange.end.column),
    Match.orElse(() => secondRange.end.column),
  )
  return Match.value(startLine > endLine).pipe(
    Match.when(true, () => undefined),
    Match.orElse(() => ({
      start: { line: startLine, column: startColumn },
      end: { line: endLine, column: endColumn },
    })),
  )
}

const isLocation = (value: Location | undefined): value is Location => value !== undefined

function overlapRanges(firstRanges: readonly Location[], secondRanges: readonly Location[]): readonly Location[] {
  const overlaps = firstRanges.flatMap((firstRange) =>
    secondRanges.map((secondRange) => overlapOf(firstRange, secondRange))
  )
  return overlaps.filter(isLocation)
}

function intersectFileDescriptions(
  first: FileDescriptionLike,
  second: FileDescriptionLike,
): FileDescriptionLike {
  const ranges = Option.all([rangeListOf(first.mutate), rangeListOf(second.mutate)])
  return Option.match(ranges, {
    onSome: ([firstRanges, secondRanges]) => ({ mutate: overlapRanges(firstRanges, secondRanges) }),
    onNone: () =>
      Match.value(first.mutate).pipe(
        Match.when(true, () => second),
        Match.orElse(() =>
          Match.value(second.mutate).pipe(
            Match.when(true, () => first),
            Match.orElse(() => ({ mutate: false })),
          )
        ),
      ),
  })
}

interface MutationRangePattern {
  readonly pattern: string
  readonly mutate: FileMutate
}

const rangeGroup = (match: RegExpExecArray, index: number, fallback: string): string =>
  Option.getOrElse(Option.fromUndefinedOr(match[index]), () => fallback)

function mutationRangeOf(mutatePattern: string): MutationRangePattern | undefined {
  const match = MUTATION_RANGE_REGEX.exec(mutatePattern)
  if (match === null) {
    return undefined
  }
  const startLine = Number(rangeGroup(match, 3, '1'))
  const startColumn = Number(rangeGroup(match, 4, '0'))
  const endLine = Number(rangeGroup(match, 5, '1'))
  const endColumn = Number(rangeGroup(match, 6, String(Number.MAX_SAFE_INTEGER)))
  return {
    pattern: rangeGroup(match, 1, mutatePattern),
    mutate: [
      {
        start: { line: startLine - 1, column: startColumn },
        end: { line: endLine - 1, column: endColumn },
      },
    ],
  }
}

function describeMatchingFiles(
  fileNames: Iterable<string>,
  pattern: string,
  mutate: FileMutate,
  basePath: string,
): HashMap.HashMap<string, FileDescriptionLike> {
  const matches = createPureMatcher(pattern, false, basePath)
  const entries: Array<readonly [string, FileDescriptionLike]> = Array.from(fileNames)
    .filter((fileName) => matches(fileName))
    .map((fileName): readonly [string, FileDescriptionLike] => [fileName, { mutate }])
  return HashMap.fromIterable(entries)
}

function filterMutatePatternPure(
  fileNames: Iterable<string>,
  mutatePattern: string,
  basePath: string,
): HashMap.HashMap<string, FileDescriptionLike> {
  const range = Option.fromUndefinedOr(mutationRangeOf(mutatePattern))
  const pattern = Option.getOrElse(Option.map(range, (found) => found.pattern), () => mutatePattern)
  const mutate: FileMutate = Option.getOrElse(Option.map(range, (found) => found.mutate), () => true)
  return describeMatchingFiles(fileNames, pattern, mutate, basePath)
}

function resolveFileDescriptionsPure(
  inputFileNames: readonly string[],
  mutatePatterns: readonly string[],
  targetMutatePatterns: readonly string[] | undefined,
  basePath: string,
): Record<string, FileDescriptionLike> {
  const initial = HashMap.fromIterable(
    inputFileNames.map((name): readonly [string, FileDescriptionLike] => [name, { mutate: false }]),
  )
  const afterMutate = mutatePatterns.reduce((acc, pattern) => {
    if (pattern.startsWith(IGNORE_PATTERN_CHARACTER)) {
      const withoutBang = pattern.substring(1)
      const files = filterMutatePatternPure(HashMap.keys(acc), withoutBang, basePath)
      const next = Array.from(HashMap.keys(files)).reduce(
        (inner, fileName) => HashMap.set(inner, fileName, { mutate: false }),
        acc,
      )
      return next
    }
    const files = filterMutatePatternPure(inputFileNames, pattern, basePath)
    const next = HashMap.reduce(files, acc, (inner, file, fileName) => {
      const existingOpt = HashMap.get(inner, fileName)
      if (Option.isSome(existingOpt)) {
        const existing = existingOpt.value
        return HashMap.set(inner, fileName, unionFileDescriptions(file, existing))
      }
      return HashMap.set(inner, fileName, unionFileDescriptions(file, undefined))
    })
    return next
  }, initial)

  if (targetMutatePatterns !== undefined) {
    const seen = targetMutatePatterns.reduce((acc, pattern) => {
      const files = filterMutatePatternPure(HashMap.keys(afterMutate), pattern, basePath)
      const next = HashMap.reduce(
        files,
        acc,
        (inner, description, fileName) =>
          Option.match(HashMap.get(afterMutate, fileName), {
            onNone: () => inner,
            onSome: (current) => {
              const intersected = intersectFileDescriptions(current, description)
              const prevSeen = Option.getOrElse(HashMap.get(inner, fileName), () => undefined)
              return HashMap.set(inner, fileName, unionFileDescriptions(intersected, prevSeen))
            },
          }),
      )
      return next
    }, HashMap.empty<string, FileDescriptionLike>())

    const final = HashMap.reduce(
      afterMutate,
      HashMap.empty<string, FileDescriptionLike>(),
      (acc, _description, fileName) => {
        const seenOpt = HashMap.get(seen, fileName)
        if (Option.isSome(seenOpt)) {
          const seenValue = seenOpt.value
          return HashMap.set(acc, fileName, seenValue)
        }
        return HashMap.set(acc, fileName, { mutate: false })
      },
    )
    return Object.fromEntries(final)
  }
  return Object.fromEntries(afterMutate)
}

function resolveTestFilesPure(
  inputFileNames: readonly string[],
  testFilePatterns: readonly string[],
  basePath: string,
): readonly string[] {
  if (testFilePatterns.length === 0) {
    return []
  }
  const allMatched = testFilePatterns.flatMap((pattern) => {
    const matches = createPureMatcher(pattern, false, basePath)
    return inputFileNames.filter((fileName) => matches(fileName))
  })
  return Array.from(HashSet.fromIterable(allMatched))
}

export const selectFiles = (input: FileSelectionInput): SelectedFiles => ({
  fileDescriptions: resolveFileDescriptionsPure(
    input.inputFileNames,
    input.mutatePatterns,
    input.targetMutatePatterns,
    input.basePath,
  ),
  testFiles: resolveTestFilesPure(input.inputFileNames, input.testFilePatterns, input.basePath),
})

type DecodedReport = typeof IncrementalReportSchema.Type

interface ReportPosition {
  readonly line: number
  readonly column: number
}

const toPosition = (position: ReportPosition): ReportPosition => ({
  line: position.line,
  column: position.column,
})

const toLocation = (
  location: { readonly start: ReportPosition; readonly end: ReportPosition },
): { readonly start: ReportPosition; readonly end: ReportPosition } => ({
  start: toPosition(location.start),
  end: toPosition(location.end),
})

const toOpenEndLocation = (
  location: { readonly start: ReportPosition; readonly end?: ReportPosition | undefined },
): { readonly start: ReportPosition; readonly end?: ReportPosition } =>
  Option.match(Option.fromUndefinedOr(location.end), {
    onNone: () => ({ start: toPosition(location.start) }),
    onSome: (end) => ({ start: toPosition(location.start), end: toPosition(end) }),
  })

const withMappedMutantLocations = (report: DecodedReport): DecodedReport['files'] =>
  Object.fromEntries(
    Object.entries(report.files).map(([fileName, file]) => [
      fileName,
      {
        ...file,
        mutants: file.mutants.map((mutant) => ({ ...mutant, location: toLocation(mutant.location) })),
      },
    ]),
  )

const withMappedTestLocations = (testFiles: NonNullable<DecodedReport['testFiles']>): DecodedReport['testFiles'] =>
  Object.fromEntries(
    Object.entries(testFiles).map(([fileName, file]) => [
      fileName,
      {
        ...file,
        tests: file.tests.map((test) =>
          Option.match(Option.fromUndefinedOr(test.location), {
            onNone: () => ({ ...test }),
            onSome: (location) => ({ ...test, location: toOpenEndLocation(location) }),
          })
        ),
      },
    ]),
  )

const reshape = (decoded: DecodedReport): DecodedReport =>
  Option.match(Option.fromUndefinedOr(decoded.testFiles), {
    onNone: (): DecodedReport => ({ ...decoded, files: withMappedMutantLocations(decoded) }),
    onSome: (testFiles): DecodedReport => ({
      ...decoded,
      files: withMappedMutantLocations(decoded),
      testFiles: withMappedTestLocations(testFiles),
    }),
  })

export const decodeIncrementalReport = (raw: unknown): Result.Result<unknown, IncrementalReportError> =>
  Result.match(S.decodeUnknownResult(IncrementalReportSchema)(raw), {
    onFailure: () =>
      Result.fail(
        new IncrementalReportError({
          message:
            'The incremental report is not a mutation testing report; delete it or re-run without --incremental.',
        }),
      ),
    onSuccess: (decoded) => Result.succeed(reshape(decoded)),
  })

const parseJson = (text: string): unknown => JSON.parse(text)

export const FILE_CONCURRENCY = 24
const stringArrayEquivalence = Equivalence.Array(Equivalence.String)
export interface ProjectFile extends FileDescription {
  readonly name: string
  readonly mutate: MutateDescription
  readonly content: string | undefined
  readonly originalContent: string | undefined
}

export function makeProjectFile(
  name: string,
  mutate: MutateDescription,
  content?: string,
  originalContent?: string,
): ProjectFile {
  return {
    name,
    mutate,
    content,
    originalContent,
  }
}

export function withContent(file: ProjectFile, content: string): ProjectFile {
  return { ...file, content }
}

export function withOriginalContent(file: ProjectFile, originalContent: string): ProjectFile {
  return { ...file, originalContent }
}

export function hasChanges(file: ProjectFile): boolean {
  return file.content !== undefined && file.content !== file.originalContent
}

export function toInstrumenterFile(
  file: ProjectFile,
): Effect.Effect<InstrumentFile, PlatformError, FileSystem.FileSystem> {
  return Effect.gen(function*() {
    const content = yield* readContent(file)
    const result: InstrumentFile = {
      content,
      mutate: file.mutate,
      name: file.name,
    }
    return result
  })
}

export function readContent(
  file: ProjectFile,
): Effect.Effect<string, PlatformError, FileSystem.FileSystem> {
  const inMemory = Option.orElse(
    Option.fromUndefinedOr(file.content),
    () => Option.fromUndefinedOr(file.originalContent),
  )
  return Option.match(inMemory, {
    onSome: (content) => Effect.succeed(content),
    onNone: () =>
      Effect.gen(function*() {
        const fs = yield* FileSystem.FileSystem
        const content = yield* fs.readFileString(file.name)
        return content
      }),
  })
}

export function readOriginal(
  file: ProjectFile,
): Effect.Effect<string, PlatformError, FileSystem.FileSystem> {
  return Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const content = yield* fs.readFileString(file.name)
    return content
  })
}

export function writeInPlace(file: ProjectFile): Effect.Effect<void, PlatformError, FileSystem.FileSystem> {
  const content = Option.filter(Option.fromUndefinedOr(file.content), () => hasChanges(file))
  return Option.match(content, {
    onNone: () => Effect.void,
    onSome: (text) =>
      Effect.gen(function*() {
        const fs = yield* FileSystem.FileSystem
        yield* fs.writeFileString(file.name, text)
      }),
  })
}

export function writeToSandbox(
  file: ProjectFile,
  sandboxDir: string,
  basePath: string,
): Effect.Effect<string, PlatformError, FileSystem.FileSystem | Path.Path> {
  return Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const relative = path.relative(basePath, file.name)
    const targetFileName = path.join(sandboxDir, relative)
    yield* fs.makeDirectory(path.dirname(targetFileName), { recursive: true })
    const content = yield* readContent(file)
    yield* fs.writeFileString(targetFileName, content)
    return targetFileName
  })
}

export function backupTo(
  file: ProjectFile,
  backupDir: string,
  basePath: string,
): Effect.Effect<string, PlatformError, FileSystem.FileSystem | Path.Path> {
  return Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const relative = path.relative(basePath, file.name)
    const backupFileName = path.join(backupDir, relative)
    yield* fs.makeDirectory(path.dirname(backupFileName), { recursive: true })
    const content = yield* readContent(file)
    yield* fs.writeFileString(backupFileName, content)
    return backupFileName
  })
}

export interface Project {
  readonly fileDescriptions: FileDescriptions
  readonly incrementalReport: MutationTestResult | undefined
  readonly testFiles: readonly string[]
  readonly files: MutableHashMap.MutableHashMap<string, ProjectFile>
  readonly filesToMutate: MutableHashMap.MutableHashMap<string, ProjectFile>
}

function addProjectFile(
  files: MutableHashMap.MutableHashMap<string, ProjectFile>,
  filesToMutate: MutableHashMap.MutableHashMap<string, ProjectFile>,
  name: string,
  desc: FileDescription,
): void {
  const file = makeProjectFile(name, desc.mutate)
  MutableHashMap.set(files, name, file)
  Match.value(desc.mutate === false).pipe(
    Match.when(true, () => undefined),
    Match.orElse(() => MutableHashMap.set(filesToMutate, name, file)),
  )
}

export function makeProject(
  fileDescriptions: FileDescriptions,
  incrementalReport?: MutationTestResult,
  testFiles: readonly string[] = [],
): Project {
  const files: MutableHashMap.MutableHashMap<string, ProjectFile> = MutableHashMap.empty<string, ProjectFile>()
  const filesToMutate: MutableHashMap.MutableHashMap<string, ProjectFile> = MutableHashMap.empty<string, ProjectFile>()
  Object.entries(fileDescriptions).forEach(([name, desc]) => addProjectFile(files, filesToMutate, name, desc))
  return {
    fileDescriptions,
    incrementalReport,
    testFiles,
    files,
    filesToMutate,
  }
}

export function isProjectEmpty(project: Project): boolean {
  return MutableHashMap.size(project.files) === 0
}

export function withFile(project: Project, file: ProjectFile): Project {
  const files = MutableHashMap.fromIterable(project.files)
  MutableHashMap.set(files, file.name, file)
  const filesToMutate = MutableHashMap.fromIterable(project.filesToMutate)
  if (file.mutate !== false) {
    MutableHashMap.set(filesToMutate, file.name, file)
  } else {
    MutableHashMap.remove(filesToMutate, file.name)
  }
  return { ...project, files, filesToMutate }
}

export function withInstrumentedFiles(
  project: Project,
  instrumented: Iterable<{ readonly name: string; readonly content: string }>,
): Project {
  let next = project
  for (const { name, content } of instrumented) {
    Option.match(MutableHashMap.get(next.files, name), {
      onNone: () => undefined,
      onSome: (existing) => {
        next = withFile(next, withContent(existing, content))
      },
    })
  }
  return next
}

const applyIgnoreRule = (included: boolean, negate: boolean, matches: () => boolean): boolean =>
  Match.value(negate).pipe(
    Match.when(included, () => included),
    Match.orElse(() =>
      Match.value(matches()).pipe(
        Match.when(true, () => negate),
        Match.orElse(() => included),
      )
    ),
  )

function resolveInputFileNames(
  ignoreRules: readonly string[],
  basePath: string,
): Effect.Effect<string[], PlatformError, FileSystem.FileSystem | Path.Path> {
  return Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const pathService = yield* Path.Path

    const ignoreMatchers = ignoreRules.map(
      (pattern) => new Minimatch(pattern, { dot: true, flipNegate: true, nocase: true }),
    )

    const matchesDirectoryPartially = (entryPath: string, rule: Minimatch): boolean =>
      rule.match(`/${entryPath}`, true) || rule.match(entryPath, true)

    const matchesFile = (entryName: string, entryPath: string, rule: Minimatch): boolean =>
      [entryName, entryPath, `/${entryPath}`].some((candidate) => rule.match(candidate))

    const matchesDirectoryTail = (entryPath: string, rule: Minimatch): boolean =>
      [rule.match(`/${entryPath}/`), rule.match(`${entryPath}/`)].some((matched) => matched)

    const matchesNegatedDirectory = (entryPath: string, rule: Minimatch): boolean =>
      rule.negate && matchesDirectoryPartially(entryPath, rule)

    const matchesDirectory = (entryName: string, entryPath: string, rule: Minimatch): boolean =>
      [
        matchesFile(entryName, entryPath, rule),
        matchesDirectoryTail(entryPath, rule),
        matchesNegatedDirectory(entryPath, rule),
      ].some((matched) => matched)

    const isIncluded = (name: string, entryPath: string, isDirectory: boolean): boolean =>
      ignoreMatchers.reduce(
        (included, rule) =>
          applyIgnoreRule(included, rule.negate, () =>
            Match.value(isDirectory).pipe(
              Match.when(true, () => matchesDirectory(name, entryPath, rule)),
              Match.orElse(() => matchesFile(name, entryPath, rule)),
            )),
        true,
      )

    const crawlDir = (
      dir: string,
      rootDir: string,
    ): Effect.Effect<string[], PlatformError, FileSystem.FileSystem | Path.Path> =>
      Effect.gen(function*() {
        const entries = yield* fs.readDirectory(dir)
        const relativeName = pathService.relative(rootDir, dir)
        const withTypes = yield* Effect.forEach(
          entries,
          (name) =>
            Effect.gen(function*() {
              const full = pathService.join(dir, name)
              const isDirectory = yield* fs
                .stat(full)
                .pipe(
                  Effect.map((info) => info.type === 'Directory'),
                  Effect.orElseSucceed(() => false),
                )
              const prefix = ((): string => {
                if (relativeName.length > 0) {
                  return `${relativeName}/`
                }
                return ''
              })()
              return { name, full, isDirectory, entryPath: `${prefix}${name}` }
            }),
          { concurrency: 256 },
        )
        const filtered = withTypes.filter(({ name, entryPath, isDirectory }) =>
          isIncluded(name, entryPath, isDirectory)
        )
        const files = yield* Effect.forEach(
          filtered,
          (entry): Effect.Effect<string[], PlatformError, FileSystem.FileSystem | Path.Path> => {
            if (entry.isDirectory) {
              return crawlDir(entry.full, rootDir)
            }
            return Effect.succeed([entry.full])
          },
          { concurrency: 256 },
        )
        return files.flat()
      })

    return yield* crawlDir(basePath, basePath)
  })
}

function parseIncrementalReport(
  contents: string | undefined,
): Effect.Effect<MutationTestResult | undefined, unknown, never> {
  return Option.match(Option.fromUndefinedOr(contents), {
    onNone: () => Effect.succeed(undefined),
    onSome: (text) =>
      Effect.gen(function*() {
        const parsed = yield* Effect.try(() => parseJson(text))
        const rawReport: unknown = yield* Effect.fromResult(decodeIncrementalReport(parsed))
        const isMutationTestResult = (_value: unknown): _value is MutationTestResult | undefined => true
        if (!isMutationTestResult(rawReport)) {
          throw new Error('Invalid incremental report shape')
        }
        return rawReport
      }),
  })
}

function readIncrementalReport(
  incremental: boolean,
  incrementalFile: string,
): Effect.Effect<MutationTestResult | undefined, unknown, FileSystem.FileSystem | Path.Path> {
  return Match.value(incremental).pipe(
    Match.when(false, () => Effect.succeed(undefined)),
    Match.orElse(() =>
      Effect.gen(function*() {
        const fs = yield* FileSystem.FileSystem
        const contents: string | undefined = yield* fs.readFileString(incrementalFile).pipe(
          Effect.catchTag('PlatformError', (error) =>
            Match.value(error.reason).pipe(
              Match.tag('NotFound', () =>
                Effect.logInfo(
                  `No incremental result file found at ${incrementalFile}, a full mutation testing run will be performed.`,
                ).pipe(Effect.as<string | undefined>(undefined))),
              Match.orElse(() => Effect.fail(error)),
            )),
        )
        return yield* parseIncrementalReport(contents)
      })
    ),
  )
}

export function readProject(
  options: StrykerOptions,
  targetMutatePatterns: readonly string[] | undefined,
  basePath: string,
): Effect.Effect<Project, unknown, FileSystem.FileSystem | Path.Path> {
  const {
    mutate,
    tempDirName,
    ignorePatterns,
    incremental,
    incrementalFile,
    progressStreamFile,
    htmlReporter,
    jsonReporter,
    testFiles,
  } = options
  const mutatePatterns: readonly string[] = mutate
  const testFilePatterns: readonly string[] = testFiles
  const ignoreRules: readonly string[] = [
    ...ALWAYS_IGNORE,
    tempDirName,
    incrementalFile,
    progressStreamFile,
    htmlReporter.fileName,
    jsonReporter.fileName,
    ...ignorePatterns,
  ]

  return Effect.gen(function*() {
    const inputFileNames = yield* resolveInputFileNames(ignoreRules, basePath)
    const defaults = yield* defaultOptions
    const selection = ((): FileSelectionInput => {
      if (targetMutatePatterns === undefined) {
        return { inputFileNames, mutatePatterns, testFilePatterns, basePath }
      }
      return {
        inputFileNames,
        mutatePatterns,
        testFilePatterns,
        basePath,
        targetMutatePatterns,
      }
    })()
    const decision = selectFiles(selection)

    if (!stringArrayEquivalence(mutatePatterns, defaults.mutate)) {
      yield* Effect.forEach(mutatePatterns, (pattern) =>
        Effect.gen(function*() {
          const excluding = pattern.startsWith(IGNORE_PATTERN_CHARACTER)
          const inner = Match.value(excluding).pipe(
            Match.when(true, () => pattern.substring(1)),
            Match.orElse(() => pattern),
          )
          const probe: FileSelectionInput = {
            inputFileNames,
            mutatePatterns: [inner],
            testFilePatterns: [],
            basePath,
          }
          const probed = selectFiles(probe)
          if (Object.keys(probed.fileDescriptions).length > 0) {
            return
          }
          yield* Effect.logWarning(
            Match.value(excluding).pipe(
              Match.when(true, () => `Glob pattern "${pattern}" did not exclude any files.`),
              Match.orElse(() => `Glob pattern "${pattern}" did not result in any files.`),
            ),
          )
        }))
    }

    yield* Effect.forEach(testFilePatterns, (pattern) =>
      Effect.gen(function*() {
        const probe: FileSelectionInput = {
          inputFileNames,
          mutatePatterns: [],
          testFilePatterns: [pattern],
          basePath,
        }
        const probed = selectFiles(probe)
        if (probed.testFiles.length === 0) {
          yield* Effect.logWarning(`Glob pattern "${pattern}" did not match any test files.`)
        }
      }))

    const incrementalReport = yield* readIncrementalReport(incremental, incrementalFile)
    return makeProject(decision.fileDescriptions, incrementalReport, [...decision.testFiles])
  })
}
