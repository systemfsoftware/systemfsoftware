import { describe, expect, it } from 'vitest'

import { createGroups } from '../../../src/grouping/create-groups.js'
import { TSFileNode } from '../../../src/grouping/ts-file-node.js'

function factoryMutant(fileName: string, id: string) {
  return {
    id,
    fileName,
    mutatorName: 'foo-mutator',
    replacement: '',
    location: {
      start: { line: 0, column: 0 },
      end: { line: 0, column: 0 },
    },
  }
}

describe('createGroups', () => {
  it('single mutant should create single group', () => {
    const mutants = [factoryMutant('a.js', 'mutant-1')]
    const nodes = new Map<string, TSFileNode>([
      ['a.js', new TSFileNode('a.js', [], [])],
    ])
    const groups = createGroups(mutants, nodes)
    expect(groups).toHaveLength(1)
    expect(groups[0]!).toHaveLength(1)
    expect(groups[0]![0]).toBe('mutant-1')
  })

  it('two mutants in different files without reference to each other should create single group', () => {
    const mutants = [factoryMutant('a.js', '1'), factoryMutant('b.js', '2')]
    const nodes = new Map<string, TSFileNode>([
      ['a.js', new TSFileNode('a.js', [], [])],
      ['b.js', new TSFileNode('b.js', [], [])],
    ])
    const groups = createGroups(mutants, nodes)
    expect(groups).toHaveLength(1)
    expect(groups[0]![0]).toBe('1')
    expect(groups[0]![1]).toBe('2')
  })

  it('two mutants in different files with reference to each other should create 2 groups', () => {
    const mutants = [factoryMutant('a.js', '1'), factoryMutant('b.js', '2')]
    const nodeA = new TSFileNode('a.js', [], [])
    const nodeB = new TSFileNode('b.js', [nodeA], [])
    const nodes = new Map<string, TSFileNode>([
      [nodeA.fileName, nodeA],
      [nodeB.fileName, nodeB],
    ])
    const groups = createGroups(mutants, nodes)
    expect(groups).toHaveLength(2)
    expect(groups[0]![0]).toBe('1')
    expect(groups[1]![0]).toBe('2')
  })

  it('two mutants in different files with circular dependency to each other should create 2 groups', () => {
    const mutants = [factoryMutant('a.js', '1'), factoryMutant('b.js', '2')]
    const nodeA = new TSFileNode('a.js', [], [])
    const nodeB = new TSFileNode('b.js', [nodeA], [])
    nodeA.parents.push(nodeB)
    const nodes = new Map<string, TSFileNode>([
      [nodeA.fileName, nodeA],
      [nodeB.fileName, nodeB],
    ])
    const groups = createGroups(mutants, nodes)
    expect(groups).toHaveLength(2)
    expect(groups[0]![0]).toBe('1')
    expect(groups[1]![0]).toBe('2')
  })

  it('two mutants in same file should create 2 groups', () => {
    const mutants = [factoryMutant('a.js', '1'), factoryMutant('a.js', '2')]
    const nodeA = new TSFileNode('a.js', [], [])
    const nodes = new Map<string, TSFileNode>([[nodeA.fileName, nodeA]])
    const groups = createGroups(mutants, nodes)
    expect(groups).toHaveLength(2)
    expect(groups[0]![0]).toBe('1')
    expect(groups[1]![0]).toBe('2')
  })

  it('complex graph should contain multiple groups', () => {
    const mutants = [
      factoryMutant('a.js', '1'),
      factoryMutant('b.js', '2'),
      factoryMutant('c.js', '3'),
      factoryMutant('d.js', '4'),
      factoryMutant('e.js', '5'),
      factoryMutant('f.js', '6'),
    ]
    const nodeA = new TSFileNode('a.js', [], [])
    const nodeB = new TSFileNode('b.js', [nodeA], [])
    const nodeC = new TSFileNode('c.js', [nodeA], [])
    const nodeD = new TSFileNode('d.js', [nodeC], [])
    const nodeE = new TSFileNode('e.js', [nodeA], [])
    const nodeF = new TSFileNode('f.js', [nodeE, nodeD], [])
    const nodes = new Map<string, TSFileNode>([
      [nodeA.fileName, nodeA],
      [nodeB.fileName, nodeB],
      [nodeC.fileName, nodeC],
      [nodeD.fileName, nodeD],
      [nodeE.fileName, nodeE],
      [nodeF.fileName, nodeF],
    ])
    const groups = createGroups(mutants, nodes)
    expect(groups).toHaveLength(4)
    expect(groups[0]![0]).toBe('1')
    expect(groups[1]![0]).toBe('2')
    expect(groups[1]![1]).toBe('3')
    expect(groups[1]![2]).toBe('5')
    expect(groups[2]![0]).toBe('4')
    expect(groups[3]![0]).toBe('6')
  })

  it('should throw error when node is not in graph', () => {
    const mutants = [factoryMutant('a.js', '1')]
    const nodeA = new TSFileNode('.js', [], [])
    const nodes = new Map<string, TSFileNode>([[nodeA.fileName, nodeA]])

    expect(() => createGroups(mutants, nodes)).toThrow('Node not in graph: a.js')
  })
})
