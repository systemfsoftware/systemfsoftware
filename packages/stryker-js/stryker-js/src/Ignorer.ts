import * as Context from 'effect/Context'
import type * as Option from 'effect/Option'

export interface NodePath {
  readonly node: unknown
  readonly parentPath?: NodePath | null
  isObjectExpression(): boolean
  isCallExpression(): boolean
  isClassProperty(): boolean
  isClassPrivateProperty(): boolean
  isClassAccessorProperty(): boolean
}

export interface IgnorerService {
  readonly shouldIgnore: (path: NodePath) => Option.Option<string>
}

export class Ignorer extends Context.Service<Ignorer, IgnorerService>()('~@systemfsoftware/stryker-js/Ignorer') {}
