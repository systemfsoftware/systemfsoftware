import * as Schema from 'effect/Schema'

export const EngineCapability = Schema.Literals([
  'web',
  'screenshot',
  'vision',
  'network',
  'drag',
  'file-upload',
  'frames',
])
export type EngineCapability = typeof EngineCapability.Type
