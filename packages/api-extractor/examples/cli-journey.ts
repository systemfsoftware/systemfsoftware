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

const DECLARED_JOURNEYS = 22

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

const upstreamBinary = join(
  packageRoot,
  'node_modules',
  '@microsoft',
  'api-extractor',
  'bin',
  'api-extractor',
)

const toolVersionToken = /api-extractor \d+\.\d+\.\d+/g

const normalizedCliText = (text: string, root: string): string =>
  text.split(root).join('<root>').replace(toolVersionToken, 'api-extractor <version>')

const cliSurface = (result: CommandResult, root: string): CommandResult => ({
  stdout: normalizedCliText(result.stdout, root),
  stderr: normalizedCliText(result.stderr, root),
  exitCode: result.exitCode,
})

const renderedText = (text: string): string => `"${text.split('\n').join('\\n')}"`

const stderrFirstLine = (text: string): string => text.split('\n').slice(0, 2).join('\n')

const stdoutFirstLine = (text: string): string => text.split('\n').slice(0, 2).join('\n')

interface CliComparison {
  readonly stderrFirstLineOnly?: boolean
  readonly stdoutFirstLineOnly?: boolean
  readonly exitCodeIgnored?: boolean
  readonly errorOutputPresenceOnly?: boolean
}

const requireSameCliSurface = (
  label: string,
  upstream: CommandResult,
  engine: CommandResult,
  comparison: CliComparison = {},
): Effect.Effect<void, JourneyError> =>
  Effect.gen(function*() {
    const firstLineOnly = comparison.stderrFirstLineOnly === true
    const stdoutFirstLineOnly = comparison.stdoutFirstLineOnly === true
    if (comparison.exitCodeIgnored !== true) {
      yield* requireThat(
        upstream.exitCode === engine.exitCode,
        `${label}: expected exit code ${upstream.exitCode} like upstream, saw ${engine.exitCode}`,
      )
    }
    if (stdoutFirstLineOnly) {
      yield* requireThat(
        stdoutFirstLine(upstream.stdout) === stdoutFirstLine(engine.stdout),
        `${label}: the first lines of standard output differ from upstream\nupstream: ${
          renderedText(stdoutFirstLine(upstream.stdout))
        }\nengine:   ${renderedText(stdoutFirstLine(engine.stdout))}`,
      )
    } else {
      yield* requireThat(
        upstream.stdout === engine.stdout,
        `${label}: standard output differs from upstream\nupstream: ${renderedText(upstream.stdout)}\nengine:   ${
          renderedText(engine.stdout)
        }`,
      )
    }
    yield* requireThat(
      comparison.errorOutputPresenceOnly === true
        ? upstream.stderr.length > 0 && engine.stderr.length > 0
        : firstLineOnly
        ? stderrFirstLine(upstream.stderr) === stderrFirstLine(engine.stderr)
        : upstream.stderr === engine.stderr,
      `${label}: error output differs from upstream\nupstream: ${renderedText(upstream.stderr)}\nengine:   ${
        renderedText(engine.stderr)
      }`,
    )
  })

/** The runtime dependencies the package declares, keyed by name with their version specifiers. */
const RuntimeManifest = Schema.fromJsonString(
  Schema.Struct({ dependencies: Schema.Record(Schema.String, Schema.String) }),
)

const ScratchWorkspace = Schema.fromJsonString(
  Schema.Struct({ overrides: Schema.Record(Schema.String, Schema.String) }),
)

/** Packs the package at `cwd` into its own empty folder and returns the one tarball it wrote. */
const packInto = (
  cwd: string,
  destination: string,
): Effect.Effect<
  string,
  JourneyError | PlatformError.PlatformError | MissingTarball,
  ChildProcessSpawner.ChildProcessSpawner | FileSystem.FileSystem | Path.Path | Scope.Scope
> =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    yield* fs.makeDirectory(destination, { recursive: true })
    yield* requireExitCode(
      `pnpm pack (${cwd})`,
      yield* runCommand(
        'pnpm pack',
        ChildProcess.make('pnpm', ['pack', '--ignore-scripts', '--pack-destination', destination], { cwd }),
      ),
      0,
    )
    const packed = (yield* fs.readDirectory(destination)).filter((entry) => entry.endsWith('.tgz'))
    const tarball = yield* Effect.fromOption(
      Option.fromIterable(packed),
      () => new MissingTarball({ seen: packed.join(', ') }),
    )
    return path.join(destination, tarball)
  })

