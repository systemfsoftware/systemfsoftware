import type { NodePath as BabelNodePath, types } from '@babel/core'
import * as Option from 'effect/Option'

import type { IgnorerService } from '@systemfsoftware/stryker-js-plugin-api/ignore'
import type { NodePath } from '@systemfsoftware/stryker-js-plugin-api/ignore'

export interface IgnorerBookkeeper {
  readonly ignorers: readonly IgnorerService[]
  readonly activeIgnored: { readonly node: types.Node; readonly message: string } | undefined
}

export function createIgnorerBookkeeper(
  ignorers: readonly IgnorerService[],
): IgnorerBookkeeper {
  return {
    ignorers,
    activeIgnored: undefined,
  }
}

export function currentIgnoreMessage(
  bookkeeper: IgnorerBookkeeper,
): string | undefined {
  return bookkeeper.activeIgnored?.message
}

export function enterNode(
  bookkeeper: IgnorerBookkeeper,
  path: BabelNodePath,
): IgnorerBookkeeper {
  if (bookkeeper.activeIgnored !== undefined) {
    return bookkeeper
  }
  const view = toIgnorerPath(path)
  for (const ignorer of bookkeeper.ignorers) {
    const result = ignorer.shouldIgnore(view)
    if (Option.isSome(result)) {
      return {
        ...bookkeeper,
        activeIgnored: { node: path.node, message: result.value },
      }
    }
  }
  return bookkeeper
}

export function leaveNode(
  bookkeeper: IgnorerBookkeeper,
  path: BabelNodePath,
): IgnorerBookkeeper {
  if (bookkeeper.activeIgnored?.node === path.node) {
    return {
      ...bookkeeper,
      activeIgnored: undefined,
    }
  }
  return bookkeeper
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
