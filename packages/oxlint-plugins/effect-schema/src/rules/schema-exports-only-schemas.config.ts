import { Schema as S } from 'effect'

export const Options = S.Struct({})

export const MESSAGE = '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const SCHEMA_SUFFIX = '.schema.ts' as const

export const meta = {
  type: 'problem',
  docs: {
    description: 'A *.schema.ts file may only export schemas and type declarations.',
  },
  schema: [Options],
  messages: {
    nonSchemaExport: MESSAGE,
  },
} as const
