import { Schema as S } from 'effect'

export const Options = S.Struct({})

export const UNINHABITED_CHANNEL_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const PLAIN_ERROR_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const WORKFLOW_SUFFIX = '.workflow.ts'

export const EITHER_TYPE_NAME = 'Either'

export const TAGGED_ERROR_NAME = 'TaggedError'

export const TAGGED_CLASS_NAMES: ReadonlyArray<string> = ['TaggedClass', 'TaggedError']

export const LEFT_CONSTRUCTOR = 'left'

export const UNINHABITED_KINDS: ReadonlyArray<string> = [
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
      'When a *.workflow.ts returns Either, both channels must be inhabited: Error must be an S.TaggedError, and Decision must carry information. Either<UnitDecision, Error> is Option<Error> in disguise — return the bare union or the Option instead.',
  },
  schema: [Options],
  messages: {
    uninhabitedErrorChannel: UNINHABITED_CHANNEL_MESSAGE,
    uninhabitedDecisionChannel: UNINHABITED_CHANNEL_MESSAGE,
    plainErrorChannel: PLAIN_ERROR_MESSAGE,
  },
} as const
