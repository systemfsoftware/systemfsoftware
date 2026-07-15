import { describe, expect, it } from 'vitest'

import { TSFileNode } from '../../../src/grouping/ts-file-node.js'

describe('TSFileNode', () => {
  describe('getAllParentReferencesIncludingSelf', () => {
    it('without parent should return array of 1 node', () => {
      const node = new TSFileNode('NodeA', [], [])
      expect(node.getAllParentReferencesIncludingSelf()).toHaveLength(1)
    })

    it('with 1 parent should return array of 2 nodes', () => {
      const node = new TSFileNode('NodeA', [new TSFileNode('', [], [])], [])
      expect(node.getAllParentReferencesIncludingSelf()).toHaveLength(2)
    })

    it('with recursive depth of 2 should return 3 nodes', () => {
      const node = new TSFileNode(
        'NodeA',
        [new TSFileNode('', [new TSFileNode('', [], [])], [])],
        [],
      )
      expect(node.getAllParentReferencesIncludingSelf()).toHaveLength(3)
    })

    it('with recursive depth of 2 and multiple parents should return 4 nodes', () => {
      const node = new TSFileNode(
        'NodeA',
        [
          new TSFileNode(
            '',
            [new TSFileNode('', [], []), new TSFileNode('', [], [])],
            [],
          ),
        ],
        [],
      )
      expect(node.getAllParentReferencesIncludingSelf()).toHaveLength(4)
    })

    it('with circular dependency should skip circular dependency node', () => {
      const nodeA = new TSFileNode('NodeA', [], [])
      const nodeC = new TSFileNode('NodeB', [nodeA], [])
      const nodeB = new TSFileNode('NodeB', [nodeC], [])
      nodeA.parents.push(nodeB)
      expect(nodeA.getAllParentReferencesIncludingSelf()).toHaveLength(3)
    })
  })

  describe('getAllChildReferencesIncludingSelf', () => {
    it('without child should return array of 1 node', () => {
      const node = new TSFileNode('NodeA', [], [])
      expect(node.getAllChildReferencesIncludingSelf()).toHaveLength(1)
    })

    it('with 1 child should return array of 2 nodes', () => {
      const node = new TSFileNode('NodeA', [], [new TSFileNode('', [], [])])
      expect(node.getAllChildReferencesIncludingSelf()).toHaveLength(2)
    })

    it('with recursive depth of 2 should return 3 nodes', () => {
      const node = new TSFileNode(
        'NodeA',
        [],
        [new TSFileNode('', [], [new TSFileNode('', [], [])])],
      )
      expect(node.getAllChildReferencesIncludingSelf()).toHaveLength(3)
    })

    it('with recursive depth of 2 and multiple children should return 4 nodes', () => {
      const node = new TSFileNode(
        'NodeA',
        [],
        [
          new TSFileNode(
            '',
            [],
            [new TSFileNode('', [], []), new TSFileNode('', [], [])],
          ),
        ],
      )
      expect(node.getAllChildReferencesIncludingSelf()).toHaveLength(4)
    })
  })

  describe('getMutantsWithReferenceToChildrenOrSelf', () => {
    it('with single mutant in file should return 1 mutant', () => {
      const node = new TSFileNode('NodeA.js', [], [])
      const mutants = [createMutant('NodeA.js')]
      expect(node.getMutantsWithReferenceToChildrenOrSelf(mutants)).toHaveLength(1)
    })

    it('with single mutant in child should return 1 mutant', () => {
      const node = new TSFileNode('NodeA.js', [], [])
      const nodeB = new TSFileNode('NodeB.js', [], [])
      node.children.push(nodeB)
      const mutants = [createMutant('NodeB.js')]
      expect(node.getMutantsWithReferenceToChildrenOrSelf(mutants)).toHaveLength(1)
    })

    it('should not create endless loop', () => {
      const node = new TSFileNode('NodeA.js', [], [])
      node.children = [node]

      const mutants = [createMutant('NodeA.js')]

      expect(node.getMutantsWithReferenceToChildrenOrSelf(mutants)).toHaveLength(1)
    })

    it('should find mutant with backward slashes and forward slashes', () => {
      const node = new TSFileNode('path/NodeA.js', [], [])
      node.children = [node]

      const mutants = [createMutant('path/NodeA.js'), createMutant('path\\NodeA.js')]

      expect(node.getMutantsWithReferenceToChildrenOrSelf(mutants)).toHaveLength(2)
    })
  })
})

function createMutant(fileName: string) {
  return {
    fileName,
    id: '0',
    replacement: '-',
    location: {
      start: { line: 1, column: 1 },
      end: { line: 1, column: 1 },
    },
    mutatorName: '',
  }
}
