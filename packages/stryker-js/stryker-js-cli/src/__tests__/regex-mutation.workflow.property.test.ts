import { describe, it } from '@systemfsoftware/effect-gherkin-spec'
import { Equal } from 'effect'
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
  ['[^abc]', '', ['/[abc]/']],
  ['[a-z]', '', ['/[^a-z]/']],
  ['[^a-z0-9_]', '', ['/[a-z0-9_]/']],
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
  ['\\p{Script=Greek}', 'u', ['/\\P{Script=Greek}/u']],
  ['a+', '', ['/a/']],
  ['a*', '', ['/a/']],
  ['a?', '', ['/a/']],
  ['a{2}', '', ['/a/']],
  ['a{2,}', '', ['/a/']],
  ['a{2,3}', '', ['/a/']],
  ['a+?', '', ['/a/']],
  ['a*?', '', ['/a/']],
  ['a??', '', ['/a/']],
  ['(ab)+', '', ['/(ab)/']],
  ['[ab]+', '', ['/[ab]/', '/[^ab]+/']],
  ['\\d{3}', '', ['/\\d/', '/\\D{3}/']],
  ['(?=a)', '', ['/(?!a)/']],
  ['(?!a)', '', ['/(?=a)/']],
  ['(?<=a)b', '', ['/(?<!a)b/']],
  ['(?<!a)b', '', ['/(?<=a)b/']],
  ['(foo|bar)', '', []],
  ['(?:foo)', '', []],
  ['(?<n>a)', '', []],
  ['\\1', '', []],
  ['(a)(b)', '', []],
  ['^\\d{3}-\\d{4}$', '', [
    '/\\d{3}-\\d{4}$/',
    '/^\\d{3}-\\d{4}/',
    '/^\\d-\\d{4}$/',
    '/^\\D{3}-\\d{4}$/',
    '/^\\d{3}-\\d$/',
    '/^\\d{3}-\\D{4}$/',
  ]],
  ['^[\\w.+-]+@[\\w-]+\\.[\\w.]{2,}$', '', [
    '/[\\w.+-]+@[\\w-]+\\.[\\w.]{2,}$/',
    '/^[\\w.+-]+@[\\w-]+\\.[\\w.]{2,}/',
    '/^[\\w.+-]@[\\w-]+\\.[\\w.]{2,}$/',
    '/^[^\\w.+-]+@[\\w-]+\\.[\\w.]{2,}$/',
    '/^[\\W.+-]+@[\\w-]+\\.[\\w.]{2,}$/',
    '/^[\\w.+-]+@[\\w-]\\.[\\w.]{2,}$/',
    '/^[\\w.+-]+@[^\\w-]+\\.[\\w.]{2,}$/',
    '/^[\\w.+-]+@[\\W-]+\\.[\\w.]{2,}$/',
    '/^[\\w.+-]+@[\\w-]+\\.[\\w.]$/',
    '/^[\\w.+-]+@[\\w-]+\\.[^\\w.]{2,}$/',
    '/^[\\w.+-]+@[\\w-]+\\.[\\W.]{2,}$/',
  ]],
  ['^https?:\\/\\/[^\\s]+$', '', [
    '/https?:\\/\\/[^\\s]+$/',
    '/^https?:\\/\\/[^\\s]+/',
    '/^https:\\/\\/[^\\s]+$/',
    '/^https?:\\/\\/[^\\s]$/',
    '/^https?:\\/\\/[\\s]+$/',
    '/^https?:\\/\\/[^\\S]+$/',
  ]],
  ['\\s*([A-Z][a-z]+)\\s*', '', [
    '/\\s([A-Z][a-z]+)\\s*/',
    '/\\S*([A-Z][a-z]+)\\s*/',
    '/\\s*([^A-Z][a-z]+)\\s*/',
    '/\\s*([A-Z][a-z])\\s*/',
    '/\\s*([A-Z][^a-z]+)\\s*/',
    '/\\s*([A-Z][a-z]+)\\s/',
    '/\\s*([A-Z][a-z]+)\\S*/',
  ]],
  ['^(?:[a-f0-9]{8})-(?:[a-f0-9]{4})$', '', [
    '/(?:[a-f0-9]{8})-(?:[a-f0-9]{4})$/',
    '/^(?:[a-f0-9]{8})-(?:[a-f0-9]{4})/',
    '/^(?:[a-f0-9])-(?:[a-f0-9]{4})$/',
    '/^(?:[^a-f0-9]{8})-(?:[a-f0-9]{4})$/',
    '/^(?:[a-f0-9]{8})-(?:[a-f0-9])$/',
    '/^(?:[a-f0-9]{8})-(?:[^a-f0-9]{4})$/',
  ]],
  ['[^\\r\\n]*', '', ['/[^\\r\\n]/', '/[\\r\\n]*/']],
  ['(?<year>\\d{4})-(?<month>\\d{2})', '', [
    '/(?<year>\\d)-(?<month>\\d{2})/',
    '/(?<year>\\D{4})-(?<month>\\d{2})/',
    '/(?<year>\\d{4})-(?<month>\\d)/',
    '/(?<year>\\d{4})-(?<month>\\D{2})/',
  ]],
  ['^\\/api\\/v\\d+\\/.*$', '', [
    '/\\/api\\/v\\d+\\/.*$/',
    '/^\\/api\\/v\\d+\\/.*/',
    '/^\\/api\\/v\\d\\/.*$/',
    '/^\\/api\\/v\\D+\\/.*$/',
    '/^\\/api\\/v\\d+\\/.$/',
  ]],
  ['\\bfoo\\b', '', []],
  ['a|b|c', '', []],
  ['[[:alpha:]]', '', ['/[^[:alpha:]]/']],
  ['\\u0041', '', []],
  ['\\x41', '', []],
  ['.*', '', ['/./']],
  ['.+', '', ['/./']],
  ['[]', '', ['/[^]/']],
  ['abc', '', []],
]

