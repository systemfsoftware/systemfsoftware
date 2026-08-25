import { NodePath, types } from '@babel/core'

import type { Mutant } from '../mutant.js'

export interface MutantPlacer<TNode extends types.Node = types.Node> {
  name: string
  canPlace(path: NodePath): boolean
  place(path: NodePath<TNode>, appliedMutants: Map<Mutant, types.Node>): void
}

/**
 * Narrows an applied mutant to the node kind a placer emits. `applied()` hands
 * back a plain node — whether it fits this position is the placer's claim, and
 * `canPlace` is what established it, so a mismatch here means the placer was
 * handed a mutant it never accepted.
 */
export function nodeOfKind<TNode extends types.Node>(
  mutant: Mutant,
  node: types.Node,
  isKind: (candidate: types.Node) => candidate is TNode,
  kind: string,
): TNode {
  if (!isKind(node)) {
    throw new Error(`Cannot place mutant ${mutant.id}: expected ${kind}, got ${node.type}`)
  }
  return node
}
