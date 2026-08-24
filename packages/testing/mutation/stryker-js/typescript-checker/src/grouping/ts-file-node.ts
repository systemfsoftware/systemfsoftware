import type { Mutant } from '@systemfsoftware/stryker-js-plugin-api/core'

import { toPosixFileName } from '../posix-file-name.js'

export interface TSFileNode {
  readonly fileName: string
  readonly parents: readonly TSFileNode[]
  readonly children: readonly TSFileNode[]
}

export function makeTSFileNode(fileName: string): TSFileNode {
  return { fileName, parents: [], children: [] }
}

export function getAllParentReferencesIncludingSelf(
  node: TSFileNode,
  allParentReferences: Set<TSFileNode> = new Set<TSFileNode>(),
): Set<TSFileNode> {
  allParentReferences.add(node)
  for (const parent of node.parents) {
    if (!allParentReferences.has(parent)) {
      getAllParentReferencesIncludingSelf(parent, allParentReferences)
    }
  }
  return allParentReferences
}

export function getAllChildReferencesIncludingSelf(
  node: TSFileNode,
  allChildReferences: Set<TSFileNode> = new Set<TSFileNode>(),
): Set<TSFileNode> {
  allChildReferences.add(node)
  for (const child of node.children) {
    if (!allChildReferences.has(child)) {
      getAllChildReferencesIncludingSelf(child, allChildReferences)
    }
  }
  return allChildReferences
}

export function getMutantsWithReferenceToChildrenOrSelf(
  node: TSFileNode,
  mutants: Mutant[],
  nodesChecked: string[] = [],
): Mutant[] {
  if (nodesChecked.includes(node.fileName)) {
    return []
  }

  nodesChecked.push(node.fileName)

  const relatedMutants = mutants.filter(
    (m) => toPosixFileName(m.fileName) === node.fileName,
  )
  const childResult = node.children.flatMap((c) => getMutantsWithReferenceToChildrenOrSelf(c, mutants, nodesChecked))
  return [...relatedMutants, ...childResult]
}
