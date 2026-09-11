import { describe, it } from '@systemfsoftware/effect-gherkin-spec'
import type { Mutant as ApiMutant } from '@systemfsoftware/stryker-js/Mutant'
import { Equal } from 'effect'
import * as Effect from 'effect/Effect'
import { FastCheck as fc } from 'effect/testing'

import { instrument } from '../instrument/index.js'
import type { InstrumenterOptions, InstrumentIgnorer } from '../instrument/index.js'

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

const COMMENTED_SOURCE = `#!/usr/bin/env node
// leading file comment
/* block lead */
export function price(n) {
  return n + 1 // trailing on return
}
`

const OUTSIDE_KEEP = 'outside keep()'
const INSIDE_FLAG = 'inside if (flag)'

const EXCLUDED_REASON = 'Ignored because of excluded mutation "ArithmeticOperator"'

const PROBE_BASELINE_COUNTS: Readonly<Record<string, number>> = {
  ArithmeticOperator: 1,
  BlockStatement: 2,
  BooleanLiteral: 2,
  ConditionalExpression: 4,
  EqualityOperator: 3,
  StringLiteral: 1,
}

const optionsWith = (
  ignorers: readonly InstrumentIgnorer[],
  excludedMutations: readonly string[] = [],
): InstrumenterOptions => ({ ignorers, excludedMutations: [...excludedMutations], parsers: [] })

const instrumentSource = (fileName: string, source: string, options: InstrumenterOptions) =>
  instrument([{ name: fileName, content: source, mutate: true }], options)

const liveMutants = (mutants: readonly ApiMutant[]): readonly ApiMutant[] =>
  mutants.filter((mutant) => mutant.status !== 'Ignored')

const countsByMutator = (mutants: readonly ApiMutant[]): Record<string, number> => {
  const counts: Record<string, number> = {}
  for (const mutant of mutants) {
    counts[mutant.mutatorName] = (counts[mutant.mutatorName] ?? 0) + 1
  }
  return counts
}

const arithmeticMutants = (mutants: readonly ApiMutant[], replacement: string): readonly ApiMutant[] =>
  mutants.filter((mutant) => mutant.mutatorName === 'ArithmeticOperator' && mutant.replacement === replacement)

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

const isKeepCall = (node: unknown): node is { arguments: unknown[] } => {
  if (!isRecord(node) || node['type'] !== 'CallExpression') {
    return false
  }
  const callee = node['callee']
  return isRecord(callee) && callee['type'] === 'Identifier' && callee['name'] === 'keep' &&
    Array.isArray(node['arguments'])
}

const invertedKeepIgnorer: InstrumentIgnorer = (path) => {
  let child: unknown = path.node
  for (let current = path.parentPath; current != null; current = current.parentPath ?? null) {
    if (isKeepCall(current.node) && current.node.arguments.includes(child)) {
      return null
    }
    child = current.node
  }
  return OUTSIDE_KEEP
}

const isFlagIf = (node: unknown): boolean => {
  if (!isRecord(node) || node['type'] !== 'IfStatement') {
    return false
  }
  const test = node['test']
  return isRecord(test) && test['type'] === 'Identifier' && test['name'] === 'flag'
}

const regionFlagIgnorer: InstrumentIgnorer = (path) => {
  for (let current = path.parentPath; current != null; current = current.parentPath ?? null) {
    if (isFlagIf(current.node)) {
      return INSIDE_FLAG
    }
  }
  return null
}

