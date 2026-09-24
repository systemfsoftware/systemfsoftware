import {
  expandOutline,
  Gherkin,
  Given,
  it,
  makeFeature,
  renderTitle,
  stringifyForTitle,
  Then,
  tokenizeTemplate,
} from '@systemfsoftware/effect-gherkin-spec'
import { expect } from '@systemfsoftware/vitest'
import { Effect, Layer, Result } from 'effect'

const Feature = makeFeature({ it })

Feature('Scenario outline — edge cases and title stringification')
  .withLayer(Layer.empty)
  .body(({ scenario, scenarioOutline }) => {
    scenario(
      'Title stringification safely formats primitive and complex JavaScript values',
      Effect.sync(() => {
        expect(stringifyForTitle(123n)).toBe('123')
        expect(stringifyForTitle(Symbol.for('test_sym'))).toBe('Symbol(test_sym)')
        expect(stringifyForTitle(null)).toBe('null')
        expect(stringifyForTitle(void 0)).toBe('undefined')
        expect(stringifyForTitle({ id: 'abc', count: 2 })).toBe('{"id":"abc","count":2}')
        expect(stringifyForTitle([1, 2, 3])).toBe('[1,2,3]')
      }),
    )

    scenario(
      'Template tokenizer extracts all bracketed tags and ignores unclosed markers',
      Effect.sync(() => {
        const tokens = tokenizeTemplate('<first> between <second> trailing <unclosed')
        expect(tokens.map((t) => t.tag)).toEqual(['first', 'second'])
      }),
    )

    scenario(
      'Expanding an outline with missing row keys returns a descriptive failure result',
      Effect.sync(() => {
        const result = expandOutline(
          'User <user> has role <role>',
          [{ user: 'alice' }],
        )

        Result.match(result, {
          onFailure: (err) => {
            expect(err).toContain('template tag <role> has no matching row key on row 0')
            expect(err).toContain('(available: user)')
          },
          onSuccess: () => expect.unreachable('Expected missing key to fail expansion'),
        })
      }),
    )

    scenario(
      'Custom title stringifiers override standard value representation',
      Effect.sync(() => {
        const customStringifier = <A = unknown>(val: A) => `custom:${String(val)}`
        const title = renderTitle(
          'Processing item <id>',
          { id: 99 },
          customStringifier,
        )
        expect(title).toBe('Processing item custom:99')
      }),
    )

    scenarioOutline(
      'Handling exotic value types for token <tag> resulting in type <expectedType>',
      [
        { tag: 'alpha', expectedType: 'string', value: 'hello' },
        { tag: 42, expectedType: 'number', value: 42 },
        { tag: true, expectedType: 'boolean', value: true },
      ] as const,
      (row) =>
        Gherkin.Do.pipe(
          Given('an exotic input value')('val', () => Effect.succeed(row.value)),
          Then('the value runtime type matches the expectation')((s) => {
            expect(typeof s.val).toBe(row.expectedType)
          }),
        ),
    )
  })
