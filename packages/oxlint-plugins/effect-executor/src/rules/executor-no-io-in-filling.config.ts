import { Schema as S } from 'effect'

export const Options = S.Struct({})

export const IO_CELLS = ['store', 'adapter'] as const

export const SUSPENSION_TYPES = ['YieldExpression', 'AwaitExpression'] as const

export const SKIPPED_WALK_KEYS = ['parent', 'range', 'loc', 'start', 'end'] as const

export const IO_IN_FILLING_EXPECTED = 'a workflow call whose arguments are names bound above it' as const

export const IO_IN_FILLING_FIX =
  'hoist the read above the workflow call, bind it to a name, and pass that name into the command' as const

export const SUSPENSION_ACTUAL = 'a suspended effect inside the workflow call' as const

export const IO_CALL_ACTUAL = 'an I/O call inside the workflow call' as const

export const IO_IN_FILLING_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      "Ban a suspended effect or a store/adapter call inside the arguments of a workflow call in *.executor.ts. The rule walks that call's argument list only: it decides nothing about the order of the statements around the call, per EE5, and phase order is carried by the description type instead.",
  },
  schema: [Options],
  messages: {
    ioInWorkflowArgument: IO_IN_FILLING_MESSAGE,
  },
} as const
