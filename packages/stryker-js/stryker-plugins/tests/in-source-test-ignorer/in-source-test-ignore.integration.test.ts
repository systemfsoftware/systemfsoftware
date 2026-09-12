import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'
import { expect } from 'vitest'

import {
  decideInSourceTestIgnore,
  IN_SOURCE_TEST_IGNORED,
  isInSourceTestGuard,
} from '@systemfsoftware/stryker-plugins/in-source-test-ignorer'

import { binaryOf, guardOf, identifier, importMetaMember, metaOf } from '../__fixtures__/InSourceTestAst.fixtures.js'

const Feature = makeFeature({ it, layer })

Feature('In-source Vitest test guard — the if-statement shape and the ancestor walk')
  .body(({ scenario }) => {
    scenario(
      'A bare vitest flag as the guard condition matches',
      Gherkin.Do.pipe(
        Given('an if-statement whose test is bare `import.meta.vitest`')(
          'node',
          () => Effect.sync(() => guardOf(importMetaMember('vitest'))),
        ),
        When('isInSourceTestGuard runs')('result', (s) => Effect.sync(() => isInSourceTestGuard(s.node))),
        Then('it returns true')((s) =>
          Effect.sync(() => {
            expect(s.result).toBe(true)
          })
        ),
      ),
    )

    scenario(
      'A vitest flag on the left side of a comparison matches',
      Gherkin.Do.pipe(
        Given('an if-statement whose test is `import.meta.vitest === undefined`')(
          'node',
          () => Effect.sync(() => guardOf(binaryOf(importMetaMember('vitest'), identifier('undefined')))),
        ),
        When('isInSourceTestGuard runs')('result', (s) => Effect.sync(() => isInSourceTestGuard(s.node))),
        Then('it returns true')((s) =>
          Effect.sync(() => {
            expect(s.result).toBe(true)
          })
        ),
      ),
    )

    scenario(
      'A vitest flag on the right side of a comparison matches',
      Gherkin.Do.pipe(
        Given('an if-statement whose test is `undefined === import.meta.vitest`')(
          'node',
          () => Effect.sync(() => guardOf(binaryOf(identifier('undefined'), importMetaMember('vitest')))),
        ),
        When('isInSourceTestGuard runs')('result', (s) => Effect.sync(() => isInSourceTestGuard(s.node))),
        Then('it returns true')((s) =>
          Effect.sync(() => {
            expect(s.result).toBe(true)
          })
        ),
      ),
    )

    scenario(
      'A flag for a different meta property does not match',
      Gherkin.Do.pipe(
        Given('an if-statement whose test is `import.meta.env`')(
          'node',
          () => Effect.sync(() => guardOf(importMetaMember('env'))),
        ),
        When('isInSourceTestGuard runs')('result', (s) => Effect.sync(() => isInSourceTestGuard(s.node))),
        Then('it returns false')((s) =>
          Effect.sync(() => {
            expect(s.result).toBe(false)
          })
        ),
      ),
    )

    scenario(
      'A vitest flag on a non-import meta does not match',
      Gherkin.Do.pipe(
        Given('an if-statement whose test is `require.meta.vitest`')('node', () =>
          Effect.sync(() =>
            guardOf({
              type: 'MemberExpression',
              object: metaOf('require', 'meta'),
              property: identifier('vitest'),
            })
          )),
        When('isInSourceTestGuard runs')('result', (s) => Effect.sync(() => isInSourceTestGuard(s.node))),
        Then('it returns false')((s) =>
          Effect.sync(() => {
            expect(s.result).toBe(false)
          })
        ),
      ),
    )

    scenario(
      'A vitest property on a non-meta object does not match',
      Gherkin.Do.pipe(
        Given('an if-statement whose test is `import.cache.vitest`')('node', () =>
          Effect.sync(() =>
            guardOf({
              type: 'MemberExpression',
              object: metaOf('import', 'cache'),
              property: identifier('vitest'),
            })
          )),
        When('isInSourceTestGuard runs')('result', (s) => Effect.sync(() => isInSourceTestGuard(s.node))),
        Then('it returns false')((s) =>
          Effect.sync(() => {
            expect(s.result).toBe(false)
          })
        ),
      ),
    )

    scenario(
      'A bare vitest expression without an if statement does not match',
      Gherkin.Do.pipe(
        Given('a bare `import.meta.vitest` member expression')(
          'node',
          () => Effect.sync(() => importMetaMember('vitest')),
        ),
        When('isInSourceTestGuard runs')('result', (s) => Effect.sync(() => isInSourceTestGuard(s.node))),
        Then('it returns false')((s) =>
          Effect.sync(() => {
            expect(s.result).toBe(false)
          })
        ),
      ),
    )

    scenario(
      'A plain comparison without a vitest flag does not match',
      Gherkin.Do.pipe(
        Given('an if-statement whose test is a plain binary `a === b`')(
          'node',
          () => Effect.sync(() => guardOf(binaryOf(identifier('a'), identifier('b')))),
        ),
        When('isInSourceTestGuard runs')('result', (s) => Effect.sync(() => isInSourceTestGuard(s.node))),
        Then('it returns false')((s) =>
          Effect.sync(() => {
            expect(s.result).toBe(false)
          })
        ),
      ),
    )

    scenario(
      'A mutant guarded by an ancestor vitest check is ignored',
      Gherkin.Do.pipe(
        Given('ancestors including an `if (import.meta.vitest)` guard deeper in the chain')(
          'ancestors',
          () =>
            Effect.sync(() => [
              identifier('x'),
              binaryOf(identifier('a'), identifier('b')),
              guardOf(importMetaMember('vitest')),
            ]),
        ),
        When('decideInSourceTestIgnore walks the chain')(
          'reason',
          (s) => Effect.sync(() => decideInSourceTestIgnore(s.ancestors)),
        ),
        Then('it returns IN_SOURCE_TEST_IGNORED')((s) =>
          Effect.sync(() => {
            expect(s.reason).toBe(IN_SOURCE_TEST_IGNORED)
          })
        ),
      ),
    )

    scenario(
      'A mutant with no guard in its ancestors stays live',
      Gherkin.Do.pipe(
        Given('ancestors none of which is a vitest guard')(
          'ancestors',
          () => Effect.sync(() => [identifier('x'), guardOf(importMetaMember('env'))]),
        ),
        When('decideInSourceTestIgnore walks the chain')(
          'reason',
          (s) => Effect.sync(() => decideInSourceTestIgnore(s.ancestors)),
        ),
        Then('it returns undefined')((s) =>
          Effect.sync(() => {
            expect(s.reason).toBeUndefined()
          })
        ),
      ),
    )

    scenario(
      'A mutant with no ancestors at all stays live',
      Gherkin.Do.pipe(
        Given('an empty ancestor chain')('ancestors', () => Effect.sync(() => [] as readonly unknown[])),
        When('decideInSourceTestIgnore walks the chain')(
          'reason',
          (s) => Effect.sync(() => decideInSourceTestIgnore(s.ancestors)),
        ),
        Then('it returns undefined')((s) =>
          Effect.sync(() => {
            expect(s.reason).toBeUndefined()
          })
        ),
      ),
    )
  })
