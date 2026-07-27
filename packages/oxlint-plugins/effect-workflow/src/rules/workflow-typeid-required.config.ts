import { Schema as S } from 'effect'

export const Options = S.Struct({})

export const MESSAGE = '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const meta = {
  type: 'problem',
  docs: {
    description: 'Every S.TaggedClass/S.TaggedError in *.workflow.ts must carry its union TypeId.',
  },
  schema: [Options],
  messages: {
    missingTypeId: MESSAGE,
  },
} as const
