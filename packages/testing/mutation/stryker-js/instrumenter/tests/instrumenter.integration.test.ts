import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'
import * as Option from 'effect/Option'
import { expect } from 'vitest'

import { instrument } from './__fixtures__/instrument.js'
import { allMutators } from './__fixtures__/registry.js'

const PROBE_SOURCE = `export function price(n) {
  if (n > 10) {
    return n + 1
  }
  const label = "expensive"
  return label.length === 0 ? true : false
}`

const KEEP_SOURCE = `export const add = (a: number, b: number) => a + b

export const kept = keep((x: number) => x + 1)
`

const REGION_SOURCE = `export const add = (a: number, b: number) => a + b
if (flag) {
  const inner = 1 + 1
}
`

const OUTSIDE_KEEP = 'outside keep()'
const INSIDE_FLAG = 'inside if (flag)'

type Mutant = {
  mutatorName: string
  status?: string
  statusReason?: string
  replacement?: string
}

type IgnorerPath = { node: unknown; parentPath?: IgnorerPath | null }

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

const isKeepCall = (node: unknown): node is { arguments: unknown[] } => {
  if (!isRecord(node) || node['type'] !== 'CallExpression') {
    return false
  }
  const callee = node['callee']
  return isRecord(callee) && callee['type'] === 'Identifier' && callee['name'] === 'keep' &&
    Array.isArray(node['arguments'])
}

const invertedKeepIgnorer = {
  shouldIgnore: (path: IgnorerPath) => {
    let child: unknown = path.node
    for (let current = path.parentPath; current; current = current.parentPath) {
      if (isKeepCall(current.node) && current.node.arguments.includes(child)) {
        return Option.none()
      }
      child = current.node
    }
    return Option.some(OUTSIDE_KEEP)
  },
}

const isFlagIf = (node: unknown): boolean => {
  if (!isRecord(node) || node['type'] !== 'IfStatement') {
    return false
  }
  const test = node['test']
  return isRecord(test) && test['type'] === 'Identifier' && test['name'] === 'flag'
}

const regionFlagIgnorer = {
  shouldIgnore: (path: IgnorerPath) => {
    for (let current = path.parentPath; current; current = current.parentPath) {
      if (isFlagIf(current.node)) {
        return Option.some(INSIDE_FLAG)
      }
    }
    return Option.none()
  },
}
const countByMutator = (mutants: readonly Mutant[]): Record<string, number> => {
  const counts: Record<string, number> = {}
  for (const mutant of mutants) {
    const key = mutant.mutatorName
    const current = counts[key] ?? 0
    counts[key] = current + 1
  }
  return counts
}

const isActive = (mutant: Mutant): boolean => mutant.status !== 'Ignored'

const Feature = makeFeature({ it, layer })

