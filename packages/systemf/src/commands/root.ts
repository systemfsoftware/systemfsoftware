import { Console, Effect, Match, Option, Ref, Result } from 'effect'
import { Argument, CliError, Command, Flag, GlobalFlag } from 'effect/unstable/cli'
import { allOf, branch } from '../branch.js'
import { check } from '../check/check.js'
import { unitList, unitShow } from '../check/inspect.js'
import { API_VERSION, exitCodeOfCheck } from '../contract/result.js'
import type { ErrorCode, ErrorEnvelope } from '../contract/result.js'
import { manifestOf } from '../manifest/walk.js'
import { packageVersion } from '../package-version.js'
import { withResultTypes } from './annotation.js'
import { capturingConsole, Output, silentConsole } from './output.js'
import { codeLine, emitFailure, failureLine, guard } from './present.js'
import type { Presentation } from './present.js'
import { renderCheck, renderManifest, renderUnitList, renderUnitShow } from './render.js'

const JsonFlag = Flag.Boolean('json').pipe(
  Flag.withDefault(false),
  Flag.withDescription('write one JSON envelope to stdout'),
)
const CwdFlag = Flag.String('cwd').pipe(Flag.withDescription('directory package arguments resolve against'))
const JsonSetting = GlobalFlag.Setting('json')({ flag: JsonFlag })
const CwdSetting = GlobalFlag.Setting('cwd')({ flag: Flag.optional(CwdFlag) })

const cwdOf = Effect.gen(function*() {
  const value = yield* CwdSetting
  return Option.getOrElse(value, () => process.cwd())
})

export const cwdSetting = CwdSetting

const checkParams = {
  package: Argument.String('package').pipe(
    Argument.variadic(),
    Argument.withDescription('package roots to check (default: the working directory)'),
  ),
  project: Flag.String('project').pipe(Flag.optional, Flag.withDescription('tsconfig the check loads')),
  only: Flag.String('only').pipe(
    Flag.atLeast(1),
    Flag.optional,
    Flag.withDescription('run only these rule ids'),
  ),
} as const

const checkCommand = Command.make('check', checkParams, (config) =>
  Effect.flatMap(cwdOf, (cwd) =>
    guard({
      program: check({
        cwd,
        packages: config.package,
        project: Option.getOrUndefined(config.project),
        only: Option.getOrUndefined(config.only),
      }),
      build: (data): Presentation => ({
        envelope: { apiVersion: API_VERSION, type: 'check', data },
        human: renderCheck(data),
        exitCode: exitCodeOfCheck(data),
      }),
    }))).pipe(
    Command.withDescription('fail when an enrolled Cell, Blueprint, Handle, or Medium is not reached by a stop check'),
    Command.withExamples([
      { command: 'systemf check', description: 'check the package in the working directory' },
      { command: 'systemf check --json', description: 'the same check, as one JSON envelope' },
      { command: 'systemf check --only stop-coverage', description: 'run one rule' },
    ]),
    withResultTypes({ resultTypes: ['check'] }),
  )

const unitListParams = {
  package: Argument.String('package').pipe(
    Argument.optional,
    Argument.withDescription('package root (default: the working directory)'),
  ),
  kind: Flag.Literals('kind', ['cell', 'blueprint', 'handle', 'medium']).pipe(
    Flag.optional,
    Flag.withDescription('only units of this kind'),
  ),
  uncovered: Flag.Boolean('uncovered').pipe(
    Flag.withDefault(false),
    Flag.withDescription('only units no stop check reaches'),
  ),
} as const

const unitListCommand = Command.make('list', unitListParams, (config) =>
  Effect.flatMap(cwdOf, (cwd) =>
    guard({
      program: unitList({
        cwd,
        package: Option.getOrUndefined(config.package),
        kind: Option.getOrUndefined(config.kind),
        uncovered: config.uncovered,
      }),
      build: (data): Presentation => ({
        envelope: { apiVersion: API_VERSION, type: 'unit.list', data },
        human: renderUnitList(data),
        exitCode: 0,
      }),
    }))).pipe(
    Command.withDescription('one row per enrolled unit, with its kind, declarations, and coverage'),
    Command.withExamples([{
      command: 'systemf unit list --uncovered',
      description: 'every unit no stop check reaches',
    }]),
    withResultTypes({ resultTypes: ['unit.list'] }),
  )

const unitShowParams = {
  module: Argument.String('module').pipe(Argument.withDescription('module path or export name')),
} as const

const unitShowCommand = Command.make('show', unitShowParams, (config) =>
  Effect.flatMap(cwdOf, (cwd) =>
    guard({
      program: unitShow({ cwd, query: config.module }),
      build: (data): Presentation => ({
        envelope: { apiVersion: API_VERSION, type: 'unit.show', data },
        human: renderUnitShow(data),
        exitCode: 0,
      }),
    }))).pipe(
    Command.withDescription("a unit's kind, declarations, and the stop checks that reach it"),
    Command.withExamples([
      { command: 'systemf unit show src/SocketMedium/socket-medium.ts', description: "one unit's stop checks" },
    ]),
    withResultTypes({ resultTypes: ['unit.show'] }),
  )

