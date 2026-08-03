import { Schema as S } from 'effect'

export const Options = S.Struct({})

export const STATE_CELL_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'A *.state.ts must export at most one Context.Tag. A state cell may either declare a Tag for callers to depend on or publish its handle directly (a ManagedRuntime, a Layer, the bare primitive); competing Tags create undependable instances of the same coordination state.',
  },
  schema: [Options],
  messages: {
    multipleTagExports: STATE_CELL_MESSAGE,
  },
} as const
