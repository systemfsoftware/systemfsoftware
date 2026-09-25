import { it, makeFeature } from '@systemfsoftware/effect-gherkin-spec'
import {
  expandOutline,
  Gherkin,
  Given,
  renderTitle,
  stringifyForTitle,
  Then,
  tokenizeTemplate,
  When,
} from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Layer, Result } from 'effect'

type RoleRow = { role: 'admin' | 'user'; count: number }

const Feature = makeFeature({ it })

Feature('Scenario outline — template expansion')
  .withLayer(Layer.empty)
  .body(({ scenario, scenarioOutline }) => {
    scenario(
      'Rows whose keys match the template expand into named scenarios',
      Gherkin.Do.pipe(
        When('the outline is expanded with each row')(
          'rows',
          () =>
            Effect.succeed(
              Result.getOrThrow(expandOutline('Valid login for <user>', [{ user: 'alice' }, { user: 'bob' }])),
            ),
        ),
        Then('each row expands into a scenario named after its values')((s, expect) =>
          expect(s.rows).toEqual([
            { row: { user: 'alice' }, title: 'Valid login for alice' },
            { row: { user: 'bob' }, title: 'Valid login for bob' },
          ])
        ),
      ),
    )

    scenario(
      'A template with several tokens expands each one',
      Gherkin.Do.pipe(
        When('the outline is expanded with all tokens present')('rows', () =>
          Effect.succeed(
            Result.getOrThrow(
              expandOutline('<user> buys <item> for <price>', [
                { user: 'alice', item: 'book', price: '$10' },
              ]),
            ),
          )),
        Then('every token in the template is replaced in the scenario name')((s, expect) =>
          expect(s.rows).toEqual([
            { row: { user: 'alice', item: 'book', price: '$10' }, title: 'alice buys book for $10' },
          ])
        ),
      ),
    )

    scenario(
      'An empty row set yields no scenarios',
      Gherkin.Do.pipe(
        When('the outline is expanded with no rows')('outcome', () => Effect.succeed(expandOutline('some name', []))),
        Then('no rows means no scenarios')((s, expect) => expect(s.outcome).toEqual(Result.succeed([]))),
      ),
    )

    scenario(
      'A template without tokens keeps its original name for each row',
      Gherkin.Do.pipe(
        When('the template without tokens is expanded')(
          'rows',
          () => Effect.succeed(Result.getOrThrow(expandOutline('Static scenario name', [{ user: 'alice' }]))),
        ),
        Then('a row without matching tokens keeps the template name')((s, expect) =>
          expect(s.rows[0]?.title).toBe('Static scenario name')
        ),
      ),
    )

    scenario(
      'A missing template tag in a row is reported as an error',
      Gherkin.Do.pipe(
        When('the outline is expanded with a missing key')(
          'outcome',
          () => Effect.succeed(expandOutline('<a> and <b>', [{ a: 'only-a' }])),
        ),
        Then('the first row missing a template tag is reported by name')((s, expect) =>
          expect(s.outcome).toEqual(
            Result.fail('scenarioOutline: template tag <b> has no matching row key on row 0 (available: a)'),
          )
        ),
      ),
    )

    scenario(
      'A later row missing a template tag is reported as an error',
      Gherkin.Do.pipe(
        When('the outline is expanded with a later row missing a key')(
          'outcome',
          () => Effect.succeed(expandOutline('<user> does <thing>', [{ user: 'a', thing: 'x' }, { user: 'b' }])),
        ),
        Then('the later row missing a template tag is reported with its row number')((s, expect) =>
          expect(s.outcome).toEqual(
            Result.fail('scenarioOutline: template tag <thing> has no matching row key on row 1 (available: user)'),
          )
        ),
      ),
    )

    scenario(
      'Typed rows retain their shape after expansion',
      Gherkin.Do.pipe(
        When('the typed rows are expanded')('rows', () =>
          Effect.succeed(
            Result.getOrThrow(
              expandOutline<RoleRow>('role=<role> count=<count>', [
                { role: 'admin', count: 3 },
                { role: 'user', count: 1 },
              ]),
            ),
          )),
        Then('the typed rows keep their values and titles through expansion')((s, expect) =>
          expect(s.rows).toEqual([
            { row: { role: 'admin', count: 3 }, title: 'role=admin count=3' },
            { row: { role: 'user', count: 1 }, title: 'role=user count=1' },
          ])
        ),
      ),
    )

    scenario(
      'A string outline value renders as itself',
      Gherkin.Do.pipe(
        When('a string value is stringified')('rendered', () => Effect.succeed(stringifyForTitle('hello'))),
        Then('a string value renders unchanged')((s, expect) => expect(s.rendered).toBe('hello')),
      ),
    )

    scenario(
      'A numeric outline value renders as its string form',
      Gherkin.Do.pipe(
        When('a numeric value is stringified')('rendered', () => Effect.succeed(stringifyForTitle(42))),
        Then('a number renders as its string form')((s, expect) => expect(s.rendered).toBe('42')),
      ),
    )

    scenario(
      'A boolean outline value renders as its string form',
      Gherkin.Do.pipe(
        When('a boolean value is stringified')(
          'rendered',
          () => Effect.succeed({ yes: stringifyForTitle(true), no: stringifyForTitle(false) }),
        ),
        Then('a boolean renders as its string form')((s, expect) =>
          expect(s.rendered).toEqual({ yes: 'true', no: 'false' })
        ),
      ),
    )

    scenario(
      'A bigint outline value renders as its string form',
      Gherkin.Do.pipe(
        When('a bigint value is stringified')('rendered', () => Effect.succeed(stringifyForTitle(10n))),
        Then('a bigint renders as its string form')((s, expect) => expect(s.rendered).toBe('10')),
      ),
    )

    scenario(
      'A null outline value renders as "null"',
      Gherkin.Do.pipe(
        When('a null value is stringified')('rendered', () => Effect.succeed(stringifyForTitle(null))),
        Then('a null value renders as the text null')((s, expect) => expect(s.rendered).toBe('null')),
      ),
    )

    scenario(
      'An object outline value renders as JSON',
      Gherkin.Do.pipe(
        When('an object and an array are stringified')(
          'rendered',
          () => Effect.succeed({ record: stringifyForTitle({ a: 1 }), list: stringifyForTitle([1, 2]) }),
        ),
        Then('an object and an array render as JSON')((s, expect) =>
          expect(s.rendered).toEqual({ record: '{"a":1}', list: '[1,2]' })
        ),
      ),
    )

    scenario(
      'An undefined outline value renders as "undefined"',
      Gherkin.Do.pipe(
        When('an undefined value is stringified')('rendered', () => Effect.succeed(stringifyForTitle(void 0))),
        Then('an undefined value renders as the text undefined')((s, expect) => expect(s.rendered).toBe('undefined')),
      ),
    )

    scenario(
      'A value that JSON cannot stringify falls back to its string form',
      Gherkin.Do.pipe(
        When('a value JSON cannot stringify is stringified')(
          'rendered',
          () => Effect.succeed(stringifyForTitle(() => 'fn')),
        ),
        Then('a function value still renders as a string, never the text undefined')((s, expect) =>
          expect({ kind: typeof s.rendered, undefinedText: s.rendered === 'undefined' }).toEqual({
            kind: 'string',
            undefinedText: false,
          })
        ),
      ),
    )

    scenario(
      'A template without angle brackets yields no tokens',
      Gherkin.Do.pipe(
        When('the template is tokenised')('tokens', () => Effect.succeed(tokenizeTemplate('hello world'))),
        Then('templates without tags yield no tokens')((s, expect) => expect(s.tokens).toEqual([])),
      ),
    )

    scenario(
      'A template with one tag yields a single token',
      Gherkin.Do.pipe(
        When('the template is tokenised')('tokens', () => Effect.succeed(tokenizeTemplate('<user> logs in'))),
        Then('one tag yields one token carrying the rest of the template')((s, expect) =>
          expect(s.tokens).toEqual([{ tag: 'user', rest: ' logs in' }])
        ),
      ),
    )

    scenario(
      'A template with several tags yields multiple tokens',
      Gherkin.Do.pipe(
        When('the template is tokenised')(
          'tokens',
          () => Effect.succeed(tokenizeTemplate('<user> buys <item> for <price>')),
        ),
        Then('several tags yield one token each in order')((s, expect) =>
          expect(s.tokens).toEqual([
            { tag: 'user', rest: ' buys <item> for <price>' },
            { tag: 'item', rest: ' for <price>' },
            { tag: 'price', rest: '' },
          ])
        ),
      ),
    )

    scenario(
      'An unclosed tag yields no tokens',
      Gherkin.Do.pipe(
        When('the template is tokenised')('tokens', () => Effect.succeed(tokenizeTemplate('<user'))),
        Then('an unclosed tag yields no tokens')((s, expect) => expect(s.tokens).toEqual([])),
      ),
    )

    scenario(
      'A lone opening bracket yields no tokens',
      Gherkin.Do.pipe(
        When('the template is tokenised')('tokens', () => Effect.succeed(tokenizeTemplate('<'))),
        Then('a lone opening bracket yields no tokens')((s, expect) => expect(s.tokens).toEqual([])),
      ),
    )

    scenario(
      'A tag followed by an unclosed bracket still yields one token',
      Gherkin.Do.pipe(
        When('the template is tokenised')('tokens', () => Effect.succeed(tokenizeTemplate('<a>hello<b'))),
        Then('a closed tag followed by an unclosed bracket yields the one complete token')((s, expect) =>
          expect(s.tokens).toEqual([{ tag: 'a', rest: 'hello<b' }])
        ),
      ),
    )

    scenario(
      'Text before the first tag is skipped during tokenisation',
      Gherkin.Do.pipe(
        When('the template is tokenised')('tokens', () => Effect.succeed(tokenizeTemplate('prefix<name>'))),
        Then('text before the first tag is not part of any token')((s, expect) =>
          expect(s.tokens).toEqual([{ tag: 'name', rest: '' }])
        ),
      ),
    )

    scenario(
      'Adjacent angle brackets yield an empty tag',
      Gherkin.Do.pipe(
        When('the template is tokenised')('tokens', () => Effect.succeed(tokenizeTemplate('<>rest'))),
        Then('adjacent brackets yield a token with an empty tag')((s, expect) =>
          expect(s.tokens).toEqual([{ tag: '', rest: 'rest' }])
        ),
      ),
    )

    scenario(
      'Tokens after the first are tokenised in sequence',
      Gherkin.Do.pipe(
        When('the template is tokenised')('tokens', () => Effect.succeed(tokenizeTemplate('<a>mid<b>end'))),
        Then('each later token carries only the text up to the next tag')((s, expect) =>
          expect(s.tokens).toEqual([
            { tag: 'a', rest: 'mid<b>end' },
            { tag: 'b', rest: 'end' },
          ])
        ),
      ),
    )

    scenario(
      'All tokens are replaced when every key is present',
      Gherkin.Do.pipe(
        When('the title is rendered with every key present')(
          'title',
          () => Effect.succeed(renderTitle('<a> and <b>', { a: '1', b: '2' })),
        ),
        Then('every token with a matching key is replaced')((s, expect) => expect(s.title).toBe('1 and 2')),
      ),
    )

    scenario(
      'A missing key leaves its token unreplaced',
      Gherkin.Do.pipe(
        When('the title is rendered with a key missing')(
          'title',
          () => Effect.succeed(renderTitle('<a> missing <b>', { a: 'found' })),
        ),
        Then('a token with no matching key is left in place')((s, expect) => expect(s.title).toBe('found missing <b>')),
      ),
    )

    scenario(
      'A template without tokens is returned unchanged',
      Gherkin.Do.pipe(
        When('the title is rendered from a template without tokens')(
          'title',
          () => Effect.succeed(renderTitle('no tokens', { x: 'y' })),
        ),
        Then('a template without tokens is returned unchanged')((s, expect) => expect(s.title).toBe('no tokens')),
      ),
    )

    scenario(
      'Non-string row values are stringified during title rendering',
      Gherkin.Do.pipe(
        When('titles are rendered from non-string values')(
          'rendered',
          () =>
            Effect.succeed({
              n: renderTitle('<n> items', { n: 42 }),
              flag: renderTitle('<flag> active', { flag: true }),
            }),
        ),
        Then('numbers and booleans are stringified in the rendered title')((s, expect) =>
          expect(s.rendered).toEqual({ n: '42 items', flag: 'true active' })
        ),
      ),
    )

    scenario(
      'A custom stringifier controls how values render in titles',
      Gherkin.Do.pipe(
        When('the title is rendered with a custom stringifier')(
          'title',
          () => Effect.succeed(renderTitle('<x>', { x: 'a' }, () => 'CUSTOM')),
        ),
        Then('the custom stringifier decides how the value renders')((s, expect) => expect(s.title).toBe('CUSTOM')),
      ),
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
          Then('the user is present')(({ present }, expect) => expect(present).toBe(row.user)),
        ),
    )
  })
