import { Cell } from '@systemfsoftware/effect-cell-types'
import { Effect, Match } from 'effect'
import { pipe } from 'effect/Function'
import * as Result from 'effect/Result'
import { runDenoPair, runOxlint } from './execute.ts'
import {
  type GuardAction,
  type GuardAdapters,
  GuardCommand,
  type GuardInputError,
  type GuardPlan,
  type GuardRaw,
  type HookResult,
  type StdinPayload,
} from './flow.schema.ts'
import { guardPlan, type GuardUnsupportedToolError } from './guard.workflow.ts'
import { PASS } from './verdict.ts'

/** The phases bag: what the cell carries from raw stdin to the hook response. */
export interface GuardPhases extends Cell.Phases {
  readonly command: StdinPayload
  readonly raw: GuardRaw
  readonly decoded: GuardCommand
  readonly decision: GuardPlan
  readonly output: GuardAction
  readonly response: HookResult
  readonly decodeError: never
  readonly readError: GuardInputError
  readonly decisionError: GuardUnsupportedToolError
  readonly writeError: never
}

export const buildGuardCell = (
  adapters: GuardAdapters,
): Cell.WriteDone<GuardPhases> =>
  pipe(
    Cell.read<GuardPhases>((stdin) => adapters.gather(stdin)),
    Cell.decode<GuardPhases>((raw) =>
      Result.succeed(
        new GuardCommand({
          toolName: raw.wire.toolName,
          filePath: raw.wire.filePath,
          exists: raw.facts.exists,
          denoShebang: raw.facts.denoShebang,
          extension: raw.facts.extension,
          configPath: raw.facts.configPath,
        }),
      )
    ),
    Cell.decide<GuardPhases>(guardPlan),
    Cell.encode<GuardPhases>((outcome) =>
      Result.match(outcome, {
        onFailure: (): GuardAction => ({ _tag: 'respond', result: PASS }),
        onSuccess: (plan) =>
          Match.value(plan).pipe(
            Match.tag('Skip', (): GuardAction => ({ _tag: 'respond', result: PASS })),
            Match.tag('RunDeno', ({ filePath }): GuardAction => ({ _tag: 'RunDeno', filePath })),
            Match.tag(
              'RunOxlint',
              ({ filePath, configPath }): GuardAction => ({ _tag: 'RunOxlint', filePath, configPath }),
            ),
            Match.exhaustive,
          ),
      })
    ),
    Cell.write<GuardPhases>((action) =>
      Match.value(action).pipe(
        Match.tag('respond', ({ result }) => Effect.succeed(result)),
        Match.tag('RunDeno', ({ filePath }) => runDenoPair(adapters.runner, adapters.dirname, filePath)),
        Match.tag('RunOxlint', ({ filePath, configPath }) =>
          runOxlint(adapters.runner, adapters.dirname, {
            filePath,
            configPath,
          })),
        Match.exhaustive,
      )
    ),
  )
