import * as Config from 'effect/Config'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Option from 'effect/Option'
import * as Path from 'effect/Path'
import { ChildProcess, ChildProcessSpawner } from 'effect/process'
import * as Schema from 'effect/Schema'
import * as Stream from 'effect/Stream'

const PACKAGE_ROOT = decodeURIComponent(new URL('../..', import.meta.url).pathname).replace(/\/$/u, '')

/** The built bin, the artifact the package ships (CONST-T8). */
export const BIN = `${PACKAGE_ROOT}/dist/bin.mjs`

export const OXLINT = `${PACKAGE_ROOT}/node_modules/.bin/oxlint`

/** Suites whose files a test imports live under the package, so their imports resolve to its dependencies. */
const SCRATCH = `${PACKAGE_ROOT}/.scratch`

export const ARROW_DOWN = '\u001B[B'

export const tempRoot = Effect.flatMap(
  FileSystem.FileSystem,
  (fs) => fs.makeTempDirectoryScoped({ prefix: 'effect-e2e-init-' }),
)

export const scratchRoot = Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem
  yield* fs.makeDirectory(SCRATCH, { recursive: true })
  return yield* fs.makeTempDirectoryScoped({ directory: SCRATCH, prefix: 'suite-' })
})

export interface BinRun {
  readonly exitCode: number
  readonly output: string
}

export interface BinRequest {
  readonly args: ReadonlyArray<string>
  readonly cwd: string
  /** The executable to run; the built `effect-e2e` bin when omitted. */
  readonly command?: string
  /** Keystrokes written to the bin's stdin, for its prompts. */
  readonly input?: string
  /** Directories searched before the inherited PATH, for a stand-in package manager. */
  readonly pathPrefix?: string
  readonly env?: Readonly<Record<string, string>>
}

const stdinOf = (input: string | undefined) =>
  Option.match(Option.fromNullishOr(input), {
    onNone: () => 'ignore' as const,
    onSome: (keys) => Stream.make(new TextEncoder().encode(keys)),
  })

/** Runs a binary as a child process with only PATH and HOME from the environment, and collects its output. */
export const runBin = (request: BinRequest) =>
  Effect.scoped(
    Effect.gen(function*() {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
      const inherited = yield* Config.String('PATH')
      const home = yield* Config.String('HOME')
      const handle = yield* spawner.spawn(
        ChildProcess.make(request.command ?? BIN, [...request.args], {
          cwd: request.cwd,
          env: {
            PATH: Option.match(Option.fromNullishOr(request.pathPrefix), {
              onNone: () => inherited,
              onSome: (prefix) => `${prefix}:${inherited}`,
            }),
            HOME: home,
            ...request.env,
          },
          extendEnv: false,
          stdin: stdinOf(request.input),
        }),
      )
      const [output, exitCode] = yield* Effect.all(
        [handle.all.pipe(Stream.decodeText, Stream.mkString), handle.exitCode],
        { concurrency: 2 },
      )
      return { exitCode: Number(exitCode), output } satisfies BinRun
    }),
  )

// Runs in a plain Node process, as the suite's own edge does before Vitest starts workers: Vite reserves BASE_URL
// inside a Vitest worker, so importing the config here would read '/' instead of the given URL.
const DECODE_CONFIG = `
import { decodeConfig } from '@systemfsoftware/effect-e2e'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'

const [file, extraKey] = process.argv.slice(1)
// The suite file is named at run time.
const exported = (await import(file)).default
const config = extraKey === undefined ? exported : { ...exported, [extraKey]: 2 }
const exit = await Effect.runPromiseExit(decodeConfig(config, { ci: false, projectId: 'from-defaults', cores: 1 }))
const failure = Exit.isFailure(exit) ? exit.cause.reasons.find((reason) => reason._tag === 'Fail')?.error : undefined
console.log(JSON.stringify(Exit.isSuccess(exit)
  ? { _tag: 'Decoded', config: exit.value }
  : { _tag: 'Refused', refusal: { tag: failure?._tag ?? 'defect', path: failure?.path ?? [] } }))
`

const DecodedConfig = Schema.Struct({
  projectId: Schema.String,
  targets: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      engine: Schema.Struct({ adapter: Schema.String }),
      app: Schema.Struct({ url: Schema.String }),
    }),
  ),
  agents: Schema.Record(
    Schema.String,
    Schema.Struct({ model: Schema.Struct({ gateway: Schema.String, apiKeyEnv: Schema.String }) }),
  ),
})