/**
 * Installs the release set, not a registry mix: every `workspace:` runtime dependency is packed
 * from this checkout too and pinned through the scratch project's `overrides`, so the journey
 * never depends on whether a sibling's bumped version has reached npm yet.
 */
const installedBinaryOf = (
  scratch: string,
): Effect.Effect<
  InstalledBinary,
  JourneyError | PlatformError.PlatformError | MissingTarball | Schema.SchemaError,
  ChildProcessSpawner.ChildProcessSpawner | FileSystem.FileSystem | Path.Path | Scope.Scope
> =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const packDir = path.join(scratch, 'pack')
    const projectDir = path.join(scratch, 'project')
    yield* fs.makeDirectory(projectDir, { recursive: true })

    const tarball = yield* packInto(packageRoot, path.join(packDir, 'self'))
    const manifest = yield* Schema.decodeEffect(RuntimeManifest)(
      yield* fs.readFileString(path.join(packageRoot, 'package.json')),
    )
    const siblings = Object.keys(manifest.dependencies).filter((name) =>
      manifest.dependencies[name]?.startsWith('workspace:') === true
    )
    const overrides = yield* Effect.forEach(siblings, (name, index) =>
      Effect.gen(function*() {
        const siblingRoot = yield* fs.realPath(path.join(packageRoot, 'node_modules', name))
        const siblingTarball = yield* packInto(siblingRoot, path.join(packDir, `sibling-${index}`))
        return [name, `file:${siblingTarball}`] as const
      }))

    yield* fs.writeFileString(
      path.join(projectDir, 'package.json'),
      '{\n  "name": "api-extractor-journey-scratch",\n  "private": true,\n  "version": "1.0.0"\n}\n',
    )
    yield* fs.writeFileString(
      path.join(projectDir, 'pnpm-workspace.yaml'),
      yield* Schema.encodeEffect(ScratchWorkspace)({ overrides: Object.fromEntries(overrides) }),
    )

    yield* requireExitCode(
      'pnpm add',
      yield* runCommand(
        'pnpm add',
        ChildProcess.make('pnpm', ['add', '--ignore-scripts', tarball], { cwd: projectDir }),
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

const upstreamJourneyRun = (
  dir: string,
  args: ReadonlyArray<string>,
): Effect.Effect<
  CommandResult,
  PlatformError.PlatformError | JourneyError,
  ChildProcessSpawner.ChildProcessSpawner | Scope.Scope
> =>
  runCommand(
    `upstream api-extractor ${args.join(' ')}`,
    ChildProcess.make(upstreamBinary, args, { cwd: dir }),
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

const upstreamStoryJourneys: ReadonlyArray<Journey> = [
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

interface MatrixCase {
  readonly name: string
  readonly folder: string
  readonly fixture: string | undefined
  readonly args: ReadonlyArray<string>
  readonly prepare?: (
    directory: string,
  ) => Effect.Effect<void, PlatformError.PlatformError, FileSystem.FileSystem | Path.Path>
  readonly stderrFirstLineOnly?: boolean
  readonly stdoutFirstLineOnly?: boolean
  readonly exitCodeIgnored?: boolean
  readonly errorOutputPresenceOnly?: boolean
}

const driftedReportPaths = [
  'etc/simple-pkg.api.md',
  'etc/simple-pkg.public.api.md',
  'etc/simple-pkg.beta.api.md',
]

const prepareDriftedBaseline = (
  directory: string,
): Effect.Effect<void, PlatformError.PlatformError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    yield* fs.makeDirectory(path.join(directory, 'etc'), { recursive: true })
    yield* Effect.forEach(
      driftedReportPaths,
      (relative) => fs.writeFileString(path.join(directory, relative), '// wrong\n'),
      { discard: true },
    )
  })

const prepareOccupiedConfig = (
  directory: string,
): Effect.Effect<void, PlatformError.PlatformError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    yield* fs.writeFileString(path.join(directory, 'api-extractor.json'), '{}\n')
  })

const prepareConfigText = (
  text: string,
): (directory: string) => Effect.Effect<void, PlatformError.PlatformError, FileSystem.FileSystem | Path.Path> =>
(directory) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    yield* fs.writeFileString(path.join(directory, 'api-extractor.json'), text)
  })

