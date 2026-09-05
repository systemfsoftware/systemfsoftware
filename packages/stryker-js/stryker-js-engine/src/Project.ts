import type { File as InstrumentFile } from '@systemfsoftware/stryker-js-instrumenter'
import type { FileDescription, FileDescriptions, MutateDescription } from '@systemfsoftware/stryker-js/Mutant'
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
import type { MutationTestResult } from 'mutation-testing-report-schema/api'

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

function globToRegExp(pattern: string): RegExp {
  const build = (index: number, acc: string): string => {
    if (index >= pattern.length) {
      return acc
    }
    const char = pattern[index]
    if (char === '*') {
      const next = pattern[index + 1]
      if (next === '*') {
        const after = pattern[index + 2]
        if (after === '/') {
          return build(index + 3, `${acc}(?:.*\\/)?`)
        }
        return build(index + 2, `${acc}.*`)
      }
      return build(index + 1, `${acc}[^/]*`)
    }
    if (char === '?') {
      return build(index + 1, `${acc}[^/]`)
    }
    if (char === '{') {
      const close = pattern.indexOf('}', index)
      if (close !== -1) {
        const inner = pattern.slice(index + 1, close)
        const parts = inner.split(',')
        const escaped = parts.map((part) => escapeRegExp(part))
        return build(close + 1, `${acc}(${escaped.join('|')})`)
      }
      return build(index + 1, `${acc}\\{`)
    }
    if (char === '[') {
      const close = pattern.indexOf(']', index)
      if (close !== -1) {
        return build(close + 1, `${acc}${pattern.slice(index, close + 1)}`)
      }
      return build(index + 1, `${acc}\\[`)
    }
    return build(index + 1, `${acc}${escapeRegExp(char ?? '')}`)
  }
  return new RegExp(`^${build(0, '')}$`)
}

function resolveAgainstBase(basePath: string, pattern: string): string {
  const normalized = normalizeFileName(pattern)
  if (normalized.startsWith('/')) {
    return normalized
  }
  const base = trimTrailingSlashes(normalizeFileName(basePath))
  if (normalized.startsWith('./')) {
    return `${base}/${normalized.slice(2)}`
  }
  return `${base}/${normalized}`
}

function trimTrailingSlashes(value: string): string {
  if (value.length > 1 && value.endsWith('/')) {
    return trimTrailingSlashes(value.slice(0, -1))
  }
  return value
}

function createPureMatcher(
  pattern: boolean | string,
  allowHiddenFiles: boolean,
  basePath: string,
): (fileName: string) => boolean {
  const relative = (() => {
    if (typeof pattern === 'string') {
      return normalizeFileName(pattern)
    }
    if (pattern) {
      return DEFAULT_GLOB
    }
    return false
  })()
  if (relative === false) {
    return (): boolean => false
  }
  const regex = globToRegExp(resolveAgainstBase(basePath, relative))

  const patternHasDot = relative.includes('.')
  const base = `${trimTrailingSlashes(normalizeFileName(basePath))}/`
  return (fileName: string): boolean => {
    const normalizedFile = normalizeFileName(fileName)
    if (!allowHiddenFiles) {
      const inside = (() => {
        if (normalizedFile.startsWith(base)) {
          return normalizedFile.slice(base.length)
        }
        return normalizedFile
      })()
      const hasDotSegment = inside.split('/').some((segment) => segment.startsWith('.'))
      if (hasDotSegment && !patternHasDot) {
        return false
      }
    }
    return regex.test(normalizedFile)
  }
}

