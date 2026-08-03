import { Schema as S } from 'effect'

export const Options = S.Struct({})

export const THROW_STATEMENT_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Ban throw statements in *.kernel.ts files. A kernel is a total pure function (KE1); failures must be returned as data, not thrown.',
  },
  schema: [Options],
  messages: {
    throwStatement: THROW_STATEMENT_MESSAGE,
  },
} as const
