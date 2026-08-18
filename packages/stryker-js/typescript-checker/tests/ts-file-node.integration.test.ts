import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import type { Mutant } from '@systemfsoftware/stryker-js-plugin-api/core'
import { Effect } from 'effect'
import { expect } from 'vitest'

import { TSFileNode } from '../src/grouping/ts-file-node.js'

const Feature = makeFeature({ it, layer })

const createMutant = (fileName: string): Mutant => ({
  fileName,
  id: '0',
  replacement: '-',
  location: {
    start: { line: 1, column: 1 },
    end: { line: 1, column: 1 },
  },
  mutatorName: '',
})

const node = (fileName: string, parents: TSFileNode[] = [], children: TSFileNode[] = []): TSFileNode =>
  new TSFileNode(fileName, parents, children)

const circularParents = (): TSFileNode => {
  const nodeA = node('NodeA')
  const nodeC = node('NodeB', [nodeA])
  const nodeB = node('NodeB', [nodeC])
  nodeA.parents.push(nodeB)
  return nodeA
}

interface NodeMutantPair {
  readonly node: TSFileNode
  readonly mutants: Mutant[]
}

const childPair = (): NodeMutantPair => {
  const parent = node('NodeA.js')
  parent.children.push(node('NodeB.js'))
  return { node: parent, mutants: [createMutant('NodeB.js')] }
}

const selfReferencingPair = (): NodeMutantPair => {
  const selfNode = node('NodeA.js')
  selfNode.children = [selfNode]
  return { node: selfNode, mutants: [createMutant('NodeA.js')] }
}

const slashSpellingPair = (): NodeMutantPair => {
  const root = node('path/NodeA.js')
  root.children = [root]
  return {
    node: root,
    mutants: [createMutant('path/NodeA.js'), createMutant('path\\NodeA.js')],
  }
}

