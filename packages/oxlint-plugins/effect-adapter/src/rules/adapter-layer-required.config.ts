import { Schema as S } from 'effect'

export const Options = S.Struct({})

export const LAYER_EXPORT_REQUIRED_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'A *.adapter.ts file must export a Layer that provides its port — the composition root wires the Layer, so without it the port has no implementation to select. Live adapters use Layer.effect, default/declined and stub variants use Layer.succeed.',
  },
  schema: [Options],
  messages: {
    layerExportRequired: LAYER_EXPORT_REQUIRED_MESSAGE,
  },
} as const
