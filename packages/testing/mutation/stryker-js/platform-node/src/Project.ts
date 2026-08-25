/**
 * Project capability — the files a run mutates, and the prior report it compares against.
 *
 * The impure edge walks the tree and reads the incremental document; which of
 * those files are mutated, and how the prior report is reshaped, are decisions
 * that live in `Project.workflow.ts` and `IncrementalReport.workflow.ts`.
 */

import * as Equivalence from 'effect/Equivalence'

import type { File as InstrumentFile } from '@systemfsoftware/stryker-js-instrumenter'
import type { FileDescription, FileDescriptions, MutateDescription } from '@systemfsoftware/stryker-js/Mutant'
import type { StrykerOptions } from '@systemfsoftware/stryker-js/Schema'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Match from 'effect/Match'
import * as MutableHashMap from 'effect/MutableHashMap'
import * as Option from 'effect/Option'
import * as Path from 'effect/Path'
import type { PlatformError } from 'effect/PlatformError'
import { Minimatch } from 'minimatch'
import type { MutationTestResult } from 'mutation-testing-report-schema/api'

import { defaultOptions } from './Config.js'
import { IncrementalReportCommand, incrementalReportWorkflow } from './IncrementalReport.workflow.js'
import {
  ALWAYS_IGNORE,
  FileSelectionCommand,
  fileSelectionWorkflow,
  IGNORE_PATTERN_CHARACTER,
} from './Project.workflow.js'

/** `JSON.parse` hands back `any`; the annotation is what forces a decode downstream. */
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

/**
 * Walks the tree under `basePath`, honouring the ignore rules as it descends so
 * an ignored directory is never entered. The rules are applied in order and a
 * negated rule re-includes, which is why inclusion is tracked per entry rather
 * than short-circuited on the first match.
 */
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

/**
 * Reads the prior report. A missing file is not a failure — it means every
 * mutant is new — so only that one reason resolves to `undefined`; any other
 * read error still fails the run rather than silently discarding history.
 */
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
    const decision = yield* Effect.fromResult(incrementalReportWorkflow(new IncrementalReportCommand({ raw: parsed })))
    // The decision carries the report as `unknown` because the schema that
    // typed it is a Wire schema for foreign data, whose inferred type cannot be
    // named across this module boundary. Decoding already proved the shape.
    const rawReport: unknown = decision.report
    const isMutationTestResult = (_value: unknown): _value is MutationTestResult | undefined => true
    if (!isMutationTestResult(rawReport)) {
      throw new Error('Invalid incremental report shape')
    }
    const report: MutationTestResult | undefined = rawReport
    return report
  })
}

/**
 * Reads the project: which files exist, which of them are mutated, which are
 * tests, and what the previous run concluded.
 */
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
    htmlReporter.fileName,
    jsonReporter.fileName,
    ...ignorePatterns,
  ]

  return Effect.gen(function*() {
    const inputFileNames = yield* resolveInputFileNames(ignoreRules, basePath)
    const defaults = yield* defaultOptions
    const selection = ((): FileSelectionCommand => {
      if (targetMutatePatterns === undefined) {
        return new FileSelectionCommand({ inputFileNames, mutatePatterns, testFilePatterns, basePath })
      }
      return new FileSelectionCommand({
        inputFileNames,
        mutatePatterns,
        testFilePatterns,
        basePath,
        targetMutatePatterns,
      })
    })()
    const decision = yield* Effect.fromResult(fileSelectionWorkflow(selection))

    // A pattern the user wrote themselves that selects nothing is almost always
    // a mistake; the defaults selecting nothing is normal and stays quiet.
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
          const probe = new FileSelectionCommand({
            inputFileNames,
            mutatePatterns: [inner],
            testFilePatterns: [],
            basePath,
          })
          const probed = yield* Effect.fromResult(fileSelectionWorkflow(probe))
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
        const probe = new FileSelectionCommand({
          inputFileNames,
          mutatePatterns: [],
          testFilePatterns: [pattern],
          basePath,
        })
        const probed = yield* Effect.fromResult(fileSelectionWorkflow(probe))
        if (probed.testFiles.length === 0) {
          yield* Effect.logWarning(`Glob pattern "${pattern}" did not match any test files.`)
        }
      }))

    const incrementalReport = yield* readIncrementalReport(incremental, incrementalFile)
    return makeProject(decision.fileDescriptions, incrementalReport, [...decision.testFiles])
  })
}
