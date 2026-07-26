import { Schema as S } from 'effect'

export const Options = S.Struct({})

export const UNCONSTRUCTED_MESSAGE =
  '{{name}} is forbidden. Expected: every declared variant is constructed somewhere in the file. Actual: {{name}} is declared but never constructed. Fix: construct it in a step or decision arm, or delete the variant — a union member nothing produces makes the union lie.' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Flag TaggedClass/TaggedError variants declared in a *.workflow.ts file but never constructed there. Dead variants make the union lie.',
  },
  schema: [Options],
  messages: {
    unconstructedVariant: UNCONSTRUCTED_MESSAGE,
  },
} as const
