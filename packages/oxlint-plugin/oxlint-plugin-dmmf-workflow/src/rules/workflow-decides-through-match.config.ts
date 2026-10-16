import { Schema as S } from 'effect'

export const Options = S.Struct({})

export const UNCHANGED_SUCCESS_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const TAG_KEYED_DISPATCH_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const EMPTY_VISITOR = {} as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'A Workflow.make decision body may not return success wrapping the matched value unchanged, and may not read a member keyed by a _tag value: the first is a silent stay, the second is dispatch by table outside Match.',
  },
  schema: [Options],
  messages: {
    unchangedSuccess: UNCHANGED_SUCCESS_MESSAGE,
    tagKeyedDispatch: TAG_KEYED_DISPATCH_MESSAGE,
  },
} as const
