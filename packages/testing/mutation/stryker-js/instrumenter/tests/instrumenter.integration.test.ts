import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'
import * as Option from 'effect/Option'
import { expect } from 'vitest'

import { instrument } from './__fixtures__/instrument.js'

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
  id: string
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
      'The baseline snippet yields thirteen mutants across six families',
      Gherkin.Do.pipe(
        Given('the baseline source')('source', () => Effect.succeed(PROBE_SOURCE)),
        When('it is instrumented')(
          'result',
          ({ source }: { source: string }) =>
            instrument([{ name: '/tmp/probe.ts', content: source, mutate: true }], {
              ignorers: [],
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
      'Instrumented output carries a switch for every active mutant',
      Gherkin.Do.pipe(
        // A mutant that is counted but never wrapped prints pristine code:
        // the sandbox runs it unmutated, every test passes, and the mutant
        // silently "survives" — the score reads zero with no error anywhere.
        // The contract lane caught exactly that (all mutants surviving, no
        // switch in the file), so this asserts the wrap itself: for each
        // active mutant id, the emitted content must test that id.
        Given('the baseline source')('source', () => Effect.succeed(PROBE_SOURCE)),
        When('it is instrumented')(
          'result',
          ({ source }: { source: string }) =>
            instrument([{ name: '/tmp/probe.ts', content: source, mutate: true }], {
              ignorers: [],
              excludedMutations: [],
            }),
        ),
        Then('every active mutant id is tested in the emitted content')((
          { result }: { result: { mutants: readonly Mutant[]; files: readonly { content: string }[] } },
        ) =>
          Effect.sync(() => {
            const content = result.files[0]?.content ?? ''
            const hash = content.match(/stryMutAct_([0-9a-f]+)/)?.[1]
            expect(hash).toBeDefined()
            const activeIds = result.mutants.filter(isActive).map((mutant) => mutant.id)
            expect(activeIds.length).toBe(13)
            for (const id of activeIds) {
              expect(content).toContain(`stryMutAct_${hash}("${id}")`)
            }
          })
        ),
      ),
    )

    scenario(
      'An excluded mutator marks its mutants ignored with a reason',
      Gherkin.Do.pipe(
        Given('the baseline source')('source', () => Effect.succeed(PROBE_SOURCE)),
        When('it is instrumented without exclusions')(
          'baseline',
          ({ source }: { source: string }) =>
            instrument([{ name: '/tmp/probe.ts', content: source, mutate: true }], {
              ignorers: [],
              excludedMutations: [],
            }),
        ),
        When('it is instrumented excluding ArithmeticOperator')(
          'excluded',
          ({ source }: { source: string }) =>
            instrument([{ name: '/tmp/probe.ts', content: source, mutate: true }], {
              ignorers: [],
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
      'Selecting the inverted keep ignorer keeps the marked argument live and ignores its sibling',
      Gherkin.Do.pipe(
        Given('a file with a keep() argument body and a sibling function')('source', () => Effect.succeed(KEEP_SOURCE)),
        When('it is instrumented with the inverted ignorer selected')(
          'selected',
          ({ source }: { source: string }) =>
            instrument([{ name: '/tmp/keep.ts', content: source, mutate: true }], {
              ignorers: [invertedKeepIgnorer],
              excludedMutations: [],
            }),
        ),
        When('it is instrumented with no ignorer selected')(
          'unselected',
          ({ source }: { source: string }) =>
            instrument([{ name: '/tmp/keep.ts', content: source, mutate: true }], {
              ignorers: [],
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
      'Instrumented output keeps comments and the hashbang',
      Gherkin.Do.pipe(
        Given('a source with a hashbang, leading comments, and inline comments')('source', () =>
          Effect.succeed(
            `#!/usr/bin/env node
// leading file comment
/* block lead */
export function price(n) {
  return n + 1 // trailing on return
}
`,
          )),
        When('it is instrumented')(
          'result',
          ({ source }: { source: string }) =>
            instrument([{ name: '/tmp/commented.ts', content: source, mutate: true }], {
              ignorers: [],
              excludedMutations: [],
            }),
        ),
        Then('the printed file still carries every comment and the hashbang')((
          { result }: { result: { files: readonly { content: string }[] } },
        ) =>
          Effect.sync(() => {
            const content = result.files[0]?.content ?? ''
            expect(content.startsWith('#!/usr/bin/env node')).toBe(true)
            expect(content).toContain('// leading file comment')
            expect(content).toContain('/* block lead */')
            expect(content).toContain('// trailing on return')
          })
        ),
      ),
    )
    scenario(
      'Selecting the region ignorer ignores mutants inside the flag block while leaving siblings live',
      Gherkin.Do.pipe(
        Given('a file with a sibling function and an if (flag) block')('source', () => Effect.succeed(REGION_SOURCE)),
        When('it is instrumented with the region ignorer selected')(
          'result',
          ({ source }: { source: string }) =>
            instrument([{ name: '/tmp/region.ts', content: source, mutate: true }], {
              ignorers: [regionFlagIgnorer],
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
