export const EXPECTED = "S.TaggedError or Schema.TaggedError from 'effect' package" as const

export const FIX = "import { Schema as S } from 'effect' and use S.TaggedError('TagName')<{}>" as const

export const MESSAGE_NO_DATA_TAGGED_ERROR =
  "'{{name}}' is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}."

export const meta = {
  type: 'suggestion',
  docs: {
    description: 'Ban Data.TaggedError in favor of S.TaggedError or Schema.TaggedError',
  },
  schema: [],
  messages: {
    noDataTaggedError: MESSAGE_NO_DATA_TAGGED_ERROR,
  },
} as const
