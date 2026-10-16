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
  When,
} from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Layer, Result } from 'effect'

const customStringifier = <A = unknown>(value: A) => `custom:${String(value)}`

const Feature = makeFeature({ it })

Feature('Scenario outline — edge cases and title stringification')
  .withLayer(Layer.empty)
  .body(({ scenario, scenarioOutline }) => {
    scenario(
      'Title stringification safely formats primitive and complex JavaScript values',
      Gherkin.Do.pipe(
        When('every primitive and complex value is stringified')('rendered', () =>
          Effect.succeed({
            big: stringifyForTitle(123n),
            symbol: stringifyForTitle(Symbol.for('test_sym')),
            nothing: stringifyForTitle(null),
            missing: stringifyForTitle(void 0),
            record: stringifyForTitle({ id: 'abc', count: 2 }),
            list: stringifyForTitle([1, 2, 3]),
          })),
        Then('each value stringifies to its title form')((s, expect) =>
          expect(s.rendered).toEqual({
            big: '123',
            symbol: 'Symbol(test_sym)',
            nothing: 'null',
            missing: 'undefined',
            record: '{"id":"abc","count":2}',
            list: '[1,2,3]',
          })
        ),
      ),
    )

    scenario(
      'Template tokenizer extracts all bracketed tags and ignores unclosed markers',
      Gherkin.Do.pipe(
        When('the template is tokenised')(
          'tags',
          () =>
            Effect.succeed(tokenizeTemplate('<first> between <second> trailing <unclosed').map((token) => token.tag)),
        ),
        Then('only the closed tags are tokenised')((s, expect) => expect(s.tags).toEqual(['first', 'second'])),
      ),
    )

    scenario(
      'Expanding an outline with missing row keys returns a descriptive failure result',
      Gherkin.Do.pipe(
        When('the outline is expanded with a missing row key')(
          'outcome',
          () => Effect.succeed(expandOutline('User <user> has role <role>', [{ user: 'alice' }])),
        ),
        Then('the expansion fails naming the missing tag and the available keys')((s, expect) =>
          expect(s.outcome).toEqual(
            Result.fail('scenarioOutline: template tag <role> has no matching row key on row 0 (available: user)'),
          )
        ),
      ),
    )

    scenario(
      'Custom title stringifiers override standard value representation',
      Gherkin.Do.pipe(
        When('the title is rendered with a custom stringifier')(
          'title',
          () => Effect.succeed(renderTitle('Processing item <id>', { id: 99 }, customStringifier)),
        ),
        Then('the custom stringifier decides how the value renders')((s, expect) =>
          expect(s.title).toBe('Processing item custom:99')
        ),
      ),
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
          Then('the value runtime type matches the expectation')((s, expect) =>
            expect(typeof s.val).toBe(row.expectedType)
          ),
        ),
    )
  })
