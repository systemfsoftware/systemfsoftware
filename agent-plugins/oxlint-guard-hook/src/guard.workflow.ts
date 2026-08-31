import { Cell, Workflow } from '@systemfsoftware/effect-cell-types'
import { Effect, Match, Schema as S } from 'effect'
import { pipe } from 'effect/Function'
import * as Result from 'effect/Result'
import { EDIT_TOOL_NAMES, LINTABLE_EXTENSIONS } from './constants.ts'
import { runDenoPair, runOxlint } from './execute.ts'
import {
  type GuardAdapters,
  GuardCommand,
  type GuardPlan,
  type GuardRaw,
  type GuardReadError,
  GuardWire,
  type HookResult,
  type RunDeno,
  type Skip,
} from './flow.schema.ts'
import { PASS } from './verdict.ts'

/** Edit tool names the guard recognizes; declared here because the decision body may only reference same-file declarations. */
export const GUARD_TOOL_NAMES: readonly string[] = EDIT_TOOL_NAMES

/** Extensions the guard lints; same-file for the same make-body-purity reason. */
export const GUARD_LINTABLE_EXTENSIONS: readonly string[] = LINTABLE_EXTENSIONS

export class GuardUnsupportedToolError extends S.TaggedError<GuardUnsupportedToolError>()(
  'GuardUnsupportedToolError',
  { toolName: S.String },
) {}

interface PlanRule {
  readonly matches: (command: GuardCommandShape) => boolean
  readonly plan: (command: GuardCommandShape) => GuardPlan
}

type GuardCommandShape = Omit<GuardCommand, '_tag'>

const PLAN_RULES: readonly PlanRule[] = [
  {
    matches: (c) => !c.exists,
    plan: (): Skip => ({ _tag: 'Skip', reason: 'file-missing' }),
  },
  {
    matches: (c) => !GUARD_LINTABLE_EXTENSIONS.includes(c.extension.toLowerCase()),
    plan: (): Skip => ({ _tag: 'Skip', reason: 'not-lintable-extension' }),
  },
  {
    matches: (c) => c.denoShebang,
    plan: (c): RunDeno => ({ _tag: 'RunDeno', filePath: c.filePath }),
  },
  {
    matches: (c) => c.configPath === null,
    plan: (): Skip => ({ _tag: 'Skip', reason: 'no-oxlint-config' }),
  },
]

const planFor = (command: GuardCommandShape): GuardPlan => {
  const rule = PLAN_RULES.find((candidate) => candidate.matches(command))
  if (rule !== undefined) {
    return rule.plan(command)
  }
  return {
    _tag: 'RunOxlint',
    filePath: command.filePath,
    configPath: command.configPath ?? '',
  }
}

export const guardPlan = Workflow.make(
  GuardCommand,
  (
    command: GuardCommand,
  ): Result.Result<GuardPlan, GuardUnsupportedToolError> => {
    if (!GUARD_TOOL_NAMES.includes(command.toolName)) {
      return Result.fail(
        new GuardUnsupportedToolError({ toolName: command.toolName }),
      )
    }
    return Result.succeed(planFor(command))
  },
)

export const buildGuardCell = (
  adapters: GuardAdapters,
): Cell.WriteDone<GuardPhases> =>
  pipe(
    Cell.read<GuardPhases>((wire) => adapters.gather(wire)),
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
    Cell.encode<GuardPhases>((outcome) => outcome),
    Cell.write<GuardPhases>((outcome) =>
      Result.match(outcome, {
        onFailure: () => Effect.succeed(PASS),
        onSuccess: (plan) =>
          Match.value(plan).pipe(
            Match.tag('Skip', () => Effect.succeed(PASS)),
            Match.tag('RunDeno', ({ filePath }) => runDenoPair(adapters.runner, adapters.dirname, filePath)),
            Match.tag('RunOxlint', ({ filePath, configPath }) =>
              runOxlint(adapters.runner, adapters.dirname, {
                filePath,
                configPath,
              })),
            Match.exhaustive,
          ),
      })
    ),
  )

export interface GuardPhases extends Cell.Phases {
  readonly command: GuardWire
  readonly raw: GuardRaw
  readonly decoded: GuardCommand
  readonly decision: GuardPlan
  readonly decisionError: GuardUnsupportedToolError
  readonly output: Result.Result<GuardPlan, GuardUnsupportedToolError>
  readonly response: HookResult
  readonly decodeError: never
  readonly readError: GuardReadError
  readonly writeError: never
}
