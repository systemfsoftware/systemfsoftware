import { Schema as S } from 'effect'

export const Options = S.Struct({})

export const MESSAGE = '{{name}} is unreachable. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const UNCONSTRUCTED_EXPECTED =
  'a construction site in this file for every variant the construction declares in its decision and error channels' as const
export const UNCONSTRUCTED_ACTUAL = 'a declared variant with no new X(…) or X.make(…) anywhere in this file' as const
export const UNCONSTRUCTED_FIX =
  'construct the variant in this file with new X(…) or X.make(…), or delete it from the union and from every dispatch over it' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      "Every variant a workflow construction declares in its decision or error channel must be constructed in the same file, with new X(…) or X.make(…). The channels are the two type arguments of the decider's Result.Result<…, …> return annotation — written inline, through an in-file alias over the whole Result, or as a S.Union([…]) const the annotation names; a variant whose class is imported rather than declared in this file is out of reach, because this file's AST cannot name it.",
  },
  schema: [Options],
  messages: {
    unconstructedVariant: MESSAGE,
  },
} as const
