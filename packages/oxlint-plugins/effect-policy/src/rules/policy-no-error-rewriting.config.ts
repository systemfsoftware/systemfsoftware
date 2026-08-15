import { Schema as S } from 'effect'

export const Options = S.Struct({})

export const ERROR_REWRITING_METHODS: readonly string[] = [
  'mapError',
  'mapErrorCause',
  'mapBoth',
  'orElse',
  'orElseFail',
  'orElseSucceed',
  'orDie',
  'orDieWith',
  'catchAll',
  'catchAllCause',
  'catchCause',
  'catchIf',
  'catchTag',
  'catchTags',
]

export const MESSAGE = '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      "Ban calls that rewrite, swallow, or remove the caller's error channel E in *.policy.ts files. A policy may only grow E by its own refusal alphabet Xi.",
  },
  schema: [Options],
  messages: {
    errorRewriting: MESSAGE,
  },
} as const
