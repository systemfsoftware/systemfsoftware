import { Schema as S } from 'effect'

export const Options = S.Struct({})

export const WORKFLOW_SUFFIX = '.workflow.ts' as const

export const COMMAND_SUFFIX = 'Command' as const

export const NO_SCHEMA_VARIANTS_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const TOO_FEW_DECISION_VARIANTS_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'A .workflow.ts must declare its Command, Decision, and Error variants as S.TaggedClass / S.TaggedError, with at least two non-Command decision or error variants.',
  },
  schema: [Options],
  messages: {
    noSchemaVariants: NO_SCHEMA_VARIANTS_MESSAGE,
    tooFewDecisionVariants: TOO_FEW_DECISION_VARIANTS_MESSAGE,
  },
} as const
