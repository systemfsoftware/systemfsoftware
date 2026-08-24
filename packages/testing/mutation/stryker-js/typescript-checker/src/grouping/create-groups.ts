import { type Mutant, normalizeFileName } from '@systemfsoftware/stryker-js-plugin-api/core'

import { getAllParentReferencesIncludingSelf, type TSFileNode } from './ts-file-node.js'

/**
 * To speed up the type-checking we want to check multiple mutants at once.
 * When multiple mutants in different files don't have overlap in affected files (or have small overlap), we can type-check them simultaneously.
 * These mutants who can be tested at the same time are called a group.
 * Therefore, the return type is an array of arrays, in other words: an array of groups.
 *
 * @param mutants All the mutants of the test project.
 * @param nodes A graph representation of the test project.
 */
export function createGroups(
  mutants: Mutant[],
  nodes: ReadonlyMap<string, TSFileNode>,
): string[][] {
  const groups: string[][] = []
  const mutantsToGroup = new Set(mutants)

  while (mutantsToGroup.size) {
    const group: string[] = []
    const groupNodes = new Set<TSFileNode>()
    const nodesToIgnore = new Set<TSFileNode>()

    for (const currentMutant of mutantsToGroup) {
      const currentNode = findNode(currentMutant.fileName, nodes)
      if (
        !nodesToIgnore.has(currentNode) &&
        !parentsHaveOverlapWith(currentNode, groupNodes)
      ) {
        group.push(currentMutant.id)
        groupNodes.add(currentNode)
        mutantsToGroup.delete(currentMutant)
        addRangeOfNodesToSet(
          nodesToIgnore,
          getAllParentReferencesIncludingSelf(currentNode),
        )
      }
    }
    groups.push(group)
  }

  return groups
}

function addRangeOfNodesToSet(
  nodes: Set<TSFileNode>,
  nodesToAdd: Iterable<TSFileNode>,
) {
  for (const parent of nodesToAdd) {
    nodes.add(parent)
  }
}

function findNode(fileName: string, nodes: ReadonlyMap<string, TSFileNode>) {
  const node = nodes.get(normalizeFileName(fileName))
  if (node == null) {
    throw new Error(`Node not in graph: ${fileName}`)
  }
  return node
}

function parentsHaveOverlapWith(
  currentNode: TSFileNode,
  groupNodes: Set<TSFileNode>,
) {
  for (const parentNode of getAllParentReferencesIncludingSelf(currentNode)) {
    if (groupNodes.has(parentNode)) {
      return true
    }
  }

  return false
}
