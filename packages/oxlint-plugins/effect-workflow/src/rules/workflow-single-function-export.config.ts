import { Schema as S } from 'effect'

export const Options = S.Struct({})

export const MESSAGE = '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      '*.workflow.ts must export exactly one function — the workflow itself. Schema classes and types are public and may be exported. Steps, helpers, and constants are private.',
  },
  schema: [Options],
  messages: {
    tooManyFunctionExports: MESSAGE,
  },
} as const
