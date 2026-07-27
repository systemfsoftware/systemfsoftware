import { Schema as S } from 'effect'

export const Options = S.Struct({})

export const TAG_FORBIDDEN_CELLS = ['workflow', 'handler', 'store', 'acl'] as const

export const CONTEXT_OBJECT = 'Context'

export const EFFECT_OBJECT = 'Effect'

export const TAG_PROPERTY = 'Tag'

export const GENERIC_TAG_PROPERTY = 'GenericTag'

export const TAG_FORBIDDEN_CELLS_EXPECTED = 'dependency Tags declared only in *.executor.ts' as const

export const TAG_FORBIDDEN_CELLS_FIX =
  'move the Tag into the executor that consumes it and name it <Executor>Deps' as const

export const TAG_OUTSIDE_EXECUTOR_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Ban Context.Tag / Context.GenericTag / Effect.Tag declarations outside *.executor.ts files. The executor owns the dependency Tag.',
  },
  schema: [Options],
  messages: {
    tagOutsideExecutor: TAG_OUTSIDE_EXECUTOR_MESSAGE,
  },
} as const
