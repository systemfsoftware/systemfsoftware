import { Schema as S } from 'effect'

export const Options = S.Struct({})

export const STATE_CELL_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'A *.state.ts must construct at least one escaping coordination primitive at module scope. The quarantine is the only escape hatch for live process state; a state cell that holds none is a misnamed service or an empty shell.',
  },
  schema: [Options],
  messages: {
    noStatePrimitive: STATE_CELL_MESSAGE,
  },
} as const
