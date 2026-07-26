import { Schema as S } from 'effect'

export const Options = S.Struct({})

export const MESSAGE =
  'Importing {{source}} from {{file}} violates the inline-schemas rule. Types consumed by exactly one workflow belong in the workflow file itself. Move the declarations inline or rename the schema file if it is shared.' as const

export const WORKFLOW_SUFFIX = '.workflow.ts' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'A .workflow.ts must not import from a sibling *.schema.ts whose name matches the workflow. Types consumed by exactly one workflow belong inline. Shared value objects from other schema files are fine.',
  },
  schema: [Options],
  messages: {
    singleConsumerSchema: MESSAGE,
  },
} as const
