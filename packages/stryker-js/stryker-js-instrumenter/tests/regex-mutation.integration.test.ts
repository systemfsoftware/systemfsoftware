import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'
import { expect } from 'vitest'

import { instrument } from './__fixtures__/instrument.js'

/**
 * The Regex mutator's complete observable output, recorded from the shipped
 * implementation rather than written by hand.
 *
 * Each row is `[pattern, flags, replacements]`, and `replacements` is every
 * mutant the engine emits for that literal, in emission order — because a
 * mutant's identity in a report is its position, so a reordering is a behaviour
 * change even when the set is unchanged.
 *
 * This table exists to hold a replacement implementation to what the current one
 * actually does. Hand-written expectations would encode what someone believed
 * the mutator did; the rows that expect NOTHING carry most of the value, since
 * an eager replacement fails there first — alternation, grouping, backreferences
 * and bare anchors are all deliberately left alone.
 */
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

const Feature = makeFeature({ it, layer })

Feature('Regex mutation characterization')
  .body(({ scenario }) => {
    scenario(
      'The full corpus yields exactly its recorded replacements in order',
      Gherkin.Do.pipe(
        Given('a module declaring every corpus pattern as a literal')('source', () => Effect.succeed(SOURCE)),
        When('it is instrumented')(
          'result',
          ({ source }: { source: string }) =>
            instrument([{ name: '/tmp/regex-corpus.ts', content: source, mutate: true }], {
              ignorers: [],
              excludedMutations: [],
            }),
        ),
        Then('every pattern yields exactly its recorded replacements')((
          { result }: { result: { mutants: readonly RegexMutant[] } },
        ) =>
          Effect.sync(() => {
            const actual = replacementsByLine(result.mutants)
            const recorded = CORPUS.map(([, , replacements]) => [...replacements])
            // Compared as one value so a diff names every pattern that moved,
            // not just the first.
            expect(actual.map((r) => [...r])).toStrictEqual(recorded)
          })
        ),
      ),
    )

    scenario(
      'Every recorded replacement compiles as a regular expression',
      Gherkin.Do.pipe(
        Given('the recorded replacements')('rows', () => Effect.succeed(CORPUS)),
        Then('each one compiles as a regular expression')(({ rows }: { rows: typeof CORPUS }) =>
          Effect.sync(() => {
            const uncompilable = rows.flatMap(([pattern, flags, replacements]) =>
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
            expect(uncompilable).toStrictEqual([])
          })
        ),
      ),
    )

    scenario(
      'No replacement repeats its original pattern',
      Gherkin.Do.pipe(
        Given('the recorded replacements')('rows', () => Effect.succeed(CORPUS)),
        Then('no replacement equals the literal it came from')(({ rows }: { rows: typeof CORPUS }) =>
          Effect.sync(() => {
            const identities = rows
              .filter(([pattern, flags, replacements]) => replacements.includes(`/${pattern}/${flags}`))
              .map(([pattern]) => pattern)
            expect(identities).toStrictEqual([])
          })
        ),
      ),
    )
  })