Feature('Dependency-graph node traversal')
  .body(({ scenario }) => {
    scenario(
      'Should_ReturnSelf_When_NodeHasNoParents',
      Gherkin.Do.pipe(
        Given('a node without parents')('root', () => Effect.succeed(node('NodeA'))),
        When('its parent references are collected')(
          'references',
          (s) => Effect.sync(() => s.root.getAllParentReferencesIncludingSelf()),
        ),
        Then('the collection holds only the node itself')((s) => {
          expect(s.references).toHaveLength(1)
        }),
      ),
    )

    scenario(
      'Should_CollectParentChain_When_NodeHasOneParent',
      Gherkin.Do.pipe(
        Given('a node with one parent')('root', () => Effect.succeed(node('NodeA', [node('')]))),
        When('its parent references are collected')(
          'references',
          (s) => Effect.sync(() => s.root.getAllParentReferencesIncludingSelf()),
        ),
        Then('the collection holds two nodes')((s) => {
          expect(s.references).toHaveLength(2)
        }),
      ),
    )

    scenario(
      'Should_CollectGrandparents_When_ParentsAreNested',
      Gherkin.Do.pipe(
        Given('a node whose parent has a parent')('root', () => Effect.succeed(node('NodeA', [node('', [node('')])]))),
        When('its parent references are collected')(
          'references',
          (s) => Effect.sync(() => s.root.getAllParentReferencesIncludingSelf()),
        ),
        Then('the collection holds three nodes')((s) => {
          expect(s.references).toHaveLength(3)
        }),
      ),
    )

    scenario(
      'Should_CollectBranchedParents_When_WhenABranchHasTwoLeaves',
      Gherkin.Do.pipe(
        Given('a node whose two grandparents branch from one parent')('root', () =>
          Effect.succeed(
            node('NodeA', [node('', [node(''), node('')])]),
          )),
        When('its parent references are collected')(
          'references',
          (s) => Effect.sync(() => s.root.getAllParentReferencesIncludingSelf()),
        ),
        Then('the collection holds four nodes')((s) => {
          expect(s.references).toHaveLength(4)
        }),
      ),
    )

    scenario(
      'Should_SkipVisitedNodes_When_ParentCycleExists',
      Gherkin.Do.pipe(
        Given('a node in a parent cycle')('root', () => Effect.succeed(circularParents())),
        When('its parent references are collected')(
          'references',
          (s) => Effect.sync(() => s.root.getAllParentReferencesIncludingSelf()),
        ),
        Then('each node is visited once')((s) => {
          expect(s.references).toHaveLength(3)
        }),
      ),
    )

    scenario(
      'Should_ReturnSelf_When_NodeHasNoChildren',
      Gherkin.Do.pipe(
        Given('a node without children')('root', () => Effect.succeed(node('NodeA'))),
        When('its child references are collected')(
          'references',
          (s) => Effect.sync(() => s.root.getAllChildReferencesIncludingSelf()),
        ),
        Then('the collection holds only the node itself')((s) => {
          expect(s.references).toHaveLength(1)
        }),
      ),
    )

    scenario(
      'Should_CollectChildChain_When_NodeHasOneChild',
      Gherkin.Do.pipe(
        Given('a node with one child')('root', () => Effect.succeed(node('NodeA', [], [node('')]))),
        When('its child references are collected')(
          'references',
          (s) => Effect.sync(() => s.root.getAllChildReferencesIncludingSelf()),
        ),
        Then('the collection holds two nodes')((s) => {
          expect(s.references).toHaveLength(2)
        }),
      ),
    )

    scenario(
      'Should_CollectNestedChildren_When_ChildrenAreNested',
      Gherkin.Do.pipe(
        Given('a node with a grandchild')('root', () => Effect.succeed(node('NodeA', [], [node('', [], [node('')])]))),
        When('its child references are collected')(
          'references',
          (s) => Effect.sync(() => s.root.getAllChildReferencesIncludingSelf()),
        ),
        Then('the collection holds three nodes')((s) => {
          expect(s.references).toHaveLength(3)
        }),
      ),
    )

    scenario(
      'Should_CollectBranchedChildren_When_WhenABranchHasTwoLeaves',
      Gherkin.Do.pipe(
        Given('a node whose two grandchildren branch from one child')(
          'root',
          () => Effect.succeed(node('NodeA', [], [node('', [], [node(''), node('')])])),
        ),
        When('the collection holds four nodes')(
          'references',
          (s) => Effect.sync(() => s.root.getAllChildReferencesIncludingSelf()),
        ),
        Then('the collection holds four nodes')((s) => {
          expect(s.references).toHaveLength(4)
        }),
      ),
    )

    scenario(
      'Should_MatchMutantInOwnFile_When_FileHasSingleMutant',
      Gherkin.Do.pipe(
        Given('a node holding one mutant in its own file')(
          'pair',
          () => Effect.succeed({ node: node('NodeA.js'), mutants: [createMutant('NodeA.js')] }),
        ),
        When('mutants referencing the node or its children are found')(
          'found',
          (s) => Effect.sync(() => s.pair.node.getMutantsWithReferenceToChildrenOrSelf(s.pair.mutants)),
        ),
        Then('the mutant is returned once')((s) => {
          expect(s.found).toHaveLength(1)
        }),
      ),
    )

    scenario(
      'Should_MatchMutantInChild_When_FileHasMutantInChild',
      Gherkin.Do.pipe(
        Given('a node whose child holds a mutant')('pair', () => Effect.succeed(childPair())),
        When('mutants referencing the node or its children are collected')(
          'found',
          (s) => Effect.sync(() => s.pair.node.getMutantsWithReferenceToChildrenOrSelf(s.pair.mutants)),
        ),
        Then('the child mutant is returned')((s) => {
          expect(s.found).toHaveLength(1)
        }),
      ),
    )

    scenario(
      'Should_NotLoopForever_When_NodeReferencesItself',
      Gherkin.Do.pipe(
        Given('a node whose child is itself')('pair', () => Effect.succeed(selfReferencingPair())),
        When('mutants referencing the node or its children are collected')(
          'found',
          (s) => Effect.sync(() => s.pair.node.getMutantsWithReferenceToChildrenOrSelf(s.pair.mutants)),
        ),
        Then('the self-located mutant is returned once')((s) => {
          expect(s.found).toHaveLength(1)
        }),
      ),
    )

    scenario(
      'Should_MatchMutant_When_PathSeparatorsDiffer',
      Gherkin.Do.pipe(
        Given('a node matched by forward and backward slashed mutants')(
          'pair',
          () => Effect.succeed(slashSpellingPair()),
        ),
        When('mutants referencing the node or its children are collected')(
          'found',
          (s) => Effect.sync(() => s.pair.node.getMutantsWithReferenceToChildrenOrSelf(s.pair.mutants)),
        ),
        Then('both spellings match')((s) => {
          expect(s.found).toHaveLength(2)
        }),
      ),
    )
  })