const unitCommand = Command.make('unit').pipe(
  Command.withDescription('inspect the units a package enrolls'),
  Command.withSubcommands([unitListCommand, unitShowCommand]),
)

const manifestParams = {} as const

const manifestCommand: Command.Command<'manifest', {}, {}, never, Command.Environment> = Command.make(
  'manifest',
  manifestParams,
  () =>
    guard({
      program: manifestOf(rootCommand).pipe(Effect.provideService(CwdSetting, Option.none())),
      build: (data): Presentation => ({
        envelope: { apiVersion: API_VERSION, type: 'manifest', data },
        human: renderManifest(data),
        exitCode: 0,
      }),
    }),
).pipe(
  Command.withDescription('every command, flag, argument, result type, exit code, and error code'),
  Command.withExamples([{ command: 'systemf manifest --json', description: 'the machine-readable command contract' }]),
  withResultTypes({ resultTypes: ['manifest'] }),
)

export const rootCommand = Command.make('systemf', {}, () => Effect.void).pipe(
  Command.withDescription('systemf: the stop-obligation gate and unit inspection'),
  Command.withGlobalFlags([JsonSetting, CwdSetting]),
  Command.withSubcommands([checkCommand, unitCommand, manifestCommand]),
  withResultTypes({ resultTypes: [] }),
)

const envelopeOf = (code: ErrorCode, error: string, suggestions: readonly string[]): ErrorEnvelope => ({
  apiVersion: API_VERSION,
  error,
  code,
  ...(suggestions.length === 0 ? {} : { suggestions: [...suggestions] }),
})

const cliEnvelope = (error: CliError.CliError): ErrorEnvelope =>
  Match.valueTags(error, {
    UnrecognizedOption: (e) => envelopeOf('ERR_INVALID_OPTION', e.message, e.suggestions),
    DuplicateOption: (e) => envelopeOf('ERR_INVALID_OPTION', e.message, []),
    MissingOption: (e) => envelopeOf('ERR_MISSING_ARGUMENT', e.message, []),
    MissingArgument: (e) => envelopeOf('ERR_MISSING_ARGUMENT', e.message, []),
    UnexpectedArgument: (e) => envelopeOf('ERR_INVALID_ARGUMENT', e.message, []),
    InvalidValue: (e) => envelopeOf(e.kind === 'flag' ? 'ERR_INVALID_OPTION' : 'ERR_INVALID_ARGUMENT', e.message, []),
    UnknownSubcommand: (e) => envelopeOf('ERR_UNKNOWN_COMMAND', e.message, e.suggestions),
    UserError: (e) => envelopeOf('ERR_UNKNOWN', e.message, []),
    ShowHelp: (e) =>
      Option.match(Option.fromUndefinedOr(e.errors[0]), {
        onNone: () => envelopeOf('ERR_UNKNOWN_COMMAND', 'no command given', []),
        onSome: (inner) => cliEnvelope(inner),
      }),
  })

const isHelpRequest = (error: CliError.CliError): boolean =>
  Match.valueTags(error, {
    UnrecognizedOption: () => false,
    DuplicateOption: () => false,
    MissingOption: () => false,
    MissingArgument: () => false,
    UnexpectedArgument: () => false,
    InvalidValue: () => false,
    UnknownSubcommand: () => false,
    UserError: () => false,
    ShowHelp: (help) => help.errors.length === 0,
  })

export interface CliRun {
  readonly exitCode: number
  readonly stdout: readonly string[]
}

const reportFailure = (
  output: Output,
  error: CliError.CliError,
  json: boolean,
): Effect.Effect<void> =>
  Effect.gen(function*() {
    if (allOf([isHelpRequest(error), !output.json])) {
      return yield* Effect.void
    }
    const envelope = cliEnvelope(error)
    const human = branch({
      on: json,
      yes: () => failureLine(envelope),
      no: () => codeLine(envelope.code),
    })
    return yield* emitFailure({ output, envelope, human })
  })

export const runSystemf = (args: readonly string[]): Effect.Effect<CliRun, never, Command.Environment> => {
  const json = args.some((argument) => argument === '--json' || argument.startsWith('--json='))
  return Effect.gen(function*() {
    const written: string[] = []
    const emitted = yield* Ref.make<readonly string[]>([])
    const exitCode = yield* Ref.make(0)
    const output: Output = {
      json,
      emit: (text) => Ref.update(emitted, (lines) => [...lines, text]),
      setExitCode: (code) => Ref.set(exitCode, code),
    }
    const console = branch({
      on: json,
      yes: () => silentConsole(),
      no: () => capturingConsole((line) => written.push(line)),
    })
    const version = yield* packageVersion
    const program = Command.runWith(rootCommand, { version, renderErrors: !json })(args).pipe(
      Effect.provideService(CwdSetting, Option.none()),
      Effect.provideService(Output, output),
      Effect.provideService(Console.Console, console),
    )
    const result = yield* Effect.result(program)
    if (Result.isFailure(result)) {
      yield* reportFailure(output, result.failure, json)
    }
    return {
      exitCode: yield* Ref.get(exitCode),
      stdout: [...written, ...(yield* Ref.get(emitted))],
    }
  })
}