const SOURCE = CORPUS.map(([pattern, flags], index) => `export const v${index} = /${pattern}/${flags}`).join('\n')

interface RegexMutant {
  readonly mutatorName: string
  readonly replacement: string
  readonly location: { readonly start: { readonly line: number } }
}

const replacementsByLine = (mutants: readonly RegexMutant[]): readonly (readonly string[])[] => {
  const byLine = new Map<number, string[]>()
  for (const mutant of mutants) {
    if (mutant.mutatorName !== 'Regex') continue
    const line = mutant.location.start.line
    const existing = byLine.get(line)
    if (existing === undefined) byLine.set(line, [mutant.replacement])
    else existing.push(mutant.replacement)
  }
  return CORPUS.map((_row, index) => byLine.get(index) ?? [])
}

const uncompilableReplacements = (
  rows: typeof CORPUS,
): readonly string[] =>
  rows.flatMap(([pattern, flags, replacements]) =>
    replacements.filter((replacement) => {
      const body = replacement.slice(1, replacement.lastIndexOf('/'))
      try {
        new RegExp(body, flags)
        return false
      } catch {
        return true
      }
    }).map((replacement) => `/${pattern}/${flags} -> ${replacement}`)
  )

describe('regex mutation', () => {
  it.effect.prop(
    '∀c_CorpusModule_≡RecordedReplacementsInEmissionOrder',
    [fc.constant(SOURCE)],
    ([source]) =>
      Effect.gen(function*() {
        const result = yield* instrument([{ name: '/tmp/regex-corpus.ts', content: source, mutate: true }], {
          ignorers: [],
          excludedMutations: [],
          parsers: [],
        })
        const actual = replacementsByLine(result.mutants).map((replacements) => [...replacements])
        const recorded = CORPUS.map(([, , replacements]) => [...replacements])
        return Equal.equals(actual, recorded)
      }),
  )

  it.prop(
    '∀c_RecordedTable_≡EveryReplacementCompiles',
    [fc.constant(CORPUS)],
    ([rows]) => uncompilableReplacements(rows).length === 0,
  )

  it.prop(
    '∀c_RecordedTable_≡NoReplacementRepeatsItsPattern',
    [fc.constant(CORPUS)],
    ([rows]) => rows.every(([pattern, flags, replacements]) => !replacements.includes(`/${pattern}/${flags}`)),
  )
})
