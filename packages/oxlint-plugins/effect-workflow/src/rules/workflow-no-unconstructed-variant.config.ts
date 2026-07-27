import { Schema as S } from 'effect'

export const Options = S.Struct({})

export const COMMAND_SUFFIX = 'Command' as const

export const UNCONSTRUCTED_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Flag TaggedClass/TaggedError variants declared in a *.workflow.ts file but never constructed there. Dead variants make the union lie. Command declarations are exempt — the caller constructs the command, never the workflow.',
  },
  schema: [Options],
  messages: {
    unconstructedVariant: UNCONSTRUCTED_MESSAGE,
  },
} as const
