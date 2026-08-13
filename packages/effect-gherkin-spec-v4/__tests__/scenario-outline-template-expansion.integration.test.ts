/**
 * Scenario outline — template expansion.
 *
 * Drives the `scenarioOutline` use case on `makeFeature` to prove that the
 * template substitution, tokenisation, and row-stringification helpers all
 * compose into a working Outline loop. Pure helpers (`tokenizeTemplate`,
 * `renderTitle`, `stringifyForTitle`) are reached through the package barrel,
 * exactly as a downstream consumer would import them.
 */
import { it, layer, makeFeature } from '@systemfsoftware/effect-gherkin-spec-v4'
import { Effect, Result } from 'effect'
import { expect } from 'vitest'
import { expandOutline, Gherkin, Given, renderTitle, stringifyForTitle, Then, tokenizeTemplate } from '../src/mod.js'

const Feature = makeFeature({ it, layer })

Feature('Scenario outline — template expansion').body(({ scenario, scenarioOutline }) => {
  scenario(
    'Should expand rows when rows have matching keys',
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
    'Should handle multiple tokens when template has several',
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
    'Should return empty when rows empty',
    Effect.sync(() => {
      expect(expandOutline('some name', [])).toEqual(Result.succeed([]))
    }),
  )

  scenario(
    'Should use template name when no tokens present',
    Effect.sync(() => {
      const rows = Result.getOrThrow(
        expandOutline('Static scenario name', [{ user: 'alice' }]),
      )
      expect(rows[0]?.title).toBe('Static scenario name')
    }),
  )

  scenario(
    'Should report missing key when template tag missing from row',
    Effect.sync(() => {
      const result = expandOutline('<a> and <b>', [{ a: 'only-a' }])
      expect(result).toEqual(
        Result.fail(
          'scenarioOutline: template tag <b> has no matching row key on row 0 (available: a)',
        ),
      )
    }),
  )

  scenario(
    'Should report missing key when a later row omits a template tag',
    Effect.sync(() => {
      const result = expandOutline('<user> does <thing>', [
        { user: 'a', thing: 'x' },
        { user: 'b' },
      ])
      expect(result).toEqual(
        Result.fail(
          'scenarioOutline: template tag <thing> has no matching row key on row 1 (available: user)',
        ),
      )
    }),
  )

  scenario(
    'Should preserve row as typed when rows have typed shape',
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
    'Should return string when value is string',
    Effect.sync(() => {
      expect(stringifyForTitle('hello')).toBe('hello')
    }),
  )

  scenario(
    'Should stringify number when value is number',
    Effect.sync(() => {
      expect(stringifyForTitle(42)).toBe('42')
    }),
  )

  scenario(
    'Should stringify boolean when value is boolean',
    Effect.sync(() => {
      expect(stringifyForTitle(true)).toBe('true')
      expect(stringifyForTitle(false)).toBe('false')
    }),
  )

  scenario(
    'Should stringify bigint when value is bigint',
    Effect.sync(() => {
      expect(stringifyForTitle(10n)).toBe('10')
    }),
  )

  scenario(
    'Should return null literal when value is null',
    Effect.sync(() => {
      expect(stringifyForTitle(null)).toBe('null')
    }),
  )

  scenario(
    'Should JSON-stringify when value is object',
    Effect.sync(() => {
      expect(stringifyForTitle({ a: 1 })).toBe('{"a":1}')
      expect(stringifyForTitle([1, 2])).toBe('[1,2]')
    }),
  )

  scenario(
    'Should return undefined literal when value is undefined',
    Effect.sync(() => {
      expect(stringifyForTitle(void 0)).toBe('undefined')
    }),
  )

  scenario(
    'Should fall back to String when JSON.stringify returns undefined',
    Effect.sync(() => {
      const rendered = stringifyForTitle(() => 'fn')
      expect(typeof rendered).toBe('string')
      expect(rendered).not.toBe('undefined')
    }),
  )

  scenario(
    'Should return empty when no angle brackets',
    Effect.sync(() => {
      expect(tokenizeTemplate('hello world')).toEqual([])
    }),
  )

  scenario(
    'Should extract single token when one tag present',
    Effect.sync(() => {
      const result = tokenizeTemplate('<user> logs in')
      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({ tag: 'user', rest: ' logs in' })
    }),
  )

  scenario(
    'Should extract multiple tokens when several tags present',
    Effect.sync(() => {
      const result = tokenizeTemplate('<user> buys <item> for <price>')
      expect(result).toHaveLength(3)
      expect(result[0]).toEqual({ tag: 'user', rest: ' buys <item> for <price>' })
      expect(result[1]).toEqual({ tag: 'item', rest: ' for <price>' })
      expect(result[2]).toEqual({ tag: 'price', rest: '' })
    }),
  )

  scenario(
    'Should return empty when unclosed tag',
    Effect.sync(() => {
      expect(tokenizeTemplate('<user')).toEqual([])
    }),
  )

  scenario(
    'Should return empty when only open bracket',
    Effect.sync(() => {
      expect(tokenizeTemplate('<')).toEqual([])
    }),
  )

  scenario(
    'Should extract tag when no closing bracket in rest',
    Effect.sync(() => {
      const result = tokenizeTemplate('<a>hello<b')
      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({ tag: 'a', rest: 'hello<b' })
    }),
  )

  scenario(
    'Should skip text before first open bracket when text precedes tag',
    Effect.sync(() => {
      const result = tokenizeTemplate('prefix<name>')
      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({ tag: 'name', rest: '' })
    }),
  )

  scenario(
    'Should handle empty tag when angle brackets adjacent',
    Effect.sync(() => {
      const result = tokenizeTemplate('<>rest')
      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({ tag: '', rest: 'rest' })
    }),
  )

  scenario(
    'Should continue after first token when more tokens follow',
    Effect.sync(() => {
      const result = tokenizeTemplate('<a>mid<b>end')
      expect(result).toHaveLength(2)
      expect(result[0]).toEqual({ tag: 'a', rest: 'mid<b>end' })
      expect(result[1]).toEqual({ tag: 'b', rest: 'end' })
    }),
  )

  scenario(
    'Should replace all tokens when all keys present',
    Effect.sync(() => {
      expect(renderTitle('<a> and <b>', { a: '1', b: '2' })).toBe('1 and 2')
    }),
  )

  scenario(
    'Should leave token when key not in row',
    Effect.sync(() => {
      expect(renderTitle('<a> missing <b>', { a: 'found' })).toBe('found missing <b>')
    }),
  )

  scenario(
    'Should return template when no tokens',
    Effect.sync(() => {
      expect(renderTitle('no tokens', { x: 'y' })).toBe('no tokens')
    }),
  )

  scenario(
    'Should stringify non-string values when row has mixed types',
    Effect.sync(() => {
      expect(renderTitle('<n> items', { n: 42 })).toBe('42 items')
      expect(renderTitle('<flag> active', { flag: true })).toBe('true active')
    }),
  )

  scenario(
    'Should use custom stringifier when provided',
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
