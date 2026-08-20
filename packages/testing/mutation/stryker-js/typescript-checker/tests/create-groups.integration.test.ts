import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import type { Mutant } from '@systemfsoftware/stryker-js-plugin-api/core'
import { Effect } from 'effect'
import { expect } from 'vitest'

import { createGroups } from '../src/grouping/create-groups.js'
import { TSFileNode } from '../src/grouping/ts-file-node.js'
import { extractErrorMessage } from './__fixtures__/checker-harness.js'

const Feature = makeFeature({ it, layer })

const factoryMutant = (fileName: string, id: string): Mutant => ({
  id,
  fileName,
  mutatorName: 'foo-mutator',
  replacement: '',
  location: {
    start: { line: 0, column: 0 },
    end: { line: 0, column: 0 },
  },
})

interface GraphSeed {
  readonly mutants: Mutant[]
  readonly nodes: Map<string, TSFileNode>
}

const node = (fileName: string, parents: TSFileNode[] = [], children: TSFileNode[] = []): TSFileNode =>
  new TSFileNode(fileName, parents, children)

const referencedSeed = (): GraphSeed => {
  const nodeA = node('a.txt')
  const nodeB = node('b.txt', [nodeA])
  return {
    mutants: [factoryMutant('a.txt', '1'), factoryMutant('b.txt', '2')],
    nodes: new Map<string, TSFileNode>([
      [nodeA.fileName, nodeA],
      [nodeB.fileName, nodeB],
    ]),
  }
}

const circularSeed = (): GraphSeed => {
  const nodeA = node('a.js')
  const nodeB = node('b.js', [nodeA])
  nodeA.parents.push(nodeB)
  return {
    mutants: [factoryMutant('a.js', '1'), factoryMutant('b.js', '2')],
    nodes: new Map<string, TSFileNode>([
      [nodeA.fileName, nodeA],
      [nodeB.fileName, nodeB],
    ]),
  }
}

const sameFileSeed = (): GraphSeed => ({
  mutants: [factoryMutant('a.js', '1'), factoryMutant('a.js', '2')],
  nodes: new Map<string, TSFileNode>([['a.js', node('a.js')]]),
})

const complexSeed = (): GraphSeed => {
  const nodeA = node('a.js')
  const nodeB = node('b.js', [nodeA])
  const nodeC = node('c.js', [nodeA])
  const nodeD = node('d.js', [nodeC])
  const nodeE = node('e.js', [nodeA])
  const nodeF = node('f.js', [nodeE, nodeD])
  return {
    mutants: [
      factoryMutant('a.js', '1'),
      factoryMutant('b.js', '2'),
      factoryMutant('c.js', '3'),
      factoryMutant('d.js', '4'),
      factoryMutant('e.js', '5'),
      factoryMutant('f.js', '6'),
    ],
    nodes: new Map<string, TSFileNode>([
      [nodeA.fileName, nodeA],
      [nodeB.fileName, nodeB],
      [nodeC.fileName, nodeC],
      [nodeD.fileName, nodeD],
      [nodeE.fileName, nodeE],
      [nodeF.fileName, nodeF],
    ]),
  }
}

interface GroupOutcome {
  readonly ok: true
  readonly groups: string[][]
}

const grouped = (seed: GraphSeed): GroupOutcome | { readonly ok: false; readonly message: string } => {
  try {
    return { ok: true, groups: createGroups(seed.mutants, seed.nodes) }
  } catch (caught) {
    return { ok: false, message: extractErrorMessage(caught) }
  }
}

