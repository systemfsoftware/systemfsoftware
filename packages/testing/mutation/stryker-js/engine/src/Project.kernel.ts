import * as HashMap from 'effect/HashMap'
import * as HashSet from 'effect/HashSet'
import * as Option from 'effect/Option'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

import { IncrementalReportError, IncrementalReportSchema } from './IncrementalReport.schema.js'

const IGNORE_PATTERN_CHARACTER = '!'

const MUTATION_RANGE_REGEX = /(.*?):((\d+)(?::(\d+))?-(\d+)(?::(\d+))?)$/

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

/**
 * Resolve a configured pattern against the project root.
 *
 * Input file names arrive absolute, because they are what the reader found on disk and
 * what every later read opens. Patterns arrive relative, because that is how a user
 * writes them in `stryker.config.json`. Matching the two directly never succeeds, so the
 * pattern is the side that moves.
 */
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
  // Whether a file is hidden is judged on the pattern as written and on the path below the
  // project root: directories above the root are not the project's business, and resolving
  // the pattern would put their dots into the answer.
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
