import { Schema as S } from 'effect'

export const Options = S.Struct({})

export const MESSAGE = '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      '*.middleware.ts must export exactly one function — the middleware itself. Context.Tag classes naming the fact the middleware attaches and types are public and may be exported. Helpers, constants, and additional middlewares belong in separate files.',
  },
  schema: [Options],
  messages: {
    tooManyFunctionExports: MESSAGE,
    disallowedExport: MESSAGE,
  },
} as const
