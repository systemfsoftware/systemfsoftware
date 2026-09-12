import { describe, it } from '@systemfsoftware/effect-gherkin-spec'
import * as Effect from 'effect/Effect'
import { FastCheck as fc } from 'effect/testing'

import { instrument } from '../instrument/index.js'

const CORPUS: readonly (readonly [pattern: string, flags: string, replacements: readonly string[]])[] = [
  ['^abc$', '', ['/abc$/', '/^abc/']],
  ['^abc', '', ['/abc/']],
  ['abc$', '', ['/abc/']],
  ['^', '', []],
  ['$', '', []],
  ['^$', '', ['/$/', '/^/']],
  ['[abc]', '', ['/[^abc]/']],
  ['[a-z]', '', ['/[^a-z]/']],
  ['[^abc]', '', ['/[abc]/']],
  ['[\\]]', '', ['/[^\\]]/']],
  ['[.*+]', '', ['/[^.*+]/']],
  ['\\d', '', ['/\\D/']],
  ['\\D', '', ['/\\d/']],
  ['\\w', '', ['/\\W/']],
  ['\\W', '', ['/\\w/']],
  ['\\s', '', ['/\\S/']],
  ['\\S', '', ['/\\s/']],
  ['\\p{L}', 'u', ['/\\P{L}/u']],
  ['\\P{L}', 'u', ['/\\p{L}/u']],
  ['a+', '', ['/a/']],
  ['a*', '', ['/a/']],
  ['a?', '', ['/a/']],
  ['a{2}', '', ['/a/']],
  ['a+?', '', ['/a/']],
  ['(?=a)', '', ['/(?!a)/']],
  ['(?!a)', '', ['/(?=a)/']],
  ['(?<=a)b', '', ['/(?<!a)b/']],
  ['(?<!a)b', '', ['/(?<=a)b/']],
  ['(foo|bar)', '', []],
  ['\\1', '', []],
  ['.*', '', ['/./']],
  ['abc', '', []],
]

const ROW_ARB = fc.constantFrom(...CORPUS)

const instrumentRowAt = (row: readonly [string, string, readonly string[]], fillerLines: number) => {
  const fillers = Array.from({ length: fillerLines }, (_unused, index) => `export const filler${index} = ${index}`)
  const source = [...fillers, `export const subject = /${row[0]}/${row[1]}`].join('\n')
  return instrument([{ name: '/tmp/regex-row.ts', content: source, mutate: true }], {
    ignorers: [],
    excludedMutations: [],
    parsers: [],
  })
}

interface RowMutant {
  readonly mutatorName: string
  readonly replacement: string
  readonly location: { readonly start: { readonly line: number } }
}

const regexMutantsOnLine = (
  result: { readonly mutants: readonly RowMutant[] },
  line: number,
): readonly string[] => {
  const found: string[] = []
  for (const mutant of result.mutants) {
    if (mutant.mutatorName === 'Regex' && mutant.location.start.line === line) {
      found.push(mutant.replacement)
    }
  }
  return found
}

describe('regex mutation', () => {
  it.effect.prop(
    '∀row,n_Positions_≡RecordedReplacementsLandOnTheirOwnLine',
    [ROW_ARB, fc.nat({ max: 5 })],
    ([row, fillerLines]) =>
      Effect.gen(function*() {
        const result = yield* instrumentRowAt(row, fillerLines)
        const line = fillerLines
        const onRow = regexMutantsOnLine(result, line)
        const elsewhere = result.mutants.filter(
          (mutant) => mutant.mutatorName === 'Regex' && mutant.location.start.line !== line,
        )
        return elsewhere.length === 0 && JSON.stringify(onRow) === JSON.stringify([...row[2]])
      }),
  )

  it.effect.prop(
    '∀row,k_Replacements_≡TheDrawnReplacementCompilesAndMatchesTheRecorded',
    [ROW_ARB, fc.nat({ max: 4 })],
    ([row, k]) =>
      Effect.gen(function*() {
        const result = yield* instrumentRowAt(row, 0)
        const emitted = regexMutantsOnLine(result, 0)
        if (emitted.length === 0) {
          return row[2].length === 0
        }
        const index = k % emitted.length
        const replacement = emitted[index] ?? ''
        const recorded = row[2][index % row[2].length] ?? ''
        const body = replacement.slice(1, replacement.lastIndexOf('/'))
        const flags = replacement.slice(replacement.lastIndexOf('/') + 1)
        let compiles = true
        try {
          new RegExp(body, flags)
        } catch {
          compiles = false
        }
        return compiles && replacement === recorded
      }),
  )

  it.effect.prop(
    '∀row_Replacements_≡NoReplacementRepeatsItsOwnPattern',
    [ROW_ARB],
    ([row]) =>
      Effect.gen(function*() {
        const result = yield* instrumentRowAt(row, 0)
        const emitted = regexMutantsOnLine(result, 0)
        return emitted.every((replacement) => !replacement.includes(`/${row[0]}/${row[1]}`))
      }),
  )
})
