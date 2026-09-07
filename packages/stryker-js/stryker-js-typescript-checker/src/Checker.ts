import { Cell } from '@systemfsoftware/effect-cell-types'
import { CheckerFailed } from '@systemfsoftware/stryker-js/Checker'
import { errorToString } from '@systemfsoftware/stryker-js/Mutant'
import { Result } from 'effect'
import * as Effect from 'effect/Effect'
import {
  checkMutants,
  type CheckMutantsDecision,
  CheckMutantsInput,
  DiagnosticInUnrelatedFileError,
  DiagnosticWithoutFileError,
} from './check-mutants.workflow.js'
import { CheckMutantsCommand } from './Checker.schema.js'
import type { TSFileNode } from './Compiler.js'
import { TypeScriptCompiler } from './Compiler.js'

export const checkCell = Cell.layer({
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
      const nodes: Record<string, TSFileNode> = {}
      for (const [k, v] of nodesHm) {
        nodes[k] = v
      }
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
  decode: (raw: CheckMutantsInput) => Result.succeed(raw),
  decide: checkMutants,
  encode: (outcome: Result.Result<CheckMutantsDecision, DiagnosticWithoutFileError | DiagnosticInUnrelatedFileError>) =>
    outcome,
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
