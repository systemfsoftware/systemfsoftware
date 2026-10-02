import { Extractor } from '@systemfsoftware/api-extractor'
import * as Arr from 'effect/Array'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Order from 'effect/Order'
import type { BadArgument, PlatformError } from 'effect/PlatformError'
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

export interface ExtractionRequest {
  readonly configPath: string
  readonly options?: Extractor.ExtractorRunOptions
}

export interface ProjectReviewRequest {
  readonly projectRoot: string
  readonly configPath: string
  readonly options?: Extractor.ExtractorRunOptions
}

export interface FixtureReviewRequest {
  readonly fixture: string
  readonly options?: Extractor.ExtractorRunOptions
  readonly prepare?: FixtureSetup
}

export interface FixtureProjectRequest<A, E, R> {
  readonly fixture: string
  readonly use: (sandbox: FixtureSandbox) => Effect.Effect<A, E, R>
}

export interface FixtureFileRequest {
  readonly fixture: string
  readonly relativePath: string
}

export interface TreeComparison {
  readonly before: Readonly<Record<string, string>>
  readonly after: Readonly<Record<string, string>>
}

type FixtureSetup = (sandbox: FixtureSandbox) => Effect.Effect<void, PlatformError, FileSystem.FileSystem | Path.Path>

export const sinkInto = (lines: string[]): Extractor.TextWritable => ({
  write: (text) => {
    lines.push(text)
  },
})

export const failureOf = <A, E>(outcome: Result.Result<A, E>): E | undefined =>
  Result.isFailure(outcome) ? outcome.failure : undefined

export const runExtraction = (
  { configPath, options = {} }: ExtractionRequest,
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
  { fixture, use }: FixtureProjectRequest<A, E, R>,
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
  { projectRoot, configPath, options = {} }: ProjectReviewRequest,
): Effect.Effect<ReviewObservation, PlatformError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const before = yield* readTree(projectRoot)
    const run = yield* runExtraction({ configPath, options })
    const after = yield* readTree(projectRoot)
    return { projectRoot, configPath, before, after, run }
  })

export const reviewFixture = (
  { fixture, options = {}, prepare = () => Effect.void }: FixtureReviewRequest,
): Effect.Effect<ReviewObservation, FixtureFailure, FileSystem.FileSystem | Path.Path> =>
  withFixtureProject({
    fixture,
    use: (sandbox) =>
      Effect.gen(function*() {
        const path = yield* Path.Path
        yield* prepare(sandbox)
        return yield* reviewProject({
          projectRoot: sandbox.projectRoot,
          configPath: path.join(sandbox.projectRoot, 'api-extractor.json'),
          options,
        })
      }),
  })

const readTree = (
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
  { before, after }: TreeComparison,
): readonly string[] =>
  Arr.sort(
    Arr.filter(
      Arr.dedupe([...Object.keys(before), ...Object.keys(after)]),
      (entry) => before[entry] !== after[entry],
    ),
    Order.String,
  )

export const writtenFiles = ({ before, after }: TreeComparison): readonly string[] =>
  changedEntries({ before, after }).filter((entry) => after[entry] !== directoryEntry)

export const readFixtureFile = (
  { fixture, relativePath }: FixtureFileRequest,
): Effect.Effect<string, FixtureFailure, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const source = yield* path.fromFileUrl(new URL(fixture, fixturesFolder))
    return yield* fs.readFileString(path.join(source, relativePath))
  })

export const stdoutLines = (run: ExtractionRun): readonly string[] =>
  run.stdout.split('\n').filter((line) => line.length > 0)

export interface FixtureTeardown {
  readonly projectRootWasPresentInsideTheScope: boolean
  readonly rootIsPresentAfterTheScopeClosed: boolean
  readonly projectRootIsPresentAfterTheScopeClosed: boolean
}

export const observeFixtureTeardown = (
  fixture: string,
): Effect.Effect<FixtureTeardown, FixtureFailure, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const observed = yield* withFixtureProject({
      fixture,
      use: (sandbox) =>
        Effect.gen(function*() {
          const presentInsideTheScope = yield* fs.exists(sandbox.projectRoot)
          return { sandbox, presentInsideTheScope }
        }),
    })
    const rootIsPresent = yield* fs.exists(observed.sandbox.root)
    const projectRootIsPresent = yield* fs.exists(observed.sandbox.projectRoot)
    return {
      projectRootWasPresentInsideTheScope: observed.presentInsideTheScope,
      rootIsPresentAfterTheScopeClosed: rootIsPresent,
      projectRootIsPresentAfterTheScopeClosed: projectRootIsPresent,
    }
  })
