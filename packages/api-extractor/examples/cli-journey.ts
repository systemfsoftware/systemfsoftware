import { NodeRuntime } from '@effect/platform-node'
import { layer as nodeServicesLayer } from '@effect/platform-node/NodeServices'
import { Effect, Option, Ref, Schema, Scope, Stream } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import * as Path from 'effect/Path'
import type * as PlatformError from 'effect/PlatformError'
import { ChildProcess, ChildProcessSpawner } from 'effect/unstable/process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Packed-install journeys for the `api-extractor` binary (R29, AE1, AE2).
 *
 * The script packs this package with lifecycle scripts disabled, installs the tarball into a
 * scratch project outside the workspace, and drives the installed `api-extractor` bin over temp
 * copies of the committed fixtures. Every journey runs or the script fails: a failed install is a
 * journey failure, never a skip, and the script refuses to succeed when it ran fewer journeys than
 * it declares.
 */

const DECLARED_JOURNEYS = 3

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))

const fixturePath = (name: string): string => join(packageRoot, 'tests', '__fixtures__', name)

class JourneyError extends Schema.TaggedError<JourneyError>()('JourneyError', {
  message: Schema.String,
}) {}

class MissingTarball extends Schema.TaggedError<MissingTarball>()('MissingTarball', {
  seen: Schema.String,
}) {}

interface CommandResult {
  readonly stdout: string
  readonly stderr: string
  readonly exitCode: number
}

interface InstalledBinary {
  readonly bin: string
  readonly scratch: string
}

const collectText = (
  stream: Stream.Stream<Uint8Array, PlatformError.PlatformError>,
): Effect.Effect<string, PlatformError.PlatformError> => Stream.mkString(Stream.decodeText(stream))

const commandDeadline = '5 minutes'

const runCommand = (
  label: string,
  command: ChildProcess.Command,
): Effect.Effect<
  CommandResult,
  PlatformError.PlatformError | JourneyError,
  ChildProcessSpawner.ChildProcessSpawner | Scope.Scope
> =>
  Effect.gen(function*() {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
    const handle = yield* spawner.spawn(command)
    const [stdout, stderr, exitCode] = yield* Effect.all(
      [collectText(handle.stdout), collectText(handle.stderr), handle.exitCode],
      { concurrency: 'unbounded' },
    )
    return { stdout, stderr, exitCode }
  }).pipe(
    Effect.timeoutOrElse({
      duration: commandDeadline,
      orElse: () => Effect.fail(new JourneyError({ message: `${label}: no exit within ${commandDeadline}` })),
    }),
  )

const requireThat = (holds: boolean, message: string): Effect.Effect<void, JourneyError> =>
  holds ? Effect.void : Effect.fail(new JourneyError({ message }))

const requireExitCode = (
  label: string,
  result: CommandResult,
  expected: number,
): Effect.Effect<void, JourneyError> =>
  requireThat(
    result.exitCode === expected,
    `${label}: expected exit code ${expected}, saw ${result.exitCode}`,
  )

const requireOutputContains = (
  label: string,
  text: string,
  needle: string,
): Effect.Effect<void, JourneyError> =>
  requireThat(
    text.includes(needle),
    `${label}: expected the output to contain "${needle}", saw "${text}"`,
  )

const requireOutputExcludes = (
  label: string,
  text: string,
  needle: string,
): Effect.Effect<void, JourneyError> =>
  requireThat(
    !text.includes(needle),
    `${label}: expected the output to exclude "${needle}", saw "${text}"`,
  )

const requireNoOutput = (label: string, text: string): Effect.Effect<void, JourneyError> =>
  requireThat(text === '', `${label}: expected no output, saw "${text}"`)

const installedBinaryOf = (
  scratch: string,
): Effect.Effect<
  InstalledBinary,
  JourneyError | PlatformError.PlatformError | MissingTarball,
  ChildProcessSpawner.ChildProcessSpawner | FileSystem.FileSystem | Path.Path | Scope.Scope
> =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const packDir = path.join(scratch, 'pack')
    const projectDir = path.join(scratch, 'project')
    yield* fs.makeDirectory(packDir, { recursive: true })
    yield* fs.makeDirectory(projectDir, { recursive: true })

    yield* requireExitCode(
      'pnpm pack',
      yield* runCommand(
        'pnpm pack',
        ChildProcess.make('pnpm', ['pack', '--ignore-scripts', '--pack-destination', packDir], {
          cwd: packageRoot,
        }),
      ),
      0,
    )

    const packed = (yield* fs.readDirectory(packDir)).filter((entry) => entry.endsWith('.tgz'))
    const tarball = yield* Effect.fromOption(
      Option.fromIterable(packed),
      () => new MissingTarball({ seen: packed.join(', ') }),
    )

    yield* fs.writeFileString(
      path.join(projectDir, 'package.json'),
      '{\n  "name": "api-extractor-journey-scratch",\n  "private": true,\n  "version": "1.0.0"\n}\n',
    )

    yield* requireExitCode(
      'pnpm add',
      yield* runCommand(
        'pnpm add',
        ChildProcess.make('pnpm', ['add', '--ignore-scripts', path.join(packDir, tarball)], {
          cwd: projectDir,
        }),
      ),
      0,
    )

    const bin = path.join(projectDir, 'node_modules', '.bin', 'api-extractor')
    yield* requireThat(yield* fs.exists(bin), 'the installed tarball must expose an api-extractor bin')
    return { bin, scratch }
  })

