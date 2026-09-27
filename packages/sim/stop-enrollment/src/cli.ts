import { Effect, Match } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import * as Option from 'effect/Option'
import * as Path from 'effect/Path'
import * as Result from 'effect/Result'
import { exitCodeOf, renderReport } from './report.js'
import { type CheckOptions, checkStopEnrollment } from './stop-enrollment.js'

export interface CliRun {
  readonly exitCode: number
  readonly output: readonly string[]
}

interface ParseState {
  readonly packageRoot: Option.Option<string>
  readonly project: Option.Option<string>
  readonly awaitingProject: boolean
}

const USAGE = 'usage: stop-enrollment [--project <tsconfig>] [<packageRoot>]'

const initialState: ParseState = {
  packageRoot: Option.none(),
  project: Option.none(),
  awaitingProject: false,
}

type ParseOutcome = Result.Result<ParseState, string>

const consume = (state: ParseState, argument: string): ParseOutcome =>
  Match.value({ state, argument }).pipe(
    Match.when(
      ({ state }) => state.awaitingProject,
      ({ state, argument }) => Result.succeed({ ...state, project: Option.some(argument), awaitingProject: false }),
    ),
    Match.when(
      ({ argument }) => argument === '--project',
      ({ state }) => Result.succeed({ ...state, awaitingProject: true }),
    ),
    Match.when(
      ({ argument }) => argument.startsWith('--project='),
      ({ state, argument }) => Result.succeed({ ...state, project: Option.some(argument.slice(10)) }),
    ),
    Match.when(
      ({ argument }) => argument.startsWith('-'),
      ({ argument }) => Result.fail(`unknown option ${argument}\n${USAGE}`),
    ),
    Match.when(
      ({ state }) => Option.isNone(state.packageRoot),
      ({ state, argument }) => Result.succeed({ ...state, packageRoot: Option.some(argument) }),
    ),
    Match.orElse(() => Result.fail(`at most one package root\n${USAGE}`)),
  )

const consumeAll = (state: ParseState, args: readonly string[]): ParseOutcome =>
  Option.match(Option.fromUndefinedOr(args[0]), {
    onNone: () => Result.succeed(state),
    onSome: (argument) => Result.flatMap(consume(state, argument), (next) => consumeAll(next, args.slice(1))),
  })

export const parseArguments = (args: readonly string[]): Result.Result<CheckOptions, string> =>
  Result.map(consumeAll(initialState, args), (state) => ({
    packageRoot: Option.getOrUndefined(state.packageRoot),
    project: Option.getOrUndefined(state.project),
  }))

const runCheck = (
  options: CheckOptions,
): Effect.Effect<CliRun, never, FileSystem.FileSystem | Path.Path> =>
  checkStopEnrollment(options).pipe(
    Effect.map((report): CliRun => ({ exitCode: exitCodeOf(report), output: renderReport(report) })),
    Effect.catchTags({
      UnreadableSource: (failure): Effect.Effect<CliRun> =>
        Effect.succeed({ exitCode: 1, output: [`cannot read ${failure.path}: ${failure.message}`] }),
      TsconfigNotFound: (failure): Effect.Effect<CliRun> => Effect.succeed({ exitCode: 1, output: [failure.message] }),
    }),
  )

export const runStopEnrollmentCli = (
  args: readonly string[],
): Effect.Effect<CliRun, never, FileSystem.FileSystem | Path.Path> =>
  Result.match(parseArguments(args), {
    onFailure: (message): Effect.Effect<CliRun> => Effect.succeed({ exitCode: 1, output: [message] }),
    onSuccess: (options) => runCheck(options),
  })
