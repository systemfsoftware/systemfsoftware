import { isDeepStrictEqual } from 'node:util'

import type { StrykerOptions } from '@systemfsoftware/stryker-js-plugin-api/core'
import type { Logger } from '@systemfsoftware/stryker-js-plugin-api/logging'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Match from 'effect/Match'
import * as Path from 'effect/Path'
import type { PlatformError } from 'effect/PlatformError'
import * as S from 'effect/Schema'
import { Minimatch } from 'minimatch'
import type { MutationTestResult } from 'mutation-testing-report-schema/api'

import { defaultOptions } from '../config/index.js'

import {
  reportLocationToStrykerLocation,
  reportOpenEndLocationToStrykerLocation,
} from '../reporting/report-location.js'
import {
  ALWAYS_IGNORE,
  filterMutatePattern,
  IGNORE_PATTERN_CHARACTER,
  resolveFileDescriptions,
  resolveTestFiles,
} from './file-selection.js'
import { IncrementalReportSchema } from './incremental-report.schema.js'
import { logProjectFiles, makeProject, type Project } from './project.js'

export function readProject(
  options: StrykerOptions,
  log: Logger,
  targetMutatePatterns: string[] | undefined,
  basePath: string,
): Effect.Effect<Project, unknown, FileSystem.FileSystem | Path.Path> {
  const {
    mutate,
    tempDirName,
    ignorePatterns,
    incremental,
    incrementalFile,
    force,
    htmlReporter,
    jsonReporter,
    testFiles,
  } = options
  const mutatePatterns: readonly string[] = mutate
  const testFilePatterns: readonly string[] = testFiles ?? []
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
    const logAboutUselessPatterns = !isDeepStrictEqual(mutatePatterns, defaults.mutate)
    if (logAboutUselessPatterns) {
      for (const pattern of mutatePatterns) {
        if (pattern.startsWith(IGNORE_PATTERN_CHARACTER)) {
          const inner = pattern.substring(1)
          const filtered = filterMutatePattern(inputFileNames, inner)
          if (filtered.size === 0) {
            log.warn(`Glob pattern "${pattern}" did not exclude any files.`)
          }
        } else {
          const filtered = filterMutatePattern(inputFileNames, pattern)
          if (filtered.size === 0) {
            log.warn(`Glob pattern "${pattern}" did not result in any files.`)
          }
        }
      }
    }
    const fileDescriptions = resolveFileDescriptions(inputFileNames, [...mutatePatterns], targetMutatePatterns)
    const resolvedTestFiles = resolveTestFiles(inputFileNames, [...testFilePatterns])
    for (const pattern of testFilePatterns) {
      const matched = resolveTestFiles(inputFileNames, [pattern])
      if (matched.length === 0) {
        log.warn(`Glob pattern "${pattern}" did not match any test files.`)
      }
    }
    const incrementalReport = yield* readIncrementalReport(incremental, incrementalFile, log)
    const project = makeProject(fileDescriptions, incrementalReport, resolvedTestFiles)
    logProjectFiles(project, log, ignoreRules, force, mutatePatterns, testFilePatterns, basePath)
    return project
  })
}

function resolveInputFileNames(
  ignoreRules: readonly string[],
  basePath: string,
): Effect.Effect<string[], PlatformError, FileSystem.FileSystem | Path.Path> {
  return Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path

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

    const crawlDir = (
      dir: string,
      rootDir: string,
    ): Effect.Effect<string[], PlatformError, FileSystem.FileSystem | Path.Path> =>
      Effect.gen(function*() {
        const entries = yield* fs.readDirectory(dir)
        const relativeName = path.relative(rootDir, dir)
        const withTypes = yield* Effect.forEach(
          entries,
          (name) =>
            Effect.gen(function*() {
              const full = path.join(dir, name)
              const isDirectory = yield* fs
                .stat(full)
                .pipe(
                  Effect.map((info) => info.type === 'Directory'),
                  Effect.orElseSucceed(() => false),
                )
              const entryPath = `${relativeName.length ? `${relativeName}/` : ''}${name}`
              return { name, full, isDirectory, entryPath }
            }),
          { concurrency: 256 },
        )
        const filtered = withTypes.filter(({ name, entryPath, isDirectory }) => {
          let included = true
          for (const rule of ignoreMatchers) {
            if (rule.negate !== included) {
              const match = isDirectory
                ? matchesDirectory(name, entryPath, rule)
                : matchesFile(name, entryPath, rule)
              if (match) {
                included = rule.negate
              }
            }
          }
          return included
        })
        const files = yield* Effect.forEach(
          filtered,
          (entry): Effect.Effect<string[], PlatformError, FileSystem.FileSystem | Path.Path> =>
            entry.isDirectory ? crawlDir(entry.full, rootDir) : Effect.succeed([entry.full]),
          { concurrency: 256 },
        )
        return files.flat()
      })

    const root = basePath
    const files = yield* crawlDir(root, root)
    return files
  })
}

function readIncrementalReport(
  incremental: boolean,
  incrementalFile: string,
  log: Logger,
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
            Effect.sync(() => {
              log.info(
                'No incremental result file found at %s, a full mutation testing run will be performed.',
                incrementalFile,
              )
            }).pipe(Effect.as<string | undefined>(undefined))),
          Match.orElse(() => Effect.fail(error)),
        )),
    )
    if (contents === undefined) {
      return undefined
    }
    const parsed: unknown = yield* Effect.try(() => JSON.parse(contents) as unknown)
    const decoded = yield* S.decodeUnknownEffect(IncrementalReportSchema)(parsed)
    const mappedFiles = Object.fromEntries(
      Object.entries(decoded.files).map(([fileName, file]) => [
        fileName,
        {
          ...file,
          mutants: file.mutants.map((mutant) => ({
            ...mutant,
            location: reportLocationToStrykerLocation(mutant.location),
          })),
        },
      ]),
    )
    const mappedTestFiles = decoded.testFiles
      ? Object.fromEntries(
        Object.entries(decoded.testFiles).map(([fileName, file]) => [
          fileName,
          {
            ...file,
            tests: file.tests.map((test) => ({
              ...test,
              ...(test.location ? { location: reportOpenEndLocationToStrykerLocation(test.location) } : {}),
            })),
          },
        ]),
      )
      : undefined
    const resultOut: MutationTestResult = {
      ...decoded,
      files: mappedFiles,
      ...(mappedTestFiles ? { testFiles: mappedTestFiles } : {}),
    }
    return resultOut
  })
}
