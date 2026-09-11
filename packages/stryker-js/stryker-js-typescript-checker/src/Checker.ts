import { Cell } from '@systemfsoftware/effect-cell-types'
import { Checker } from '@systemfsoftware/stryker-js/Checker'
import { CheckerFailed } from '@systemfsoftware/stryker-js/Checker'
import type { CheckResult } from '@systemfsoftware/stryker-js/Checker'
import type { Mutant } from '@systemfsoftware/stryker-js/Mutant'
import { errorToString } from '@systemfsoftware/stryker-js/Mutant'
import type { StrykerOptions } from '@systemfsoftware/stryker-js/Schema'
import { Predicate, Result } from 'effect'
import * as Effect from 'effect/Effect'
import * as HashMap from 'effect/HashMap'
import * as Match from 'effect/Match'
import { DiagnosticCategory } from 'typescript/unstable/sync'
import type { Diagnostic } from 'typescript/unstable/sync'
import {
  checkMutants,
  type CheckMutantsDecision,
  DiagnosticInUnrelatedFileError,
  DiagnosticWithoutFileError,
} from './check-mutants.workflow.js'
import { CheckMutantsCommand } from './Checker.schema.js'
import { CheckMutantsInput } from './CheckMutants.schema.js'
import type { TSFileNode } from './Compiler.js'
import { TypeScriptCompiler } from './Compiler.js'
import { groupMutants } from './mutant-groups.js'

export interface TypescriptCheckerPluginOptions {
  typescriptChecker?: {
    prioritizePerformanceOverAccuracy?: boolean
  }
}

export interface TypescriptCheckerOptionsWithStrykerOptions extends TypescriptCheckerPluginOptions, StrykerOptions {}

interface CheckerDeps {
  readonly options: unknown
  readonly compiler: TypeScriptCompiler['Service']
}

function getPrioritize(options: unknown): boolean {
  if (!Predicate.hasProperty(options, 'typescriptChecker')) {
    return false
  }
  const tc = options['typescriptChecker']
  if (typeof tc !== 'object' || tc === null) {
    return false
  }
  if (!Predicate.hasProperty(tc, 'prioritizePerformanceOverAccuracy')) {
    return false
  }
  const val = tc['prioritizePerformanceOverAccuracy']
  if (typeof val === 'boolean') {
    return val
  }
  return false
}

const pendingRetestsOf = (decision: CheckMutantsDecision): ReadonlyArray<Mutant> =>
  Match.value(decision).pipe(
    Match.tag('CheckFinished', (): ReadonlyArray<Mutant> => []),
    Match.tag('RetestRequired', (retest) => [...retest.needsRetest]),
    Match.exhaustive,
  )

const toCheckResult = (answer: CheckMutantsDecision['results'][string]): CheckResult => {
  if (answer.status === 'passed') {
    return { status: 'passed' }
  }
  return { status: 'compileError', reason: answer.reason }
}

const mergeAnswers = (runs: ReadonlyArray<CheckMutantsDecision['results']>): HashMap.HashMap<string, CheckResult> =>
  runs.reduce(
    (merged, answers) =>
      Object.entries(answers).reduce((into, [id, answer]) => HashMap.set(into, id, toCheckResult(answer)), merged),
    HashMap.empty<string, CheckResult>(),
  )

const checkCell = Cell.layer({
  read: (command: CheckMutantsCommand) =>
    Effect.gen(function*() {
      const compiler = yield* TypeScriptCompiler
      const nodesHm = yield* compiler.nodes.pipe(
        Effect.mapError(
          (cause) =>
            new CheckerFailed({
              checkerName: 'typescript',
              mutantIds: command.mutants.map((m) => m.id),
              cause: errorToString(cause),
            }),
        ),
      )
      const nodes: Record<string, TSFileNode> = Object.fromEntries(nodesHm)
      const diagnostics = yield* compiler.check([...command.mutants]).pipe(
        Effect.mapError(
          (cause) =>
            new CheckerFailed({
              checkerName: 'typescript',
              mutantIds: command.mutants.map((m) => m.id),
              cause: errorToString(cause),
            }),
        ),
      )
      return new CheckMutantsInput({
        mutants: [...command.mutants],
        diagnostics: [...diagnostics],
        nodes,
      })
    }),
  decide: checkMutants,
  write: (outcome: Result.Result<CheckMutantsDecision, DiagnosticWithoutFileError | DiagnosticInUnrelatedFileError>) =>
    Result.match(outcome, {
      onFailure: (failure) =>
        Effect.fail(
          new CheckerFailed({
            checkerName: 'typescript',
            mutantIds: [],
            cause: errorToString(failure),
          }),
        ),
      onSuccess: (decision) => Effect.succeed(decision),
    }),
})

