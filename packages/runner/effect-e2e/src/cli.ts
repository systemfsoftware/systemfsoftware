import { Effect, FileSystem, Match, Path } from 'effect'
import { dual } from 'effect/Function'
import * as Option from 'effect/Option'
import { ChildProcess, ChildProcessSpawner } from 'effect/process'
import * as Result from 'effect/Result'
import { decodeConfig, gatewayApiKeyEnv, testGlobsOf } from './config.js'
import { ConfigInvalid } from './config.schema.js'
import type { E2eConfig } from './config.schema.js'
import { engineKind } from './engine.schema.js'
import { CollectionFailed, InstallFailed, RunnerDefect, SuiteExists } from './errors.schema.js'
import { exitCode, ExitInternalError } from './exit-code.workflow.js'
import { layer as suiteFsLayer } from './platform-suite-fs.js'
import type { Report } from './report.schema.js'
import { initSuite } from './scaffold.js'
import type { InitOptions } from './scaffold.js'
import { selectFiles } from './select-files.workflow.js'
import { SuiteFs } from './suite-fs.service.js'
import { suiteRun } from './suite-run.cell.js'
import type { SuiteRunFailure } from './suite-run.cell.js'

export interface CliEnv {
  readonly env: Record<string, string | undefined>
  readonly interrupted: () => boolean
}

export type CliServices = FileSystem.FileSystem | Path.Path | ChildProcessSpawner.ChildProcessSpawner

export type CliFailure = SuiteRunFailure | SuiteExists | InstallFailed | ConfigInvalid

const USAGE = `effect-e2e init --dir <suite> --engine web --gateway openrouter [--model <id>] [--force] [--no-install]
effect-e2e run --dir <suite>`

const VALUE_FLAGS: Record<string, true> = { dir: true, engine: true, gateway: true, model: true }

type Parsed =
  | { readonly command: 'init'; readonly dir: string; readonly options: InitOptions; readonly install: boolean }
  | { readonly command: 'run'; readonly dir: string }
  | { readonly command: 'usage'; readonly message: string }

const tokenize = (args: ReadonlyArray<string>) => {
  const positional: Array<string> = []
  const flags: Record<string, string | true> = {}
  let pending: string | undefined
  for (const arg of args) {
    if (pending !== undefined) {
      flags[pending] = arg
      pending = undefined
    } else if (arg.startsWith('--') && VALUE_FLAGS[arg.slice(2)] !== undefined) {
      pending = arg.slice(2)
    } else if (arg.startsWith('--')) {
      flags[arg.slice(2)] = true
    } else {
      positional.push(arg)
    }
  }
  return { positional, flags }
}

const parseArgs = (args: ReadonlyArray<string>): Parsed => {
  const { positional, flags } = tokenize(args)
  const command = positional[0]
  const dir = flags['dir']
  if (command !== 'init' && command !== 'run') {
    return { command: 'usage', message: `unknown command ${command ?? '(none)'}` }
  }
  if (typeof dir !== 'string' || dir.length === 0) {
    return { command: 'usage', message: '--dir <suite> is required' }
  }
  if (command === 'run') {
    return { command: 'run', dir }
  }
  const engine = flags['engine']
  const gateway = flags['gateway']
  if (engine !== 'web') {
    return { command: 'usage', message: `--engine must be web, got ${String(engine ?? '(none)')}` }
  }
  if (gateway !== 'openrouter' && gateway !== 'openai-compatible' && gateway !== 'none') {
    return {
      command: 'usage',
      message: `--gateway must be openrouter, openai-compatible or none, got ${String(gateway ?? '(none)')}`,
    }
  }
  const model = flags['model']
  return {
    command: 'init',
    dir,
    options: {
      engine,
      gateway,
      ...(typeof model === 'string' ? { model } : {}),
      force: flags['force'] === true,
    },
    install: flags['no-install'] !== true,
  }
}

const exitCodeOf = (status: Report['status']): number =>
  Result.getOrElse(
    exitCode({ _tag: 'DecideExitCode', status }),
    () => new ExitInternalError({ code: 4 }),
  ).code

const installCommand = (dir: string): Effect.Effect<ChildProcess.StandardCommand, never, SuiteFs> =>
  Effect.gen(function*() {
    const fs = yield* SuiteFs
    const manager = (yield* fs.exists('pnpm-lock.yaml')) ? 'pnpm' : (yield* fs.exists('yarn.lock')) ? 'yarn' : 'npm'
    return ChildProcess.make(manager, ['install'], { cwd: dir, stdin: 'inherit', stdout: 'inherit', stderr: 'inherit' })
  })

const runInstall = (
  dir: string,
): Effect.Effect<void, InstallFailed, SuiteFs | ChildProcessSpawner.ChildProcessSpawner> =>
  Effect.gen(function*() {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
    const command = yield* installCommand(dir)
    const code = yield* Effect.mapError(
      spawner.exitCode(command),
      (error) => new InstallFailed({ message: `${command.command} install: ${error.message}` }),
    )
    if (code !== 0) {
      return yield* new InstallFailed({ message: `${command.command} install exited with status ${String(code)}` })
    }
  })

