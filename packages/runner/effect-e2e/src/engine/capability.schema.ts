import * as Schema from 'effect/Schema'

export const EngineCapability = Schema.Literals([
  'web',
  'screenshot',
  'vision',
  'network',
  'navigation-timing',
  'drag',
  'file-upload',
  'frames',
])
export type EngineCapability = typeof EngineCapability.Type
