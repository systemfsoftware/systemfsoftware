import { Schema as S } from 'effect'

export const Options = S.Struct({})

export const ADAPTER_SINGLE_LAYER_EXPORT_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      '*.adapter.ts must export exactly one Layer that provides the port. Types and schema declarations are public and may be exported. Internal helpers, factories, and extra Layers must stay private — consumers wire the port, never the wrap.',
  },
  schema: [Options],
  messages: {
    tooManyLayerExports: ADAPTER_SINGLE_LAYER_EXPORT_MESSAGE,
    leakedHelper: ADAPTER_SINGLE_LAYER_EXPORT_MESSAGE,
  },
} as const