function unionFileDescriptions(
  first: FileDescriptionLike,
  second?: FileDescriptionLike,
): FileDescriptionLike {
  if (second !== undefined) {
    if (Array.isArray(first.mutate) && Array.isArray(second.mutate)) {
      const firstArray: readonly Location[] = first.mutate
      const secondArray: readonly Location[] = second.mutate
      const combined: readonly Location[] = [...secondArray, ...firstArray]
      return { mutate: combined }
    }
    if (second.mutate === true) {
      return { mutate: true }
    }
    if (first.mutate === false) {
      return { mutate: second.mutate }
    }
    return { mutate: first.mutate }
  }
  return first
}
function intersectFileDescriptions(
  first: FileDescriptionLike,
  second: FileDescriptionLike,
): FileDescriptionLike {
  if (Array.isArray(first.mutate) && Array.isArray(second.mutate)) {
    const firstArray: readonly Location[] = first.mutate
    const secondArray: readonly Location[] = second.mutate
    const intersectedRanges = firstArray.flatMap((firstRange) =>
      secondArray.map((secondRange) => {
        const startLine = (() => {
          if (firstRange.start.line > secondRange.start.line) {
            return firstRange.start.line
          }
          return secondRange.start.line
        })()
        const endLine = (() => {
          if (firstRange.end.line < secondRange.end.line) {
            return firstRange.end.line
          }
          return secondRange.end.line
        })()
        if (startLine > endLine) {
          return undefined
        }
        const startColumn = (() => {
          if (firstRange.start.line === startLine) {
            return firstRange.start.column
          }
          return secondRange.start.column
        })()
        const endColumn = (() => {
          if (firstRange.end.line === endLine) {
            return firstRange.end.column
          }
          return secondRange.end.column
        })()
        return {
          start: { line: startLine, column: startColumn },
          end: { line: endLine, column: endColumn },
        }
      })
    ).filter((value): value is Location => value !== undefined)
    return { mutate: intersectedRanges }
  }
  if (first.mutate === true) {
    return second
  }
  if (second.mutate === true) {
    return first
  }
  return { mutate: false }
}

