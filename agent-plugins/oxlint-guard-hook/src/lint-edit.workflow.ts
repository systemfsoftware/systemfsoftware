import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Match, Option, Schema as S } from 'effect'
import { pipe } from 'effect/Function'
import * as Result from 'effect/Result'
import { EDIT_TOOL_NAMES, LINTABLE_EXTENSIONS } from './constants.ts'
import { type LintableEdit, LintEditCommand, type LintPlan, type RunDeno, type Skip } from './flow.schema.ts'

/** The tools the lint decides on; declared here because the decision body may only reference same-file declarations. */
const TOOL_NAMES: readonly string[] = EDIT_TOOL_NAMES

/** The extensions the lint covers; same-file for the same make-body-purity reason. */
const LINTABLE_EXTS: readonly string[] = LINTABLE_EXTENSIONS

export class UnsupportedToolError extends S.TaggedError<UnsupportedToolError>()(
  'UnsupportedToolError',
  { toolName: S.String },
) {}

interface PlanRule {
  readonly matches: (edit: LintableEdit) => boolean
  readonly plan: (edit: LintableEdit) => LintPlan
}

const PLAN_RULES: readonly PlanRule[] = [
  {
    matches: (edit) => !edit.facts.exists,
    plan: (): Skip => ({ _tag: 'Skip', reason: 'file-missing' }),
  },
  {
    matches: (edit) => !LINTABLE_EXTS.includes(edit.facts.extension.toLowerCase()),
    plan: (): Skip => ({ _tag: 'Skip', reason: 'not-lintable-extension' }),
  },
  {
    matches: (edit) => edit.facts.denoShebang,
    plan: (edit): RunDeno => ({ _tag: 'RunDeno', filePath: edit.target.filePath }),
  },
]

const planFor = (edit: LintableEdit): LintPlan =>
  pipe(
    Option.fromNullishOr(PLAN_RULES.find((rule) => rule.matches(edit))),
    Option.match({
      onSome: (rule) => rule.plan(edit),
      onNone: () =>
        Match.value(Option.fromNullishOr(edit.facts.configPath)).pipe(
          Match.tag('None', (): Skip => ({ _tag: 'Skip', reason: 'no-oxlint-config' })),
          Match.tag(
            'Some',
            ({ value: configPath }): LintPlan => ({
              _tag: 'RunOxlint',
              filePath: edit.target.filePath,
              configPath,
            }),
          ),
          Match.exhaustive,
        ),
    }),
  )

export const lintPlan = Workflow.make(
  LintEditCommand,
  (command): Result.Result<LintPlan, UnsupportedToolError> =>
    Match.value(command.edit).pipe(
      Match.tag('OversizedEdit', (): Result.Result<LintPlan, UnsupportedToolError> =>
        Result.succeed({ _tag: 'Skip', reason: 'oversized-input' })),
      Match.tag('UnreadableEdit', (): Result.Result<LintPlan, UnsupportedToolError> =>
        Result.succeed({ _tag: 'Skip', reason: 'unreadable-input' })),
      Match.tag('LintableEdit', (edit) =>
        Match.value(Option.fromNullishOr(TOOL_NAMES.find((name) =>
          name === edit.target.toolName
        ))).pipe(
          Match.tag('Some', () =>
            Result.succeed(planFor(edit))),
          Match.tag(
            'None',
            () =>
              Result.fail(new UnsupportedToolError({ toolName: edit.target.toolName })),
          ),
          Match.exhaustive,
        )),
      Match.exhaustive,
    ),
)
