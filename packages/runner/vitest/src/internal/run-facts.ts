/** @internal Facts only: the runner's `PropertyConfig` and budget decide from them. */
import { Context, Duration, Effect, Option, Schema, Stream } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import * as Path from 'effect/Path'
import { ChildProcess, ChildProcessSpawner } from 'effect/process'
import { PropertyConfig } from '../config.js'
import { HexCommitSha } from './property/budget.schema.js'

/** @internal */
export class GitHead extends Context.Service<GitHead, {
  readonly commitIn: (directory: string) => Effect.Effect<Option.Option<string>>
}>()('@systemfsoftware/vitest/GitHead') {}

const GIT_TIMEOUT = Duration.seconds(2)

const commitOfOutput = (stdout: string, exitCode: number): Option.Option<string> =>
  exitCode === 0 ? Schema.decodeOption(HexCommitSha)(stdout.trim()) : Option.none()

/** @internal */
export const gitRevParseHead = (
  directory: string,
): Effect.Effect<Option.Option<string>, never, ChildProcessSpawner.ChildProcessSpawner> =>
  Effect.gen(function*() {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
    const handle = yield* spawner.spawn(ChildProcess.make({ cwd: directory })`git rev-parse HEAD`)
    const [stdout, exitCode] = yield* Effect.all(
      [Stream.mkString(Stream.decodeText(handle.stdout)), handle.exitCode],
      { concurrency: 'unbounded' },
    )
    return commitOfOutput(stdout, exitCode)
  }).pipe(
    Effect.scoped,
    Effect.timeout(GIT_TIMEOUT),
    Effect.orElseSucceed(() => Option.none<string>()),
  )

/** @internal */
export interface ProjectFacts {
  readonly root: string
  readonly configFile: string | undefined
}

/** @internal */
export interface PublishedFacts {
  readonly commit: Option.Option<string>
  readonly configFile: Option.Option<string>
  readonly packageRoot: Option.Option<string>
  readonly workspaceRoot: Option.Option<string>
}

const nearestHolding = (marker: string, start: string) =>
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const holds = (directory: string) =>
      fileSystem.exists(path.join(directory, marker)).pipe(Effect.orElseSucceed(() => false))
    const climb = (directory: string): Effect.Effect<Option.Option<string>> =>
      Effect.flatMap(holds(directory), (found) => found ? Effect.succeedSome(directory) : up(directory))
    const up = (directory: string): Effect.Effect<Option.Option<string>> => {
      const parent = path.dirname(directory)
      return parent === directory ? Effect.succeedNone : climb(parent)
    }
    return yield* climb(start)
  })

const commitOf = (root: string) =>
  Effect.gen(function*() {
    const settings = yield* PropertyConfig
    const git = yield* GitHead
    return Option.isSome(settings.commit) ? settings.commit : yield* git.commitIn(root)
  })

/** @internal */
export const publishedFactsOf = (project: ProjectFacts) =>
  Effect.gen(function*() {
    const path = yield* Path.Path
    const configDirectory = project.configFile === undefined ? project.root : path.dirname(project.configFile)
    return {
      commit: yield* commitOf(project.root),
      configFile: Option.fromUndefinedOr(project.configFile),
      packageRoot: yield* nearestHolding('package.json', configDirectory),
      workspaceRoot: yield* nearestHolding('pnpm-workspace.yaml', project.root),
    } satisfies PublishedFacts
  })