const DecodeOutcome = Schema.fromJsonString(
  Schema.Union([
    Schema.TaggedStruct('Decoded', { config: DecodedConfig }),
    Schema.TaggedStruct('Refused', {
      refusal: Schema.Struct({ tag: Schema.String, path: Schema.Array(Schema.Union([Schema.String, Schema.Int])) }),
    }),
  ]),
)

export interface DecodeRequest {
  readonly suite: string
  readonly baseUrl: string
  /** A top-level key added to the exported config before decoding, as a typo would add one. */
  readonly extraKey?: string
}

/** Imports the suite's `e2e.config.ts` with `BASE_URL` set and decodes its default export with the framework. */
export const decodeSuiteConfig = (request: DecodeRequest) =>
  runBin({
    cwd: request.suite,
    command: 'node',
    args: [
      '--input-type=module',
      '--eval',
      DECODE_CONFIG,
      `${request.suite}/e2e.config.ts`,
      ...(request.extraKey === undefined ? [] : [request.extraKey]),
    ],
    env: { BASE_URL: request.baseUrl },
  }).pipe(Effect.flatMap(({ output }) => Schema.decodeEffect(DecodeOutcome)(output.trim())))

/** Every file under `root`, as sorted root-relative paths. */
export const filesUnder = (root: string) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const entries = yield* fs.readDirectory(root, { recursive: true })
    const files = yield* Effect.filter(entries, (entry) =>
      Effect.map(fs.stat(path.join(root, entry)), (info) => info.type === 'File'))
    return files.toSorted()
  })

/** Each file under `root` with its content and modification time, to prove a refusal changed nothing. */
export const stateUnder = (root: string) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const files = yield* filesUnder(root)
    return yield* Effect.forEach(files, (file) =>
      Effect.all({
        file: Effect.succeed(file),
        content: fs.readFileString(path.join(root, file)),
        modified: Effect.map(
          fs.stat(path.join(root, file)),
          (info) => Option.map(info.mtime, (time) => time.getTime()),
        ),
      }))
  })

export const readText = (file: string) => Effect.flatMap(FileSystem.FileSystem, (fs) => fs.readFileString(file))

export const writeText = ({ file, content }: { readonly file: string; readonly content: string }) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    yield* fs.makeDirectory(path.dirname(file), { recursive: true })
    yield* fs.writeFileString(file, content)
  })

const Invocation = Schema.fromJsonString(Schema.Struct({ argv: Schema.Array(Schema.String), cwd: Schema.String }))

const RECORDING_NPM = `#!/usr/bin/env node
require('fs').appendFileSync(__dirname + '/calls.jsonl', JSON.stringify({ argv: process.argv.slice(2), cwd: process.cwd() }) + '\\n')
`

export const recordingNpm = (bin: string) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    yield* writeText({ file: `${bin}/npm`, content: RECORDING_NPM })
    yield* fs.chmod(`${bin}/npm`, 0o755)
  })

export const npmCallsIn = (bin: string) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const log = `${bin}/calls.jsonl`
    const text = yield* Effect.flatMap(fs.exists(log), (exists) => (exists ? readText(log) : Effect.succeed('')))
    return yield* Effect.forEach(
      text.split('\n').filter((line) => line !== ''),
      (line) => Schema.decodeEffect(Invocation)(line),
    )
  })

/** The suite-relevant part of a `package.json`, read as the published file a consumer sees. */
export const manifestAt = (file: string) =>
  Effect.flatMap(
    readText(file),
    Schema.decodeEffect(
      Schema.fromJsonString(
        Schema.Struct({
          scripts: Schema.Record(Schema.String, Schema.String),
          devDependencies: Schema.Record(Schema.String, Schema.String),
        }),
      ),
    ),
  )

/** The ranges this CLI release declares, the spec's source for a generated suite's dev dependencies (design §15.1). */
export const declaredRanges = Effect.map(
  readText(`${PACKAGE_ROOT}/package.json`).pipe(
    Effect.flatMap(
      Schema.decodeEffect(
        Schema.fromJsonString(
          Schema.Struct({
            dependencies: Schema.Record(Schema.String, Schema.String),
            peerDependencies: Schema.Record(Schema.String, Schema.String),
          }),
        ),
      ),
    ),
  ),
  ({ dependencies, peerDependencies }) => ({ ...peerDependencies, ...dependencies }),
)
