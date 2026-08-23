import type { NodePath as BabelNodePath, types } from '@babel/core'
import * as Option from 'effect/Option'

import type { Ignorer } from '@systemfsoftware/stryker-js-plugin-api/ignore'
import type { NodePath } from '@systemfsoftware/stryker-js-plugin-api/ignore'

/**
 * Responsible for keeping track of the active ignore message and node using the configured ignore-plugins.
 */
export class IgnorerBookkeeper {
  private readonly ignorers: readonly Ignorer[]
  private activeIgnored?: { node: types.Node; message: string } | undefined

  public get currentIgnoreMessage(): string | undefined {
    return this.activeIgnored?.message
  }

  constructor(ignorers: readonly Ignorer[]) {
    this.ignorers = ignorers
  }

  public enterNode(path: BabelNodePath): void {
    if (this.activeIgnored !== undefined) {
      return
    }
    const view = toIgnorerPath(path)
    for (const ignorer of this.ignorers) {
      const result = ignorer.shouldIgnore(view)
      if (Option.isSome(result)) {
        this.activeIgnored = { node: path.node, message: result.value }
        break
      }
    }
  }

  public leaveNode(path: BabelNodePath): void {
    if (this.activeIgnored?.node === path.node) {
      this.activeIgnored = undefined
    }
  }
}

function toIgnorerPath(path: BabelNodePath): NodePath {
  return {
    node: path.node,
    parentPath: path.parentPath ? toIgnorerPath(path.parentPath) : null,
    isObjectExpression(): boolean {
      return path.isObjectExpression()
    },
    isCallExpression(): boolean {
      return path.isCallExpression() || path.isOptionalCallExpression()
    },
    isClassProperty(): boolean {
      return path.isClassProperty()
    },
    isClassPrivateProperty(): boolean {
      return path.isClassPrivateProperty()
    },
    isClassAccessorProperty(): boolean {
      return path.isClassAccessorProperty()
    },
  }
}
