export { IgnoreDecisionSchema } from './Ignorer.schema.js'
export type { IgnoreDecision } from './Ignorer.schema.js'

import type { IgnoreDecision } from './Ignorer.schema.js'
import type { PluginInit, StrykerOptions } from './Options.js'

export interface NodePath {
  readonly node: unknown
  readonly parentPath?: NodePath | null
  isObjectExpression(): boolean
  isCallExpression(): boolean
  isClassProperty(): boolean
  isClassPrivateProperty(): boolean
  isClassAccessorProperty(): boolean
}

export interface IgnorerContext {
  readonly fileName: string
  readonly options: StrykerOptions
}

export type Ignorer = (node: NodePath, context: IgnorerContext) => IgnoreDecision

export type IgnorerFactory = (options: StrykerOptions, init: PluginInit) => Ignorer
