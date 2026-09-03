/**
 * Scenario outline — template expansion.
 *
 * Drives the `scenarioOutline` use case on `makeFeature` to prove that the
 * template substitution, tokenisation, and row-stringification helpers all
 * compose into a working Outline loop. Pure helpers (`tokenizeTemplate`,
 * `renderTitle`, `stringifyForTitle`) are reached through the package barrel,
 * exactly as a downstream consumer would import them.
 */
import { it, layer, makeFeature } from '@systemfsoftware/effect-gherkin-spec'
import {
  expandOutline,
  Gherkin,
  Given,
  renderTitle,
  stringifyForTitle,
  Then,
  tokenizeTemplate,
} from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Result } from 'effect'
import { expect } from 'vitest'

const Feature = makeFeature({ it, layer })

Feature('Scenario outline — template expansion').body(({ scenario, scenarioOutline }) => {
  scenario(
    'Rows whose keys match the template expand into named scenarios',
    Effect.sync(() => {
      const rows = Result.getOrThrow(
        expandOutline('Valid login for <user>', [{ user: 'alice' }, { user: 'bob' }]),
      )
      expect(rows).toHaveLength(2)
      expect(rows[0]).toEqual({ row: { user: 'alice' }, title: 'Valid login for alice' })
      expect(rows[1]).toEqual({ row: { user: 'bob' }, title: 'Valid login for bob' })
    }),
  )

  scenario(
    'A template with several tokens expands each one',
    Effect.sync(() => {
      const rows = Result.getOrThrow(
        expandOutline('<user> buys <item> for <price>', [
          { user: 'alice', item: 'book', price: '$10' },
        ]),
      )
      expect(rows).toHaveLength(1)
      expect(rows[0]).toEqual({
        row: { user: 'alice', item: 'book', price: '$10' },
        title: 'alice buys book for $10',
      })
    }),
  )

  scenario(
    'An empty row set yields no scenarios',
    Effect.sync(() => {
      expect(Result.getOrThrow(expandOutline('some name', []))).toEqual([])
    }),
  )

  scenario(
    'A template without tokens keeps its original name for each row',
    Effect.sync(() => {
      const rows = Result.getOrThrow(
        expandOutline('Static scenario name', [{ user: 'alice' }]),
      )
      expect(rows[0]?.title).toBe('Static scenario name')
    }),
  )

  scenario(
    'A missing template tag in a row is reported as an error',
    Effect.sync(() => {
      const result = expandOutline('<a> and <b>', [{ a: 'only-a' }])
      if (!Result.isFailure(result)) throw new Error('Expected Result.failure but got Result.success')
      expect(result.failure).toBe(
        'scenarioOutline: template tag <b> has no matching row key on row 0 (available: a)',
      )
    }),
  )

  scenario(
    'A later row missing a template tag is reported as an error',
    Effect.sync(() => {
      const result = expandOutline('<user> does <thing>', [
        { user: 'a', thing: 'x' },
        { user: 'b' },
      ])
      if (!Result.isFailure(result)) throw new Error('Expected Result.failure but got Result.success')
      expect(result.failure).toBe(
        'scenarioOutline: template tag <thing> has no matching row key on row 1 (available: user)',
      )
    }),
  )

  scenario(
    'Typed rows retain their shape after expansion',
    Effect.sync(() => {
      type Row = { role: 'admin' | 'user'; count: number }
      const rows = Result.getOrThrow(
        expandOutline<Row>('role=<role> count=<count>', [
          { role: 'admin', count: 3 },
          { role: 'user', count: 1 },
        ]),
      )
      expect(rows).toHaveLength(2)
      expect(rows[0]?.row).toEqual({ role: 'admin', count: 3 })
      expect(rows[0]?.title).toBe('role=admin count=3')
    }),
  )

  scenario(
    'A string outline value renders as itself',
    Effect.sync(() => {
      expect(stringifyForTitle('hello')).toBe('hello')
    }),
  )

  scenario(
    'A numeric outline value renders as its string form',
    Effect.sync(() => {
      expect(stringifyForTitle(42)).toBe('42')
    }),
  )

  scenario(
    'A boolean outline value renders as its string form',
    Effect.sync(() => {
      expect(stringifyForTitle(true)).toBe('true')
      expect(stringifyForTitle(false)).toBe('false')
    }),
  )

  scenario(
    'A bigint outline value renders as its string form',
    Effect.sync(() => {
      expect(stringifyForTitle(10n)).toBe('10')
    }),
  )

  scenario(
    'A null outline value renders as "null"',
    Effect.sync(() => {
      expect(stringifyForTitle(null)).toBe('null')
    }),
  )

  scenario(
    'An object outline value renders as JSON',
    Effect.sync(() => {
      expect(stringifyForTitle({ a: 1 })).toBe('{"a":1}')
      expect(stringifyForTitle([1, 2])).toBe('[1,2]')
    }),
  )

  scenario(
    'An undefined outline value renders as "undefined"',
    Effect.sync(() => {
      expect(stringifyForTitle(void 0)).toBe('undefined')
    }),
  )

  scenario(
    'A value that JSON cannot stringify falls back to its string form',
    Effect.sync(() => {
      const rendered = stringifyForTitle(() => 'fn')
      expect(typeof rendered).toBe('string')
      expect(rendered).not.toBe('undefined')
    }),
  )

  scenario(
    'A template without angle brackets yields no tokens',
    Effect.sync(() => {
      expect(tokenizeTemplate('hello world')).toEqual([])
    }),
  )

  scenario(
    'A template with one tag yields a single token',
    Effect.sync(() => {
      const result = tokenizeTemplate('<user> logs in')
      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({ tag: 'user', rest: ' logs in' })
    }),
  )

  scenario(
    'A template with several tags yields multiple tokens',
    Effect.sync(() => {
      const result = tokenizeTemplate('<user> buys <item> for <price>')
      expect(result).toHaveLength(3)
      expect(result[0]).toEqual({ tag: 'user', rest: ' buys <item> for <price>' })
      expect(result[1]).toEqual({ tag: 'item', rest: ' for <price>' })
      expect(result[2]).toEqual({ tag: 'price', rest: '' })
    }),
  )

  scenario(
    'An unclosed tag yields no tokens',
    Effect.sync(() => {
      expect(tokenizeTemplate('<user')).toEqual([])
    }),
  )

  scenario(
    'A lone opening bracket yields no tokens',
    Effect.sync(() => {
      expect(tokenizeTemplate('<')).toEqual([])
    }),
  )

  scenario(
    'A tag followed by an unclosed bracket still yields one token',
    Effect.sync(() => {
      const result = tokenizeTemplate('<a>hello<b')
      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({ tag: 'a', rest: 'hello<b' })
    }),
  )

  scenario(
    'Text before the first tag is skipped during tokenisation',
    Effect.sync(() => {
      const result = tokenizeTemplate('prefix<name>')
      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({ tag: 'name', rest: '' })
    }),
  )

  scenario(
    'Adjacent angle brackets yield an empty tag',
    Effect.sync(() => {
      const result = tokenizeTemplate('<>rest')
      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({ tag: '', rest: 'rest' })
    }),
  )

  scenario(
    'Tokens after the first are tokenised in sequence',
    Effect.sync(() => {
      const result = tokenizeTemplate('<a>mid<b>end')
      expect(result).toHaveLength(2)
      expect(result[0]).toEqual({ tag: 'a', rest: 'mid<b>end' })
      expect(result[1]).toEqual({ tag: 'b', rest: 'end' })
    }),
  )

  scenario(
    'All tokens are replaced when every key is present',
    Effect.sync(() => {
      expect(renderTitle('<a> and <b>', { a: '1', b: '2' })).toBe('1 and 2')
    }),
  )

  scenario(
    'A missing key leaves its token unreplaced',
    Effect.sync(() => {
      expect(renderTitle('<a> missing <b>', { a: 'found' })).toBe('found missing <b>')
    }),
  )

  scenario(
    'A template without tokens is returned unchanged',
    Effect.sync(() => {
      expect(renderTitle('no tokens', { x: 'y' })).toBe('no tokens')
    }),
  )

  scenario(
    'Non-string row values are stringified during title rendering',
    Effect.sync(() => {
      expect(renderTitle('<n> items', { n: 42 })).toBe('42 items')
      expect(renderTitle('<flag> active', { flag: true })).toBe('true active')
    }),
  )

  scenario(
    'A custom stringifier controls how values render in titles',
    Effect.sync(() => {
      expect(renderTitle('<x>', { x: 'a' }, () => 'CUSTOM')).toBe('CUSTOM')
    }),
  )

  scenarioOutline(
    '<user> authenticates successfully',
    [
      { user: 'alice' },
      { user: 'bob' },
    ] as const,
    (row) =>
      Gherkin.Do.pipe(
        Given(`user ${row.user} exists`)(`present`, () => Effect.succeed(row.user)),
        Then('the user is present')(({ present }) =>
          Effect.sync(() => {
            expect(present).toBe(row.user)
          })
        ),
      ),
  )
})
