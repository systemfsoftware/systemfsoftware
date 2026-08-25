import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'
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

type Mutant = { mutatorName: string; status?: string; statusReason?: string }

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
  })
