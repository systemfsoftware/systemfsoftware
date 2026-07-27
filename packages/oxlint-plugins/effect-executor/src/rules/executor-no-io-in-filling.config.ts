import { Schema as S } from 'effect'

export const Options = S.Struct({})

export const IO_CELLS = ['store', 'adapter'] as const

export const SUSPENSION_TYPES = ['YieldExpression', 'AwaitExpression'] as const

export const SKIPPED_WALK_KEYS = ['parent', 'range', 'loc', 'start', 'end'] as const

export const IO_IN_FILLING_EXPECTED =
  'a pure filling — every input already read and decoded before the decision' as const

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
      'Ban I/O inside the arguments of the pure workflow call in *.executor.ts — a suspended effect or a store/adapter call there is I/O interleaved into the sandwich filling.',
  },
  schema: [Options],
  messages: {
    ioInWorkflowArgument: IO_IN_FILLING_MESSAGE,
  },
} as const
