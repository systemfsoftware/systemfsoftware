import { Schema as S } from 'effect'

export const Options = S.Struct({})

export const HANDLER_SUFFIX = '.handler.ts' as const

export const EXECUTOR_SUFFIX = '.executor' as const

export const NO_EXECUTOR_IMPORT_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const MULTIPLE_EXECUTOR_IMPORTS_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const NO_EITHER_DELEGATION_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const MULTIPLE_EITHER_DELEGATIONS_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'A .handler.ts must import exactly one sibling *.executor and delegate to it through exactly one Effect.either call. The transport terminus owns no I/O and no orchestration.',
  },
  schema: [Options],
  messages: {
    noExecutorImport: NO_EXECUTOR_IMPORT_MESSAGE,
    multipleExecutorImports: MULTIPLE_EXECUTOR_IMPORTS_MESSAGE,
    noEitherDelegation: NO_EITHER_DELEGATION_MESSAGE,
    multipleEitherDelegations: MULTIPLE_EITHER_DELEGATIONS_MESSAGE,
  },
} as const
