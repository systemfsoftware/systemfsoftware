import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Match, Option, Schema as S } from 'effect'
import { pipe } from 'effect/Function'
import * as Result from 'effect/Result'
import { EDIT_TOOL_NAMES, LINTABLE_EXTENSIONS } from './constants.ts'
import { GuardCommand, type GuardPlan, type RunDeno, type Skip } from './flow.schema.ts'

/** Edit tool names the guard recognizes; declared here because the decision body may only reference same-file declarations. */
const GUARD_TOOL_NAMES: readonly string[] = EDIT_TOOL_NAMES

/** Extensions the guard lints; same-file for the same make-body-purity reason. */
const GUARD_LINTABLE_EXTENSIONS: readonly string[] = LINTABLE_EXTENSIONS

export class GuardUnsupportedToolError extends S.TaggedError<GuardUnsupportedToolError>()(
  'GuardUnsupportedToolError',
  { toolName: S.String },
) {}

interface PlanRule {
  readonly matches: (command: Omit<GuardCommand, '_tag'>) => boolean
  readonly plan: (command: Omit<GuardCommand, '_tag'>) => GuardPlan
}

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
]

const planFor = (command: Omit<GuardCommand, '_tag'>): GuardPlan =>
  pipe(
    Option.fromNullishOr(PLAN_RULES.find((rule) => rule.matches(command))),
    Option.match({
      onSome: (rule) => rule.plan(command),
      onNone: () =>
        Match.value(Option.fromNullishOr(command.configPath)).pipe(
          Match.tag('None', (): Skip => ({ _tag: 'Skip', reason: 'no-oxlint-config' })),
          Match.tag(
            'Some',
            ({ value: configPath }): GuardPlan => ({ _tag: 'RunOxlint', filePath: command.filePath, configPath }),
          ),
          Match.exhaustive,
        ),
    }),
  )

export const guardPlan = Workflow.make(
  GuardCommand,
  (command: GuardCommand): Result.Result<GuardPlan, GuardUnsupportedToolError> =>
    Match.value(Option.fromNullishOr(GUARD_TOOL_NAMES.find((name) => name === command.toolName))).pipe(
      Match.tag('Some', () => Result.succeed(planFor(command))),
      Match.tag('None', () => Result.fail(new GuardUnsupportedToolError({ toolName: command.toolName }))),
      Match.exhaustive,
    ),
)
