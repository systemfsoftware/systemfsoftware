import { describe, it } from '@systemfsoftware/effect-gherkin-spec'
import type { Mutant as ApiMutant } from '@systemfsoftware/stryker-js/Mutant'
import { Array as Arr } from 'effect'
import * as Effect from 'effect/Effect'
import { FastCheck as fc } from 'effect/testing'

import { instrument } from '../instrument/index.js'
import type { InstrumenterOptions, InstrumentIgnorer } from '../instrument/index.js'

const OUTSIDE_KEEP = 'outside keep()'
const INSIDE_FLAG = 'inside if (flag)'

const ARITH_OP = fc.constantFrom('+', '-', '*', '/', '%')

const NUMBER = fc.nat({ max: 9 })

const WORD_ARB: fc.Arbitrary<string> = fc
  .array(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')), { minLength: 3, maxLength: 8 })
  .map((chars) => chars.join(''))

type Fragment =
  | readonly ['ARITH', string]
  | readonly ['BOOL', string]
  | readonly ['STRING', string]
  | readonly ['TERNARY', string]

const FRAGMENT_ARB: fc.Arbitrary<Fragment> = fc.oneof(
  fc.tuple(ARITH_OP, NUMBER, NUMBER).map((
    [op, left, right],
  ): Fragment => ['ARITH', `export const a = ${left} ${op} ${right}`]),
  fc.boolean().map((value): Fragment => ['BOOL', `export const b = ${value}`]),
  WORD_ARB.map((word): Fragment => ['STRING', `export const s = '${word}'`]),
  fc.tuple(NUMBER, NUMBER).map(([left, right]): Fragment => [
    'TERNARY',
    `export const t = ${left} === ${right} ? ${left} : ${right}`,
  ]),
)

const MODULE_ARB: fc.Arbitrary<readonly string[]> = fc.array(FRAGMENT_ARB, { minLength: 1, maxLength: 5 }).map(
  (fragments) => Arr.map(fragments, ([, line], index) => `${line} // fragment ${index}`),
)

const FAMILIES: readonly string[] = [
  'ArithmeticOperator',
  'BooleanLiteral',
  'StringLiteral',
  'EqualityOperator',
  'ConditionalExpression',
]

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

const arithmeticOf = (mutants: readonly ApiMutant[], ignored: boolean): readonly ApiMutant[] =>
  mutants.filter((mutant) => mutant.mutatorName === 'ArithmeticOperator' && (mutant.status === 'Ignored') === ignored)

describe('instrument', () => {
  it.effect.prop(
    '∀m_GeneratedModules_≡EveryLiveMutantIsGuardedInTheEmittedCode',
    [MODULE_ARB],
    ([lines]) =>
      Effect.gen(function*() {
        const result = yield* instrumentSource('/tmp/generated.ts', lines.join('\n'), optionsWith([]))
        const content = result.files[0]?.content ?? ''
        const hash = content.match(/stryMutAct_([0-9a-f]+)/)?.[1] ?? ''
        const live = liveMutants(result.mutants)
        return hash !== '' && live.length > 0 &&
          live.every((mutant) => content.includes(`stryMutAct_${hash}("${mutant.id}")`))
      }),
  )

  it.effect.prop(
    '∀m,f_Exclusions_≡AnExclusionIgnoresExactlyItsFamilyAndMovesNoOther',
    [fc.tuple(MODULE_ARB, fc.constantFrom(...FAMILIES))],
    ([[lines, family]]) => {
      return Effect.gen(function*() {
        const excludedReason = `Ignored because of excluded mutation "${family}"`
        const baseline = yield* instrumentSource('/tmp/generated.ts', lines.join('\n'), optionsWith([]))
        const excluded = yield* instrumentSource(
          '/tmp/generated.ts',
          lines.join('\n'),
          optionsWith([], [family]),
        )
        const familyWasIgnored = excluded.mutants
          .filter((mutant) => mutant.mutatorName === family)
          .every((mutant) => mutant.status === 'Ignored' && mutant.statusReason === excludedReason)
        const baselineCounts = countsByMutator(liveMutants(baseline.mutants))
        const excludedCounts = countsByMutator(liveMutants(excluded.mutants))
        const othersUnmoved = FAMILIES.every((other) => {
          if (other === family) {
            return excludedCounts[other] === undefined
          }
          return (excludedCounts[other] ?? 0) === (baselineCounts[other] ?? 0)
        })
        return familyWasIgnored && othersUnmoved &&
          liveMutants(excluded.mutants).length ===
            liveMutants(baseline.mutants).length - (baselineCounts[family] ?? 0)
      })
    },
  )

  it.effect.prop(
    '∀k_KeepCallCounts_≡AnIgnorerProtectsOnlyTheKeepArguments',
    [fc.nat({ max: 2 }), ARITH_OP, ARITH_OP, NUMBER],
    ([k, outsideOp, insideOp, insideN]) => {
      const kept = Arr.makeBy(
        k + 1,
        (index) => `export const kept${index} = keep((x: number) => x ${insideOp} ${insideN})`,
      )
      const source = [`export const out = 1 ${outsideOp} 2`, ...kept].join('\n')
      return Effect.gen(function*() {
        const selected = yield* instrumentSource('/tmp/keep.ts', source, optionsWith([invertedKeepIgnorer]))
        const unselected = yield* instrumentSource('/tmp/keep.ts', source, optionsWith([]))
        const ignoredOutside = arithmeticOf(selected.mutants, true)
        const liveInside = arithmeticOf(selected.mutants, false)
        return ignoredOutside.length === 1 && ignoredOutside[0]?.statusReason === OUTSIDE_KEEP &&
          liveInside.length === k + 1 &&
          arithmeticOf(unselected.mutants, true).length === 0
      })
    },
  )

  it.effect.prop(
    '∀r_FlaggedRegions_≡AnIgnorerProtectsOnlyTheRegionInterior',
    [fc.nat({ max: 2 }), ARITH_OP, ARITH_OP, NUMBER],
    ([r, topOp, innerOp, innerN]) => {
      const regions = Arr.makeBy(
        r + 1,
        (index) => `if (flag) {\n  const inner${index} = ${innerN} ${innerOp} ${index + 1}\n}`,
      )
      const source = ['export const top = 2 ' + topOp + ' 3', ...regions].join('\n')
      return Effect.gen(function*() {
        const result = yield* instrumentSource('/tmp/region.ts', source, optionsWith([regionFlagIgnorer]))
        const ignoredInside = arithmeticOf(result.mutants, true)
        const liveOutside = arithmeticOf(result.mutants, false)
        return ignoredInside.length === r + 1 && ignoredInside.every((mutant) => mutant.statusReason === INSIDE_FLAG) &&
          liveOutside.length === 1
      })
    },
  )

  it.effect.prop(
    '∀c_CommentTexts_≡CommentsAndTheHashbangSurvive',
    [fc.tuple(WORD_ARB, WORD_ARB, WORD_ARB)],
    ([[lineComment, blockComment, trailingComment]]) =>
      Effect.gen(function*() {
        const source =
          `#!/usr/bin/env node\n// ${lineComment}\n/* ${blockComment} */\nexport function price(n) {\n  return n + 1 // ${trailingComment}\n}\n`
        const result = yield* instrumentSource('/tmp/commented.ts', source, optionsWith([]))
        const content = result.files[0]?.content ?? ''
        return content.startsWith('#!/usr/bin/env node') && content.includes(`// ${lineComment}`) &&
          content.includes(`/* ${blockComment} */`) && content.includes(`// ${trailingComment}`)
      }),
  )
})
