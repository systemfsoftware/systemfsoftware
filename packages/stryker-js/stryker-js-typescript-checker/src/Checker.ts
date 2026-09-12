import * as NodeFileSystem from '@effect/platform-node-shared/NodeFileSystem'
import * as NodePath from '@effect/platform-node-shared/NodePath'
import { Cell } from '@systemfsoftware/effect-cell-types'
import type { CheckerFactory, CheckerFailed, CheckResult, CheckResultMap } from '@systemfsoftware/stryker-js/Checker'
import type { Mutant } from '@systemfsoftware/stryker-js/Mutant'
import type { StrykerOptions } from '@systemfsoftware/stryker-js/Options'
import { Predicate, Result, Schema as S } from 'effect'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Layer from 'effect/Layer'
import * as ManagedRuntime from 'effect/ManagedRuntime'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Path from 'effect/Path'
import { DiagnosticCategory } from 'typescript/unstable/sync'
import type { Diagnostic } from 'typescript/unstable/sync'
import {
  type CheckFinished,
  checkMutants,
  type CheckMutantsDecision,
  DiagnosticInUnrelatedFileError,
  DiagnosticWithoutFileError,
} from './check-mutants.workflow.js'
import { CheckMutantsCommand, TypescriptCheckerOptionsSchema } from './Checker.schema.js'
import { CheckMutantsInput } from './CheckMutants.schema.js'
import { makeHybridFileSystem, makeTypescriptCompiler, TypeScriptCompiler } from './Compiler.js'
import { groupMutants } from './mutant-groups.js'

export interface TypescriptCheckerPluginOptions {
  typescriptChecker?: {
    prioritizePerformanceOverAccuracy?: boolean
  }
}

export interface TypescriptCheckerOptionsWithStrykerOptions extends TypescriptCheckerPluginOptions, StrykerOptions {}

interface CheckerDeps {
  readonly options: StrykerOptions
  readonly compiler: TypeScriptCompiler['Service']
}

function getPrioritize(options: unknown): boolean {
  const decoded = S.decodeUnknownOption(TypescriptCheckerOptionsSchema)(options)
  return Option.getOrElse(
    Option.flatMap(
      decoded,
      (value) => Option.fromUndefinedOr(value.typescriptChecker?.prioritizePerformanceOverAccuracy),
    ),
    () => false,
  )
}

type RunAnswers = CheckFinished['results']

const causeText = (cause: unknown): string =>
  Match.value(cause).pipe(
    Match.when(Predicate.isError, (thrown) => thrown.message),
    Match.when(Predicate.isString, (thrown) => thrown),
    Match.orElse(() => 'a non-Error value was raised'),
  )

const refuse = (mutantIds: ReadonlyArray<string>, cause: unknown): CheckerFailed => ({
  _tag: 'CheckerFailed',
  checkerName: 'typescript',
  mutantIds: [...mutantIds],
  cause: causeText(cause),
})

const severityOf = (category: DiagnosticCategory): string =>
  Match.value(category).pipe(
    Match.when(DiagnosticCategory.Error, () => 'error'),
    Match.when(DiagnosticCategory.Warning, () => 'warning'),
    Match.when(DiagnosticCategory.Suggestion, () => 'suggestion'),
    Match.orElse(() => 'message'),
  )

const toCheckResult = (answer: RunAnswers[string]): CheckResult => {
  if (answer.status === 'passed') {
    return { status: 'passed' }
  }
  return { status: 'compileError', reason: answer.reason }
}

const mergeAnswers = (runs: ReadonlyArray<RunAnswers>): CheckResultMap =>
  Object.fromEntries(
    runs.flatMap((answers): ReadonlyArray<readonly [string, CheckResult]> =>
      Object.entries(answers).map(([id, answer]): readonly [string, CheckResult] => [id, toCheckResult(answer)])
    ),
  )

const checkCell = Cell.layer({
  read: (command: CheckMutantsCommand) =>
    Effect.flatMap(TypeScriptCompiler, (compiler) =>
      Effect.zipWith(
        compiler.nodes,
        compiler.check([...command.mutants]),
        (nodes, diagnostics): CheckMutantsInput =>
          new CheckMutantsInput({
            mutants: [...command.mutants],
            diagnostics: [...diagnostics],
            nodes: Object.fromEntries(nodes),
          }),
      )).pipe(Effect.mapError((cause) => refuse(command.mutants.map((mutant) => mutant.id), cause))),
  decide: checkMutants,
  write: (outcome: Result.Result<CheckMutantsDecision, DiagnosticWithoutFileError | DiagnosticInUnrelatedFileError>) =>
    Result.match(outcome, {
      onFailure: (failure) => Effect.fail(refuse([], failure)),
      onSuccess: Effect.succeed,
    }),
})

