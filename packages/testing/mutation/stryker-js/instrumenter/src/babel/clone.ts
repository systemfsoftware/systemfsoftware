import babel from '@babel/core'

const { types } = babel

/**
 * Helper for `types.cloneNode(node, deep: true, withoutLocations: false);`
 */
export function deepCloneNode<TNode extends babel.types.Node>(
  node: TNode,
): TNode {
  return types.cloneNode(node, /* deep */ true, /* withoutLocations */ false)
}
