import { Schema as S } from 'effect'

export const Options = S.Struct({})

export const MESSAGE = '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'A *.policy.ts must export a rank-2 combinator — a generic function taking an Effect and returning an Effect, or a value annotated with a *Policy type. A file with no such export has no policy in it.',
  },
  schema: [Options],
  messages: {
    noCombinator: MESSAGE,
  },
} as const
