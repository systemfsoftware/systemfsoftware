import { Schema as S } from 'effect'

export const Options = S.Struct({})

export const MESSAGE = '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

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