describe('instrument', () => {
  it.effect.prop(
    '∀c_BranchyModule_≡ThirteenLiveMutantsAcrossSixFamilies',
    [fc.constant(PROBE_SOURCE)],
    ([source]) =>
      Effect.gen(function*() {
        const result = yield* instrumentSource('/tmp/probe.ts', source, optionsWith([]))
        const live = liveMutants(result.mutants)
        return live.length === 13 && Equal.equals(countsByMutator(live), PROBE_BASELINE_COUNTS)
      }),
  )

  it.effect.prop(
    '∀c_BranchyModule_≡EveryLiveMutantIsGuardedInTheEmittedCode',
    [fc.constant(PROBE_SOURCE)],
    ([source]) =>
      Effect.gen(function*() {
        const result = yield* instrumentSource('/tmp/probe.ts', source, optionsWith([]))
        const content = result.files[0]?.content ?? ''
        const hash = content.match(/stryMutAct_([0-9a-f]+)/)?.[1] ?? ''
        const live = liveMutants(result.mutants)
        return hash !== '' && live.length === 13 &&
          live.every((mutant) => content.includes(`stryMutAct_${hash}("${mutant.id}")`))
      }),
  )

  it.effect.prop(
    '∀c_BranchyModule_≡AnExclusionIgnoresOneFamilyAndMovesNoOther',
    [fc.constant(PROBE_SOURCE)],
    ([source]) =>
      Effect.gen(function*() {
        const baseline = yield* instrumentSource('/tmp/probe.ts', source, optionsWith([]))
        const excluded = yield* instrumentSource(
          '/tmp/probe.ts',
          source,
          optionsWith([], ['ArithmeticOperator']),
        )
        const excludedArithmetic = excluded.mutants.filter((mutant) => mutant.mutatorName === 'ArithmeticOperator')
        const reasonHolds = excludedArithmetic.length === 1 &&
          excludedArithmetic.every((mutant) => mutant.status === 'Ignored' && mutant.statusReason === EXCLUDED_REASON)
        const baselineLive = liveMutants(baseline.mutants)
        const excludedLive = liveMutants(excluded.mutants)
        const baselineCounts = countsByMutator(baselineLive)
        delete baselineCounts['ArithmeticOperator']
        const excludedCounts = countsByMutator(excludedLive)
        return reasonHolds &&
          excludedLive.length === baselineLive.length - 1 &&
          excludedCounts['ArithmeticOperator'] === undefined &&
          Equal.equals(excludedCounts, baselineCounts) &&
          excludedCounts['EqualityOperator'] === 3
      }),
  )

  it.effect.prop(
    '∀c_MarkedArgumentModule_≡AnIgnorerProtectsOnlyTheFileItSelects',
    [fc.constant(KEEP_SOURCE)],
    ([source]) =>
      Effect.gen(function*() {
        const selected = yield* instrumentSource(
          '/tmp/keep.ts',
          source,
          optionsWith([invertedKeepIgnorer]),
        )
        const unselected = yield* instrumentSource('/tmp/keep.ts', source, optionsWith([]))
        const selectedSibling = arithmeticMutants(selected.mutants, 'a - b')
        return arithmeticMutants(selected.mutants, 'x - 1').some((mutant) => mutant.status !== 'Ignored') &&
          selectedSibling.length > 0 &&
          selectedSibling.every((mutant) => mutant.status === 'Ignored' && mutant.statusReason === OUTSIDE_KEEP) &&
          arithmeticMutants(unselected.mutants, 'x - 1').some((mutant) => mutant.status !== 'Ignored') &&
          arithmeticMutants(unselected.mutants, 'a - b').some((mutant) => mutant.status !== 'Ignored')
      }),
  )

  it.effect.prop(
    '∀c_CommentedModule_≡EveryCommentAndTheHashbangSurvive',
    [fc.constant(COMMENTED_SOURCE)],
    ([source]) =>
      Effect.gen(function*() {
        const result = yield* instrumentSource('/tmp/commented.ts', source, optionsWith([]))
        const content = result.files[0]?.content ?? ''
        return content.startsWith('#!/usr/bin/env node') &&
          content.includes('// leading file comment') &&
          content.includes('/* block lead */') &&
          content.includes('// trailing on return')
      }),
  )

  it.effect.prop(
    '∀c_GuardedBlockModule_≡AnIgnorerProtectsOnlyTheInterior',
    [fc.constant(REGION_SOURCE)],
    ([source]) =>
      Effect.gen(function*() {
        const result = yield* instrumentSource(
          '/tmp/region.ts',
          source,
          optionsWith([regionFlagIgnorer]),
        )
        const inner = arithmeticMutants(result.mutants, '1 - 1')
        return arithmeticMutants(result.mutants, 'a - b').some((mutant) => mutant.status !== 'Ignored') &&
          inner.length > 0 &&
          inner.every((mutant) => mutant.status === 'Ignored' && mutant.statusReason === INSIDE_FLAG)
      }),
  )
})
