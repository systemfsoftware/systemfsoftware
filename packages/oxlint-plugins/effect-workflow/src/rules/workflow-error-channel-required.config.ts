import { Schema as S } from 'effect'

export const Options = S.Struct({})

export const MISSING_ERROR_CHANNEL_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const UNINHABITED_CHANNEL_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const PLAIN_ERROR_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const WORKFLOW_SUFFIX = '.workflow.ts'

export const EITHER_TYPE_NAME = 'Either'

export const TAGGED_ERROR_NAME = 'TaggedError'

export const LEFT_CONSTRUCTOR = 'left'

export const UNINHABITED_LEFT_KINDS: ReadonlyArray<string> = [
  'TSNeverKeyword',
  'TSVoidKeyword',
  'TSUndefinedKeyword',
  'TSNullKeyword',
  'TSUnknownKeyword',
  'TSAnyKeyword',
  'TSStringKeyword',
  'TSNumberKeyword',
  'TSBooleanKeyword',
]

export const meta = {
  type: 'problem',
  docs: {
    description:
      'A *.workflow.ts must return Either<Decision, Error> where Error is an inhabited S.TaggedError. A computation with no error channel is not a workflow; it belongs in a .kernel.ts or .observer.ts cell.',
  },
  schema: [Options],
  messages: {
    missingErrorChannel: MISSING_ERROR_CHANNEL_MESSAGE,
    uninhabitedErrorChannel: UNINHABITED_CHANNEL_MESSAGE,
    plainErrorChannel: PLAIN_ERROR_MESSAGE,
  },
} as const