Feature('Instrumenter characterization')
  .body(({ scenario }) => {
    scenario(
      'Should_ContainAllSixteenMutators_When_RegistryIsRead',
      Gherkin.Do.pipe(
        // This scenario asserts the COMPLETE set of mutator names, not the
        // count. The registry was, until this session, populated by import
        // side effects (`registerMutator(self)` at module scope): each mutator
        // module registered itself when its side-effect-only import was
        // evaluated. A bundler that drops a side-effect-only import silently
        // deleted a mutator — removing mutants and RAISING the mutation score
        // with nothing reporting it. Asserting the whole sorted set makes a
        // dropped import visible; asserting only the length would let one
        // substitution hide another.
        Given('the registry')('mutators', () => Effect.succeed(allMutators)),
        Then('the names are the sixteen expected')(({ mutators }: { mutators: typeof allMutators }) =>
          Effect.sync(() => {
            const names = Object.keys(mutators).slice().sort()
            expect(names).toEqual([
              'ArithmeticOperator',
              'ArrayDeclaration',
              'ArrowFunction',
              'AssignmentOperator',
              'BlockStatement',
              'BooleanLiteral',
              'ConditionalExpression',
              'EqualityOperator',
              'LogicalOperator',
              'MethodExpression',
              'ObjectLiteral',
              'OptionalChaining',
              'Regex',
              'StringLiteral',
              'UnaryOperator',
              'UpdateOperator',
            ])
          })
        ),
      ),
    )

    scenario(
      'Should_ProduceThirteenMutantsAcrossSixFamilies_When_BaselineSnippetIsInstrumented',
      Gherkin.Do.pipe(
        Given('the baseline source')('source', () => Effect.succeed(PROBE_SOURCE)),
        When('it is instrumented')(
          'result',
          ({ source }: { source: string }) =>
            instrument([{ name: '/tmp/probe.ts', content: source, mutate: true }], {
              ignorers: [],
              plugins: null,
              excludedMutations: [],
            }),
        ),
        Then('the total and per-mutator counts match the baseline')((
          { result }: { result: { mutants: readonly Mutant[] } },
        ) =>
          Effect.sync(() => {
            const active = result.mutants.filter(isActive)
            const counts = countByMutator(active)
            expect(active.length).toBe(13)
            expect(counts).toEqual({
              ArithmeticOperator: 1,
              BlockStatement: 2,
              BooleanLiteral: 2,
              ConditionalExpression: 4,
              EqualityOperator: 3,
              StringLiteral: 1,
            })
          })
        ),
      ),
    )

    scenario(
      'Should_MarkMutantsIgnoredWithReason_When_ExcludedMutationsContainsMutator',
      Gherkin.Do.pipe(
        Given('the baseline source')('source', () => Effect.succeed(PROBE_SOURCE)),
        When('it is instrumented without exclusions')(
          'baseline',
          ({ source }: { source: string }) =>
            instrument([{ name: '/tmp/probe.ts', content: source, mutate: true }], {
              ignorers: [],
              plugins: null,
              excludedMutations: [],
            }),
        ),
        When('it is instrumented excluding ArithmeticOperator')(
          'excluded',
          ({ source }: { source: string }) =>
            instrument([{ name: '/tmp/probe.ts', content: source, mutate: true }], {
              ignorers: [],
              plugins: null,
              excludedMutations: ['ArithmeticOperator'],
            }),
        ),
        Then(
          'the excluded mutator yields Ignored mutants carrying the reason, and no other mutator moves',
        )((
          { baseline, excluded }: {
            baseline: { mutants: readonly Mutant[] }
            excluded: { mutants: readonly Mutant[] }
          },
        ) =>
          Effect.sync(() => {
            // Exclusion does NOT delete a mutant: it marks it `Ignored` and
            // attaches a human-readable reason, so the report can show the row
            // and say why it scored nothing. Deleting them instead would make
            // the mutant vanish from the report AND drop it from the score
            // denominator with no trace — a silently better number.
            const excludedArithmetic = excluded.mutants.filter(
              (mutant) => mutant.mutatorName === 'ArithmeticOperator',
            )
            expect(excludedArithmetic.length).toBe(1)
            for (const mutant of excludedArithmetic) {
              expect(mutant.status).toBe('Ignored')
              expect(mutant.statusReason).toBe(
                'Ignored because of excluded mutation "ArithmeticOperator"',
              )
            }

            // The active population shrinks by exactly the excluded mutants.
            const baselineActive = baseline.mutants.filter(isActive)
            const excludedActive = excluded.mutants.filter(isActive)
            expect(excludedActive.length).toBe(baselineActive.length - 1)
            expect(excludedActive.some((m) => m.mutatorName === 'ArithmeticOperator')).toBe(false)

            // Control: every other mutator is untouched, so the assertions
            // above respond to the exclusion and not to instrumentation drift.
            const baselineCounts = countByMutator(baselineActive)
            const excludedCounts = countByMutator(excludedActive)
            delete baselineCounts['ArithmeticOperator']
            expect(excludedCounts).toEqual(baselineCounts)
            expect(excludedCounts['EqualityOperator']).toBe(3)
          })
        ),
      ),
    )

    scenario(
      'Should_KeepArgumentLiveAndIgnoreSibling_When_InvertedIgnorerIsSelected',
      Gherkin.Do.pipe(
        Given('a file with a keep() argument body and a sibling function')('source', () => Effect.succeed(KEEP_SOURCE)),
        When('it is instrumented with the inverted ignorer selected')(
          'selected',
          ({ source }: { source: string }) =>
            instrument([{ name: '/tmp/keep.ts', content: source, mutate: true }], {
              ignorers: [invertedKeepIgnorer],
              plugins: null,
              excludedMutations: [],
            }),
        ),
        When('it is instrumented with no ignorer selected')(
          'unselected',
          ({ source }: { source: string }) =>
            instrument([{ name: '/tmp/keep.ts', content: source, mutate: true }], {
              ignorers: [],
              plugins: null,
              excludedMutations: [],
            }),
        ),
        Then('the keep-argument plus is live and the sibling plus is ignored only when selected')((
          { selected, unselected }: {
            selected: { mutants: readonly Mutant[] }
            unselected: { mutants: readonly Mutant[] }
          },
        ) =>
          Effect.sync(() => {
            const arith = (mutants: readonly Mutant[], replacement: string) =>
              mutants.filter((m) => m.mutatorName === 'ArithmeticOperator' && m.replacement === replacement)
            const selectedKeep = arith(selected.mutants, 'x - 1')
            const selectedSibling = arith(selected.mutants, 'a - b')
            expect(selectedKeep.some(isActive)).toBe(true)
            expect(selectedSibling.length).toBeGreaterThan(0)
            for (const mutant of selectedSibling) {
              expect(mutant.status).toBe('Ignored')
              expect(mutant.statusReason).toBe(OUTSIDE_KEEP)
            }
            expect(arith(unselected.mutants, 'x - 1').some(isActive)).toBe(true)
            expect(arith(unselected.mutants, 'a - b').some(isActive)).toBe(true)
          })
        ),
      ),
    )

    scenario(
      'Should_IgnoreMutantsInsideFlagBlock_When_RegionIgnorerIsSelected',
      Gherkin.Do.pipe(
        Given('a file with a sibling function and an if (flag) block')('source', () => Effect.succeed(REGION_SOURCE)),
        When('it is instrumented with the region ignorer selected')(
          'result',
          ({ source }: { source: string }) =>
            instrument([{ name: '/tmp/region.ts', content: source, mutate: true }], {
              ignorers: [regionFlagIgnorer],
              plugins: null,
              excludedMutations: [],
            }),
        ),
        Then('the plus inside the flag block is ignored and the sibling plus is live')((
          { result }: { result: { mutants: readonly Mutant[] } },
        ) =>
          Effect.sync(() => {
            const arith = (replacement: string) =>
              result.mutants.filter((m) => m.mutatorName === 'ArithmeticOperator' && m.replacement === replacement)
            const sibling = arith('a - b')
            const inner = arith('1 - 1')
            expect(sibling.some(isActive)).toBe(true)
            expect(inner.length).toBeGreaterThan(0)
            for (const mutant of inner) {
              expect(mutant.status).toBe('Ignored')
              expect(mutant.statusReason).toBe(INSIDE_FLAG)
            }
          })
        ),
      ),
    )
  })