interface CheckerService {
  readonly init: Effect.Effect<void, CheckerFailed>
  readonly check: (mutants: readonly Mutant[]) => Effect.Effect<CheckResultMap, CheckerFailed>
  readonly group: (mutants: readonly Mutant[]) => Effect.Effect<readonly (readonly string[])[], CheckerFailed>
}

export function makeCheckerService({ options, compiler }: CheckerDeps): CheckerService {
  const verify = Cell.provide(checkCell, Layer.succeed(TypeScriptCompiler, compiler))

  const positionOf = (error: Diagnostic): Effect.Effect<string> =>
    Option.match(Option.filter(Option.fromUndefinedOr(error.fileName), (fileName) => fileName !== ''), {
      onNone: () => Effect.succeed(''),
      onSome: (fileName) =>
        compiler.getLineAndCharacterOfPosition(fileName, error.pos).pipe(
          Effect.orElseSucceed(() => undefined),
          Effect.map((at) =>
            Option.match(Option.fromUndefinedOr(at), {
              onNone: () => `${fileName}(1,1): `,
              onSome: (position) => `${fileName}(${position.line + 1},${position.character + 1}): `,
            })
          ),
        ),
    })

  const formatDiagnostic = (error: Diagnostic): Effect.Effect<string> =>
    positionOf(error).pipe(
      Effect.map((position) => `${position}${severityOf(error.category)} TS${error.code}: ${error.text}`),
    )

  const createErrorText = (errors: readonly Diagnostic[]): Effect.Effect<string> =>
    Effect.map(Effect.forEach(errors, formatDiagnostic), (parts) => parts.join('\n'))

  const soloRound = (mutant: Mutant): Effect.Effect<RunAnswers, CheckerFailed> =>
    Cell.run(verify, new CheckMutantsCommand({ mutants: [mutant] })).pipe(
      Effect.map((decision) => decision.results),
    )

  const soloRounds = (decision: CheckMutantsDecision): Effect.Effect<ReadonlyArray<RunAnswers>, CheckerFailed> =>
    Match.value(decision).pipe(
      Match.tag('CheckFinished', () => Effect.succeed<ReadonlyArray<RunAnswers>>([])),
      Match.tag('RetestRequired', (retest) =>
        Cell.run(verify, new CheckMutantsCommand({ mutants: [] })).pipe(
          Effect.flatMap(() => Effect.forEach(retest.needsRetest, soloRound)),
        )),
      Match.exhaustive,
    )

  return {
    init: compiler.init.pipe(
      Effect.mapError((cause) => refuse([], cause)),
      Effect.flatMap((errors) => {
        if (errors.length === 0) {
          return Effect.void
        }
        return createErrorText(errors).pipe(
          Effect.map((text) => refuse([], new Error(`Typescript error(s) found in dry run compilation: ${text}`))),
          Effect.flatMap(Effect.fail),
        )
      }),
    ),

    check: (mutants) =>
      Cell.run(verify, new CheckMutantsCommand({ mutants: [...mutants] })).pipe(
        Effect.flatMap((first) => Effect.map(soloRounds(first), (rounds) => mergeAnswers([first.results, ...rounds]))),
      ),

    group: (mutants) =>
      compiler.nodes.pipe(
        Effect.map((nodes) => groupMutants(mutants, nodes, getPrioritize(options))),
        Effect.mapError((cause) => refuse(mutants.map((mutant) => mutant.id), cause)),
      ),
  }
}

const nodePlatform: Layer.Layer<FileSystem.FileSystem | Path.Path> = Layer.mergeAll(
  NodeFileSystem.layer,
  NodePath.layer,
)

const checkerProgram = (
  options: StrykerOptions,
): Effect.Effect<CheckerService, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const fsService = yield* FileSystem.FileSystem
    const pathService = yield* Path.Path
    const fs = yield* makeHybridFileSystem(fsService)
    const compiler = makeTypescriptCompiler(options, fs, fsService, pathService)
    return makeCheckerService({ options, compiler })
  })

export const makeChecker: CheckerFactory = (options) => {
  const runtime = ManagedRuntime.make(nodePlatform)
  const service = runtime.runPromise(checkerProgram(options))
  return {
    init: async () => {
      const checker = await service
      await runtime.runPromise(checker.init)
    },
    check: async (mutants) => {
      const checker = await service
      return runtime.runPromise(checker.check([...mutants]))
    },
    group: async (mutants) => {
      const checker = await service
      return runtime.runPromise(checker.group([...mutants]))
    },
  }
}