Feature('Grouping mutants by dependency-graph overlap')
  .body(({ scenario }) => {
    scenario(
      'Should_CreateSingleGroup_When_GraphHoldsOneNode',
      Gherkin.Do.pipe(
        Given('a single mutant in a one-node graph')('seed', () =>
          Effect.succeed<GraphSeed>({
            mutants: [factoryMutant('a.js', 'mutant-1')],
            nodes: new Map<string, TSFileNode>([['a.js', node('a.js')]]),
          })),
        When('the graph is grouped')('outcome', (s) => Effect.sync(() => grouped(s.seed))),
        Then('one group holds the mutant')((s) => {
          if (s.outcome.ok) {
            expect(s.outcome.groups).toEqual([['mutant-1']])
          } else {
            throw new Error(s.outcome.message)
          }
        }),
      ),
    )

    scenario(
      'Should_MergeUnrelatedFiles_When_TheyDoNotReferenceEachOther',
      Gherkin.Do.pipe(
        Given('mutants in two unrelated files')('seed', () =>
          Effect.succeed<GraphSeed>({
            mutants: [factoryMutant('a.txt', '1'), factoryMutant('b.txt', '2')],
            nodes: new Map<string, TSFileNode>([
              ['a.txt', node('a.txt')],
              ['b.txt', node('b.txt')],
            ]),
          })),
        When('the graph is grouped')('outcome', (s) => Effect.sync(() => grouped(s.seed))),
        Then('one group holds both mutants')((s) => {
          if (s.outcome.ok) {
            const group = s.outcome.groups[0]
            if (group === undefined) {
              throw new Error('expected one group')
            }
            expect([...group].sort((left, right) => left.localeCompare(right))).toEqual(['1', '2'])
          } else {
            throw new Error(s.outcome.message)
          }
        }),
      ),
    )

    scenario(
      'Should_SplitReferencedFiles_When_OneFileImportsTheOther',
      Gherkin.Do.pipe(
        Given('mutants in a file and in its importer')('seed', () => Effect.succeed(referencedSeed())),
        When('the graph is grouped')('outcome', (s) => Effect.sync(() => grouped(s.seed))),
        Then('each mutant gets its own group')((s) => {
          if (s.outcome.ok) {
            expect(s.outcome.groups.map((group) => group[0])).toEqual(['1', '2'])
          } else {
            throw new Error(s.outcome.message)
          }
        }),
      ),
    )

    scenario(
      'Should_SplitCircularReferences_When_FilesImportEachOther',
      Gherkin.Do.pipe(
        Given('mutants in two files with a circular dependency')(
          'seed',
          () => Effect.succeed(circularSeed()),
        ),
        When('the graph is grouped')('outcome', (s) => Effect.sync(() => grouped(s.seed))),
        Then('each mutant is its own group')((s) => {
          if (s.outcome.ok) {
            expect(s.outcome.groups).toHaveLength(2)
          } else {
            throw new Error(s.outcome.message)
          }
        }),
      ),
    )

    scenario(
      'Should_SplitSameFileMutants_WhenTwoMutantsShareAFile',
      Gherkin.Do.pipe(
        Given('two mutants in the same file')('seed', () => Effect.succeed(sameFileSeed())),
        When('the graph is grouped')('outcome', (g) => Effect.sync(() => grouped(g.seed))),
        Then('each mutant is its own group')((s) => {
          if (s.outcome.ok) {
            expect(s.outcome.groups).toHaveLength(2)
          } else {
            throw new Error(s.outcome.message)
          }
        }),
      ),
    )

    scenario(
      'Should_SplitComplexGraph_When_ParentsOverlap',
      Gherkin.Do.pipe(
        Given('a six-file graph with overlapping parents')('seed', () => Effect.succeed(complexSeed())),
        When('the graph is grouped')('outcome', (s) => Effect.sync(() => grouped(s.seed))),
        Then('four groups form')((s) => {
          if (s.outcome.ok) {
            expect(s.outcome.groups).toHaveLength(4)
          } else {
            throw new Error(s.outcome.message)
          }
        }),
      ),
    )

    scenario(
      'Should_ThrowError_When_NodeIsMissingFromGraph',
      Gherkin.Do.pipe(
        Given('a mutant whose file is not in the graph')('seed', () =>
          Effect.succeed<GraphSeed>({
            mutants: [factoryMutant('a.txt', '1')],
            nodes: new Map<string, TSFileNode>([['.txt', node('.txt')]]),
          })),
        When('the graph is grouped')('outcome', (s) => Effect.sync(() => grouped(s.seed))),
        Then('grouping fails naming the missing file')((s) => {
          if (s.outcome.ok) {
            throw new Error(`expected grouping to fail, got ${JSON.stringify(s.outcome.groups)}`)
          }
          expect(s.outcome.message).toContain('Node not in graph: a.txt')
        }),
      ),
    )
  })