function filterMutatePatternPure(
  fileNames: Iterable<string>,
  mutatePattern: string,
  basePath: string,
): HashMap.HashMap<string, FileDescriptionLike> {
  const match = MUTATION_RANGE_REGEX.exec(mutatePattern)
  if (match !== null) {
    const rawPattern = match[1]
    const startLineStr = match[3] ?? '1'
    const startColumnStr = match[4] ?? '0'
    const endLineStr = match[5] ?? '1'
    const endColumnStr = match[6] ?? String(Number.MAX_SAFE_INTEGER)
    const pattern = (() => {
      if (rawPattern !== undefined) {
        return rawPattern
      }
      return mutatePattern
    })()
    const startLine = Number(startLineStr)
    const startColumn = Number(startColumnStr)
    const endLine = Number(endLineStr)
    const endColumn = Number(endColumnStr)
    const location: Location = {
      start: { line: startLine - 1, column: startColumn },
      end: { line: endLine - 1, column: endColumn },
    }
    const mutate: FileMutate = [location]
    const matches = createPureMatcher(pattern, false, basePath)
    const entries: Array<readonly [string, FileDescriptionLike]> = Array.from(fileNames)
      .filter((fileName) => matches(fileName))
      .map((fileName): readonly [string, FileDescriptionLike] => [fileName, { mutate }])
    return HashMap.fromIterable(entries)
  }
  const pattern = mutatePattern
  const mutate: FileMutate = true
  const matches = createPureMatcher(pattern, false, basePath)
  const entries: Array<readonly [string, FileDescriptionLike]> = Array.from(fileNames)
    .filter((fileName) => matches(fileName))
    .map((fileName): readonly [string, FileDescriptionLike] => [fileName, { mutate }])
  return HashMap.fromIterable(entries)
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
      const next = HashMap.reduce(files, acc, (inner, description, fileName) => {
        const currentOpt = HashMap.get(afterMutate, fileName)
        if (Option.isNone(currentOpt)) {
          return inner
        }
        const current = currentOpt.value
        const intersected = intersectFileDescriptions(current, description)
        const prevSeenOpt = HashMap.get(inner, fileName)
        if (Option.isSome(prevSeenOpt)) {
          const prevSeen = prevSeenOpt.value
          return HashMap.set(inner, fileName, unionFileDescriptions(intersected, prevSeen))
        }
        return HashMap.set(inner, fileName, unionFileDescriptions(intersected, undefined))
      })
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
  return Effect.gen(function*() {
    if (file.content !== undefined) {
      return file.content
    }
    if (file.originalContent !== undefined) {
      return file.originalContent
    }
    const fs = yield* FileSystem.FileSystem
    const content = yield* fs.readFileString(file.name)
    return content
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
  return Effect.gen(function*() {
    if (file.content !== undefined && hasChanges(file)) {
      const fs = yield* FileSystem.FileSystem
      yield* fs.writeFileString(file.name, file.content)
    }
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

export function makeProject(
  fileDescriptions: FileDescriptions,
  incrementalReport?: MutationTestResult,
  testFiles: readonly string[] = [],
): Project {
  const files: MutableHashMap.MutableHashMap<string, ProjectFile> = MutableHashMap.empty<string, ProjectFile>()
  const filesToMutate: MutableHashMap.MutableHashMap<string, ProjectFile> = MutableHashMap.empty<string, ProjectFile>()
  for (const [name, desc] of Object.entries(fileDescriptions)) {
    const file = makeProjectFile(name, desc.mutate)
    MutableHashMap.set(files, name, file)
    if (desc.mutate !== false) {
      MutableHashMap.set(filesToMutate, name, file)
    }
  }
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
    const existingOpt = MutableHashMap.get(next.files, name)
    if (Option.isNone(existingOpt)) {
      continue
    }
    const existing = existingOpt.value
    const updated = withContent(existing, content)
    next = withFile(next, updated)
  }
  return next
}

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
      rule.match(entryName) || rule.match(entryPath) || rule.match(`/${entryPath}`)

    const matchesDirectory = (entryName: string, entryPath: string, rule: Minimatch): boolean =>
      matchesFile(entryName, entryPath, rule) ||
      rule.match(`/${entryPath}/`) ||
      rule.match(`${entryPath}/`) ||
      (rule.negate && matchesDirectoryPartially(entryPath, rule))

    const isIncluded = (name: string, entryPath: string, isDirectory: boolean): boolean => {
      const decide = (included: boolean, remaining: readonly Minimatch[]): boolean => {
        const [rule, ...rest] = remaining
        if (rule === undefined) {
          return included
        }
        if (rule.negate === included) {
          return decide(included, rest)
        }
        const matches = (): boolean => {
          if (isDirectory) {
            return matchesDirectory(name, entryPath, rule)
          }
          return matchesFile(name, entryPath, rule)
        }
        const matched = matches()
        if (matched) {
          return decide(rule.negate, rest)
        }
        return decide(included, rest)
      }
      return decide(true, ignoreMatchers)
    }

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

function readIncrementalReport(
  incremental: boolean,
  incrementalFile: string,
): Effect.Effect<MutationTestResult | undefined, unknown, FileSystem.FileSystem | Path.Path> {
  return Effect.gen(function*() {
    if (!incremental) {
      return undefined
    }
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
    if (contents === undefined) {
      return undefined
    }
    const parsed = yield* Effect.try(() => parseJson(contents))
    const rawReport: unknown = yield* Effect.fromResult(decodeIncrementalReport(parsed))
    const isMutationTestResult = (_value: unknown): _value is MutationTestResult | undefined => true
    if (!isMutationTestResult(rawReport)) {
      throw new Error('Invalid incremental report shape')
    }
    const report: MutationTestResult | undefined = rawReport
    return report
  })
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
          const inner = ((): string => {
            if (excluding) {
              return pattern.substring(1)
            }
            return pattern
          })()
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
          if (excluding) {
            yield* Effect.logWarning(`Glob pattern "${pattern}" did not exclude any files.`)
            return
          }
          yield* Effect.logWarning(`Glob pattern "${pattern}" did not result in any files.`)
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