const journeyRun = (
  installed: InstalledBinary,
  args: ReadonlyArray<string>,
  cwd: string,
): Effect.Effect<
  CommandResult,
  PlatformError.PlatformError | JourneyError,
  ChildProcessSpawner.ChildProcessSpawner | Scope.Scope
> =>
  runCommand(
    `api-extractor ${args.join(' ')}`,
    ChildProcess.make(installed.bin, args, { cwd }),
  )

const fixtureInto = (
  installed: InstalledBinary,
  name: string,
  folder: string,
): Effect.Effect<
  string,
  PlatformError.PlatformError,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const destination = path.join(installed.scratch, folder)
    yield* fs.copy(fixturePath(name), destination)
    return destination
  })

interface Journey {
  readonly name: string
  readonly run: (
    installed: InstalledBinary,
  ) => Effect.Effect<
    void,
    JourneyError | PlatformError.PlatformError,
    ChildProcessSpawner.ChildProcessSpawner | FileSystem.FileSystem | Path.Path | Scope.Scope
  >
}

const journeys: ReadonlyArray<Journey> = [
  {
    name: 'J1: the installed binary explains itself and exits 0',
    run: (installed) =>
      Effect.gen(function*() {
        const helped = yield* journeyRun(installed, ['--help'], installed.scratch)
        yield* requireExitCode('api-extractor --help', helped, 0)
        yield* requireOutputContains(
          'api-extractor --help',
          `${helped.stdout}${helped.stderr}`,
          'api-extractor',
        )
      }),
  },
  {
    name: 'J2: a clean quiet run prints nothing and exits 0',
    run: (installed) =>
      Effect.gen(function*() {
        const path = yield* Path.Path
        const cleanDir = yield* fixtureInto(installed, 'flow/simple-pkg', 'clean')
        const run = yield* journeyRun(
          installed,
          ['run', '--config', path.join(cleanDir, 'api-extractor.json'), '--quiet'],
          cleanDir,
        )
        yield* requireExitCode('api-extractor run --quiet on a clean package', run, 0)
        yield* requireNoOutput('a clean quiet run on standard output', run.stdout)
        yield* requireNoOutput('a clean quiet run on the error stream', run.stderr)
      }),
  },
  {
    name: 'J3: a drifted baseline warns and exits non-zero',
    run: (installed) =>
      Effect.gen(function*() {
        const path = yield* Path.Path
        const driftedDir = yield* fixtureInto(installed, 'flow/simple-pkg-drifted', 'drifted')
        const run = yield* journeyRun(
          installed,
          ['run', '--config', path.join(driftedDir, 'api-extractor.json'), '--quiet'],
          driftedDir,
        )
        yield* requireExitCode('a drifted verification run', run, 1)
        yield* requireOutputContains(
          'the out-of-date warning',
          run.stderr,
          'You have changed the API signature for this project.',
        )
        yield* requireOutputExcludes(
          'the out-of-date warning must not reach standard output',
          run.stdout,
          'You have changed the API signature for this project.',
        )
      }),
  },
]

const program = Effect.gen(function*() {
  yield* requireThat(
    journeys.length === DECLARED_JOURNEYS,
    `the journey script declares ${DECLARED_JOURNEYS} journeys but defines ${journeys.length}`,
  )
  const fs = yield* FileSystem.FileSystem
  const scratch = yield* fs.makeTempDirectoryScoped({ prefix: 'api-extractor-journey-' })
  const installed = yield* installedBinaryOf(scratch)
  const ran = yield* Ref.make(0)
  yield* Effect.forEach(
    journeys,
    (journey) =>
      Effect.gen(function*() {
        yield* Effect.logInfo(`[smoke] ${journey.name}`)
        yield* journey.run(installed)
        yield* Ref.update(ran, (count) => count + 1)
      }),
    { discard: true },
  )
  const count = yield* Ref.get(ran)
  yield* requireThat(
    count === DECLARED_JOURNEYS,
    `the journey script declares ${DECLARED_JOURNEYS} journeys but ran ${count}`,
  )
  yield* Effect.logInfo(`[smoke] ran ${count} of ${DECLARED_JOURNEYS} installed-binary journeys`)
})

NodeRuntime.runMain(Effect.provide(Effect.scoped(program), nodeServicesLayer))
