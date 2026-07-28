import { Schema as S } from 'effect'

export const Options = S.Struct({})
export type Options = S.Schema.Type<typeof Options>

export const COMMAND_ARITY_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const
export const UNTYPED_COMMAND_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const
export const NOT_COMMAND_OBJECT_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const
export const COMMAND_NOT_TAGGED_CLASS_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const COMMAND_TYPE_NODE = 'TSTypeReference' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      "A *.workflow.ts exported function must take exactly one type-annotated command object. Wlaschin: 'one input -> Success/Failure output'.",
  },
  schema: [Options],
  messages: {
    commandArity: COMMAND_ARITY_MESSAGE,
    untypedCommand: UNTYPED_COMMAND_MESSAGE,
    notCommandObject: NOT_COMMAND_OBJECT_MESSAGE,
    commandNotTaggedClass: COMMAND_NOT_TAGGED_CLASS_MESSAGE,
  },
} as const