const corpusConfigWith = (overrides: Readonly<Record<string, Schema.Json>>): string =>
  JSON.stringify(
    {
      $schema: 'https://developer.microsoft.com/json-schemas/api-extractor/v7/api-extractor.schema.json',
      mainEntryPointFilePath: '<projectFolder>/lib/index.d.ts',
      compiler: { tsconfigFilePath: '<projectFolder>/tsconfig.json' },
      apiReport: {
        enabled: true,
        reportFileName: 'simple-pkg.api.md',
        reportFolder: '<projectFolder>/etc/',
        reportTempFolder: '<projectFolder>/temp/',
      },
      docModel: { enabled: false },
      dtsRollup: { enabled: false },
      ...overrides,
    },
    null,
    2,
  )

const corpusFixture = 'parity/report-parity/simple-pkg'

const cliMatrix: ReadonlyArray<MatrixCase> = [
  {
    name: 'run --local on a fresh corpus fixture',
    folder: 'local-fresh',
    fixture: corpusFixture,
    args: ['run', '--local', '-c', 'api-extractor.json'],
  },
  {
    name: 'run --local --verbose on a fresh corpus fixture',
    folder: 'local-verbose',
    fixture: corpusFixture,
    args: ['run', '--local', '--verbose', '-c', 'api-extractor.json'],
  },
  {
    name: 'a verification run whose baseline is missing',
    folder: 'verification-missing',
    fixture: corpusFixture,
    args: ['run', '-c', 'api-extractor.json'],
  },
  {
    name: 'a verification run whose baseline drifted',
    folder: 'verification-drifted',
    fixture: corpusFixture,
    args: ['run', '-c', 'api-extractor.json'],
    prepare: prepareDriftedBaseline,
  },
  {
    name: 'a run that auto-locates the configuration',
    folder: 'auto-locate',
    fixture: corpusFixture,
    args: ['run', '--local'],
  },
  {
    name: 'a run whose --config path does not exist',
    folder: 'config-missing',
    fixture: corpusFixture,
    args: ['run', '--local', '-c', 'nope.json'],
  },
  {
    name: 'a refused configuration',
    folder: 'refusal',
    fixture: 'parity/refusal/non-dts-entry-point',
    args: ['run', '--local', '-c', 'api-extractor.json'],
  },
  {
    name: 'a refused configuration under --debug (first stderr line and exit only)',
    folder: 'refusal-debug',
    fixture: 'parity/refusal/non-dts-entry-point',
    args: ['--debug', 'run', '--local', '-c', 'api-extractor.json'],
    stderrFirstLineOnly: true,
  },
  {
    name: 'init in an empty folder',
    folder: 'init-fresh',
    fixture: undefined,
    args: ['init'],
  },
  {
    name: 'init twice in the same folder',
    folder: 'init-occupied',
    fixture: undefined,
    args: ['init'],
    prepare: prepareOccupiedConfig,
  },
  {
    name: 'a run whose entry point file is not on disk',
    folder: 'entry-point-missing',
    fixture: corpusFixture,
    args: ['run', '--local', '-c', 'api-extractor.json'],
    prepare: prepareConfigText(corpusConfigWith({ mainEntryPointFilePath: '<projectFolder>/lib/missing.d.ts' })),
  },
  {
    name: 'a run whose configuration names an unrecognized token',
    folder: 'token-unrecognized',
    fixture: corpusFixture,
    args: ['run', '--local', '-c', 'api-extractor.json'],
    prepare: prepareConfigText(
      corpusConfigWith({
        apiReport: {
          enabled: true,
          reportFileName: 'simple-pkg.api.md',
          reportFolder: 'etc/<bogus>',
        },
      }),
    ),
  },
  {
    name: 'a run whose configuration carries an unknown root key',
    folder: 'schema-unknown-root-key',
    fixture: corpusFixture,
    args: ['run', '--local', '-c', 'api-extractor.json'],
    prepare: prepareConfigText(corpusConfigWith({ nope: 1 })),
  },
  {
    name: 'a run whose configuration carries an unknown section key',
    folder: 'schema-unknown-section-key',
    fixture: corpusFixture,
    args: ['run', '--local', '-c', 'api-extractor.json'],
    prepare: prepareConfigText(
      corpusConfigWith({
        apiReport: { enabled: true, reportFileName: 'simple-pkg.api.md', unknownOption: 1 },
      }),
    ),
  },
  {
    name: 'a run whose configuration gives a section the wrong type',
    folder: 'schema-wrong-type',
    fixture: corpusFixture,
    args: ['run', '--local', '-c', 'api-extractor.json'],
    prepare: prepareConfigText(corpusConfigWith({ compiler: 1 })),
  },
  {
    name: 'a run whose report folder is a plain file',
    folder: 'report-folder-file',
    fixture: corpusFixture,
    args: ['run', '--local', '-c', 'api-extractor.json'],
    prepare: (directory) =>
      Effect.gen(function*() {
        const fs = yield* FileSystem.FileSystem
        const path = yield* Path.Path
        yield* fs.remove(path.join(directory, 'etc'), { recursive: true })
        yield* fs.writeFileString(path.join(directory, 'etc'), 'not a folder\n')
      }),
  },
  {
    name: 'the root command explains itself (banner and exit code; the help body comes from the CLI framework)',
    folder: 'help-root',
    fixture: undefined,
    args: ['--help'],
    stdoutFirstLineOnly: true,
  },
  {
    name:
      'an unrecognized flag reports the banner, a parse failure, and upstream exit code 2 (banner and code; the wording comes from the CLI framework)',
    folder: 'unknown-flag',
    fixture: undefined,
    args: ['run', '--bogus'],
    stdoutFirstLineOnly: true,
    errorOutputPresenceOnly: true,
  },
  {
    name: 'a run whose report temp folder is a plain file',
    folder: 'report-temp-file',
    fixture: corpusFixture,
    args: ['run', '--local', '-c', 'api-extractor.json'],
    prepare: (directory) =>
      Effect.gen(function*() {
        const fs = yield* FileSystem.FileSystem
        const path = yield* Path.Path
        yield* fs.writeFileString(path.join(directory, 'temp'), 'not a folder\n')
      }),
  },
]

