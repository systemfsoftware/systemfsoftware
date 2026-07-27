import { Schema as S } from 'effect'

export const Options = S.Struct({})

export const THROW_STATEMENT_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Ban throw statements in *.workflow.ts files. A workflow is a pure decision; failures must be returned in the Either error channel.',
  },
  schema: [Options],
  messages: {
    throwStatement: THROW_STATEMENT_MESSAGE,
  },
} as const
