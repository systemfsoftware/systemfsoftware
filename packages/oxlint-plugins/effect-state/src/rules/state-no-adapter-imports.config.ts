import { Schema as S } from 'effect'

export const Options = S.Struct({})

export const ADAPTER_IMPORT_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const ADAPTER_CELL_REGEX = /\.adapter(\.js|\.ts)?$/

export const meta = {
  type: 'problem',
  docs: {
    description:
      'A *.state.ts must not value-import an adapter cell (*.adapter.ts). State owns coordination; adapters own driver connections. A stateful wrapper around a foreign technology is an adapter, not a state cell.',
  },
  schema: [Options],
  messages: {
    adapterCellImport: ADAPTER_IMPORT_MESSAGE,
  },
} as const