const matrixDirectory = (
  installed: InstalledBinary,
  testCase: MatrixCase,
  side: string,
): Effect.Effect<
  string,
  PlatformError.PlatformError,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const folder = `${testCase.folder}-${side}`
    const directory = testCase.fixture === undefined
      ? path.join(installed.scratch, folder)
      : yield* fixtureInto(installed, testCase.fixture, folder)
    yield* fs.makeDirectory(directory, { recursive: true })
    if (testCase.prepare !== undefined) {
      yield* testCase.prepare(directory)
    }
    return directory
  })

const matrixJourneyOf = (ordinal: number, testCase: MatrixCase): Journey => ({
  name: `J${ordinal}: the installed binary reports like upstream — ${testCase.name}`,
  run: (installed) =>
    Effect.gen(function*() {
      const upstreamDir = yield* matrixDirectory(installed, testCase, 'upstream')
      const engineDir = yield* matrixDirectory(installed, testCase, 'engine')
      const upstream = yield* upstreamJourneyRun(upstreamDir, testCase.args)
      const engine = yield* journeyRun(installed, testCase.args, engineDir)
      const comparison: CliComparison = {
        ...(testCase.stderrFirstLineOnly === true ? { stderrFirstLineOnly: true } : {}),
        ...(testCase.stdoutFirstLineOnly === true ? { stdoutFirstLineOnly: true } : {}),
        ...(testCase.exitCodeIgnored === true ? { exitCodeIgnored: true } : {}),
        ...(testCase.errorOutputPresenceOnly === true ? { errorOutputPresenceOnly: true } : {}),
      }
      yield* requireSameCliSurface(
        testCase.name,
        cliSurface(upstream, upstreamDir),
        cliSurface(engine, engineDir),
        comparison,
      )
    }),
})

const matrixJourneys: ReadonlyArray<Journey> = cliMatrix.map((testCase, offset) =>
  matrixJourneyOf(offset + 4, testCase)
)

const journeys: ReadonlyArray<Journey> = [...upstreamStoryJourneys, ...matrixJourneys]

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
  return scratch
})

const journeyAndTeardown = Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem
  const scratch = yield* Effect.scoped(program)
  const survivedTheScope = yield* fs.exists(scratch)
  yield* requireThat(
    !survivedTheScope,
    `the scoped scratch directory ${scratch} must be gone once its scope closes`,
  )
  yield* Effect.logInfo('[smoke] the scoped scratch directory was gone once its scope closed')
})

NodeRuntime.runMain(Effect.provide(journeyAndTeardown, nodeServicesLayer))
