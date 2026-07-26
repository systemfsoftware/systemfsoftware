import { Schema as S } from 'effect'

export const Options = S.Struct({})

export const MESSAGE =
  "class {{name}} is missing its TypeId. Add: const XxxTypeId: unique symbol = Symbol('@systemfsoftware/<pkg>/Xxx') and readonly [XxxTypeId] = XxxTypeId" as const

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