export function makeCheckerService({ options, compiler }: CheckerDeps): Checker['Service'] {
  const formatDiagnostic = (error: Diagnostic): Effect.Effect<string, never> =>
    Effect.gen(function*() {
      let severity: string
      if (error.category === DiagnosticCategory.Error) {
        severity = 'error'
      } else if (error.category === DiagnosticCategory.Warning) {
        severity = 'warning'
      } else if (error.category === DiagnosticCategory.Suggestion) {
        severity = 'suggestion'
      } else {
        severity = 'message'
      }
      let location = ''
      const unknownError: unknown = error
      if (
        typeof unknownError === 'object' &&
        unknownError !== null &&
        'fileName' in unknownError &&
        typeof unknownError.fileName === 'string'
      ) {
        const fileName: string = unknownError.fileName
        const lineAndCharacter = yield* compiler.getLineAndCharacterOfPosition(fileName, error.pos).pipe(
          Effect.orElseSucceed(() => undefined),
        )
        const line = (lineAndCharacter?.line ?? 0) + 1
        const character = (lineAndCharacter?.character ?? 0) + 1
        location = `${fileName}(${line},${character}): `
      } else if (error.fileName !== undefined && error.fileName !== '') {
        const lineAndCharacter = yield* compiler.getLineAndCharacterOfPosition(error.fileName, error.pos).pipe(
          Effect.orElseSucceed(() => undefined),
        )
        const line = (lineAndCharacter?.line ?? 0) + 1
        const character = (lineAndCharacter?.character ?? 0) + 1
        location = `${error.fileName}(${line},${character}): `
      }
      return `${location}${severity} TS${error.code}: ${error.text}`
    })

  const createErrorText = (errors: readonly Diagnostic[]): Effect.Effect<string, never> =>
    Effect.gen(function*() {
      const parts = yield* Effect.forEach(errors, formatDiagnostic)
      return parts.join('\n')
    })

  return {
    init: Effect.gen(function*() {
      const errors = yield* compiler.init.pipe(
        Effect.mapError(
          (cause) =>
            new CheckerFailed({
              checkerName: 'typescript',
              mutantIds: [],
              cause: errorToString(cause),
            }),
        ),
      )
      if (errors.length > 0) {
        const text = yield* createErrorText(errors)
        return yield* new CheckerFailed({
          checkerName: 'typescript',
          mutantIds: [],
          cause: errorToString(new Error(`Typescript error(s) found in dry run compilation: ${text}`)),
        })
      }
    }),

    check: (mutants) =>
      Effect.gen(function*() {
        const applyOnce = (group: readonly Mutant[]) =>
          Cell.run(checkCell, new CheckMutantsCommand({ mutants: [...group] })).pipe(
            Effect.provideService(TypeScriptCompiler, compiler),
          )
        const first = yield* applyOnce(mutants)
        const pending = pendingRetestsOf(first)
        if (pending.length === 0) {
          return mergeAnswers([first.results])
        }
        yield* applyOnce([])
        const retests = yield* Effect.forEach(
          pending,
          (mutant) => Effect.map(applyOnce([mutant]), (one) => one.results),
        )
        return mergeAnswers([first.results, ...retests])
      }),

    group: (mutants) =>
      Effect.gen(function*() {
        const nodes = yield* compiler.nodes.pipe(
          Effect.mapError(
            (cause) =>
              new CheckerFailed({
                checkerName: 'typescript',
                mutantIds: mutants.map((m) => m.id),
                cause: errorToString(cause),
              }),
          ),
        )
        return groupMutants(mutants, nodes, getPrioritize(options))
      }),
  }
}
