import { Cell } from '@systemfsoftware/effect-cell-types'
import { Effect, Match } from 'effect'
import { pipe } from 'effect/Function'
import * as Result from 'effect/Result'
import { runDenoPair, runOxlint } from './execute.ts'
import {
  type LintAction,
  type LintAdapters,
  LintEditCommand,
  type LintEvent,
  type LintPlan,
  type ParsedEdit,
  type ReadError,
  type UnparsedEdit,
} from './flow.schema.ts'
import type { UnsupportedToolError } from './lint-edit.workflow.ts'
import { lintPlan } from './lint-edit.workflow.ts'

/** The phases bag: what the lint cell carries from the raw stdin event to the lint's answer. */
export interface Phases extends Cell.Phases {
  readonly command: UnparsedEdit
  readonly raw: ParsedEdit
  readonly decoded: LintEditCommand
  readonly decision: LintPlan
  readonly decisionError: UnsupportedToolError
  readonly output: LintAction
  readonly response: LintEvent
  readonly decodeError: never
  readonly readError: ReadError
  readonly writeError: never
}

export const buildLintCell = (
  adapters: LintAdapters,
): Cell.WriteDone<Phases> =>
  pipe(
    Cell.read<Phases>((edit) => adapters.gather(edit)),
    Cell.decode<Phases>((raw) => Result.succeed(new LintEditCommand({ edit: raw }))),
    Cell.decide<Phases>(lintPlan),
    Cell.encode<Phases>((outcome) =>
      Result.match(outcome, {
        onFailure: (): LintAction => ({
          _tag: 'respond',
          event: { _tag: 'Skipped', reason: 'unsupported-tool' },
        }),
        onSuccess: (plan) =>
          Match.value(plan).pipe(
            Match.tag(
              'Skip',
              ({ reason }): LintAction => ({ _tag: 'respond', event: { _tag: 'Skipped', reason } }),
            ),
            Match.tag('RunDeno', ({ filePath }): LintAction => ({ _tag: 'RunDeno', filePath })),
            Match.tag(
              'RunOxlint',
              ({ filePath, configPath }): LintAction => ({ _tag: 'RunOxlint', filePath, configPath }),
            ),
            Match.exhaustive,
          ),
      })
    ),
    Cell.write<Phases>((action) =>
      Match.value(action).pipe(
        Match.tag('respond', ({ event }) => Effect.succeed(event)),
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
