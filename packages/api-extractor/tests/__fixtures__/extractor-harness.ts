import { Extractor } from '@systemfsoftware/api-extractor'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import { BadArgument, type PlatformError } from 'effect/PlatformError'
import * as Path from 'effect/Path'
import * as Result from 'effect/Result'

const fixturesFolder = new URL('./', import.meta.url)

const directoryEntry = '<directory>'

export type ExtractionFailure = Extractor.ExtractorError | PlatformError

export type FixtureFailure = ExtractionFailure | BadArgument

export interface FixtureSandbox {
  readonly root: string
  readonly projectRoot: string
}

export interface ExtractionRun {
  readonly stdout: string
  readonly stderr: string
  readonly outcome: Result.Result<Extractor.ExtractionDecision, ExtractionFailure>
}

export interface ReviewObservation {
  readonly projectRoot: string
  readonly configPath: string
  readonly before: Readonly<Record<string, string>>
  readonly after: Readonly<Record<string, string>>
  readonly run: ExtractionRun
}

type FixtureSetup = (sandbox: FixtureSandbox) => Effect.Effect<void, PlatformError, FileSystem.FileSystem | Path.Path>

const sinkInto = (lines: string[]): Extractor.TextWritable => ({
  write: (text) => {
    lines.push(text)
  },
})

export const runExtraction = (
  configPath: string,
  options: Extractor.ExtractorRunOptions = {},
): Effect.Effect<ExtractionRun, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const stdout: string[] = []
    const stderr: string[] = []
    const outcome = yield* Extractor.run({ configFilePath: configPath, options }).pipe(
      Effect.provide(Extractor.layer({ stdout: sinkInto(stdout), stderr: sinkInto(stderr) })),
      Effect.result,
    )
    return { stdout: stdout.join(''), stderr: stderr.join(''), outcome }
  })

export const withFixtureProject = <A, E, R>(
  fixture: string,
  use: (sandbox: FixtureSandbox) => Effect.Effect<A, E, R>,
): Effect.Effect<A, FixtureFailure | E, R | FileSystem.FileSystem | Path.Path> =>
  Effect.scoped(
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const source = yield* path.fromFileUrl(new URL(fixture, fixturesFolder))
      const root = yield* fs.makeTempDirectoryScoped({ prefix: 'api-extractor-fixture-' })
      const projectRoot = path.join(root, 'project')
      yield* fs.copy(source, projectRoot)
      return yield* use({ root, projectRoot })
    }),
  )

export const reviewProject = (
  projectRoot: string,
  configPath: string,
  options: Extractor.ExtractorRunOptions = {},
): Effect.Effect<ReviewObservation, PlatformError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const before = yield* readTree(projectRoot)
    const run = yield* runExtraction(configPath, options)
    const after = yield* readTree(projectRoot)
    return { projectRoot, configPath, before, after, run }
  })

export const reviewFixture = (
  fixture: string,
  options: Extractor.ExtractorRunOptions = {},
  prepare: FixtureSetup = () => Effect.void,
): Effect.Effect<ReviewObservation, FixtureFailure, FileSystem.FileSystem | Path.Path> =>
  withFixtureProject(fixture, (sandbox) =>
    Effect.gen(function*() {
      const path = yield* Path.Path
      yield* prepare(sandbox)
      return yield* reviewProject(
        sandbox.projectRoot,
        path.join(sandbox.projectRoot, 'api-extractor.json'),
        options,
      )
    }))

export const readTree = (
  root: string,
): Effect.Effect<Readonly<Record<string, string>>, PlatformError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const entries = yield* fs.readDirectory(root, { recursive: true })
    const contents = yield* Effect.forEach(entries, (entry) =>
      fs.readFileString(path.join(root, entry)).pipe(
        Effect.map((content): readonly [string, string] => [entry, content]),
        Effect.orElseSucceed((): readonly [string, string] => [entry, directoryEntry]),
      ))
    return Object.fromEntries(contents)
  })

export const changedEntries = (
  before: Readonly<Record<string, string>>,
  after: Readonly<Record<string, string>>,
): readonly string[] =>
  [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((entry) => before[entry] !== after[entry])
    .sort((left, right) => left.localeCompare(right))

export const readFixtureFile = (
  fixture: string,
  relativePath: string,
): Effect.Effect<string, FixtureFailure, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const source = yield* path.fromFileUrl(new URL(fixture, fixturesFolder))
    return yield* fs.readFileString(path.join(source, relativePath))
  })

export const stdoutLines = (run: ExtractionRun): readonly string[] =>
  run.stdout.split('\n').filter((line) => line.length > 0)