const gatewayStateOf = (config: E2eConfig, env: Record<string, string | undefined>) => {
  const apiKeyEnv = gatewayApiKeyEnv(config)
  const configured = config.agents !== undefined && config.agents.default.model.gateway !== 'none'
  return {
    configured,
    ...(apiKeyEnv !== undefined ? { apiKeyEnv } : {}),
    keyPresent: apiKeyEnv !== undefined && env[apiKeyEnv] !== undefined,
  }
}

const loadConfig: Effect.Effect<E2eConfig, CliFailure, SuiteFs> = Effect.gen(function*() {
  const fs = yield* SuiteFs
  const module = yield* fs.importModule('e2e.config.ts')
  if (!('default' in module)) {
    return yield* new ConfigInvalid({ message: 'e2e.config.ts has no default export' })
  }
  return yield* decodeConfig(module.default)
})

const selectedFiles = (config: E2eConfig): Effect.Effect<ReadonlyArray<string>, CliFailure, SuiteFs> =>
  Effect.gen(function*() {
    const fs = yield* SuiteFs
    const candidates = yield* fs.listFiles
    const selection = yield* Effect.fromResult(selectFiles({
      _tag: 'SelectTestFiles',
      patterns: [...testGlobsOf(config)],
      candidates: [...candidates],
    }))
    return yield* Match.valueTags(selection, {
      FilesSelected: (selected) => Effect.succeed<ReadonlyArray<string>>(selected.files),
      NoFilesMatched: (missed) =>
        Effect.fail(new CollectionFailed({ message: `no test files matched ${missed.patterns.join(', ')}` })),
    })
  })

const platformOf = (config: E2eConfig): string =>
  Option.match(Option.fromIterable(config.targets), {
    onSome: (target) => engineKind(target.engine),
    onNone: () => 'none',
  })

const initProgram = (
  parsed: Extract<Parsed, { command: 'init' }>,
): Effect.Effect<number, CliFailure, SuiteFs | ChildProcessSpawner.ChildProcessSpawner> =>
  Effect.gen(function*() {
    const written = yield* initSuite(parsed.dir, parsed.options)
    for (const file of written) {
      process.stdout.write(`wrote ${parsed.dir}/${file}\n`)
    }
    if (parsed.install) {
      yield* runInstall(parsed.dir)
    }
    return 0
  })

const runProgram = (
  parsed: Extract<Parsed, { command: 'run' }>,
  env: CliEnv,
): Effect.Effect<number, CliFailure, SuiteFs> =>
  Effect.gen(function*() {
    const config = yield* loadConfig
    const files = yield* selectedFiles(config)
    const answer = yield* suiteRun.run({
      config,
      files,
      platform: platformOf(config),
      gateway: gatewayStateOf(config, env.env),
      interrupted: env.interrupted,
    })
    process.stdout.write(`effect-e2e: ${answer.status} - report at ${parsed.dir}/${answer.reportPath}\n`)
    return exitCodeOf(answer.status)
  })

const describeFailure = (error: CliFailure): { readonly code: number; readonly message: string } =>
  Match.valueTags(error, {
    ConfigInvalid: (invalid) => ({ code: 2, message: `CONFIG_INVALID: ${invalid.message}` }),
    CollectionFailed: (failed) => ({ code: 2, message: failed.message }),
    SuiteExists: (exists) => ({
      code: 2,
      message: `${exists.path} already exists; pass --force to replace the suite`,
    }),
    SuiteFsError: (failed) => ({ code: 3, message: `${failed.operation} ${failed.path}: ${failed.message}` }),
    InstallFailed: (failed) => ({ code: 3, message: failed.message }),
    ReportInvalid: (invalid) => ({ code: 4, message: `report-1 did not decode: ${invalid.message}` }),
  })

const programOf = (parsed: Exclude<Parsed, { command: 'usage' }>, env: CliEnv) =>
  parsed.command === 'init' ? initProgram(parsed) : runProgram(parsed, env)

export const runCli: {
  (args: ReadonlyArray<string>, env: CliEnv): Effect.Effect<number, never, CliServices>
  (env: CliEnv): (args: ReadonlyArray<string>) => Effect.Effect<number, never, CliServices>
} = dual(2, (args: ReadonlyArray<string>, env: CliEnv): Effect.Effect<number, never, CliServices> => {
  const parsed = parseArgs(args)
  if (parsed.command === 'usage') {
    return Effect.sync(() => {
      process.stderr.write(`effect-e2e: ${parsed.message}\n${USAGE}\n`)
      return 2
    })
  }
  return programOf(parsed, env).pipe(
    Effect.catch((error) =>
      Effect.sync(() => {
        const outcome = describeFailure(error)
        process.stderr.write(`effect-e2e: ${outcome.message}\n`)
        return outcome.code
      })
    ),
    Effect.catchDefect((defect) =>
      Effect.sync(() => {
        process.stderr.write(`effect-e2e: ${new RunnerDefect({ cause: defect }).message}\n`)
        return 4
      })
    ),
    Effect.provide(suiteFsLayer(parsed.dir)),
  )
})
