import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'
import { expect } from 'vitest'

import {
  decideInSourceTestIgnore,
  IN_SOURCE_TEST_IGNORED,
  isInSourceTestGuard,
} from '../../src/in-source-test-ignorer/index.js'

import { binaryOf, guardOf, identifier, importMetaMember, metaOf } from '../__fixtures__/InSourceTestAst.fixtures.js'

const Feature = makeFeature({ it, layer })

Feature('In-source Vitest test guard — the if-statement shape and the ancestor walk')
  .body(({ scenario }) => {
    scenario(
      'Should_Match_When_TestIsBareImportMetaVitest',
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
      'Should_Match_When_ImportMetaVitestIsBinaryLeft',
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
      'Should_Match_When_ImportMetaVitestIsBinaryRight',
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
      'Should_NotMatch_When_MetaPropertyIsNotVitest',
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
      'Should_NotMatch_When_MetaIsNotImport',
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
      'Should_NotMatch_When_MetaPropertyIsNotMeta',
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
      'Should_NotMatch_When_NodeIsNotAnIfStatement',
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
      'Should_NotMatch_When_BinaryHoldsNoImportMetaVitest',
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
      'Should_Ignore_When_AnAncestorIsTheGuard',
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
      'Should_NotIgnore_When_NoAncestorIsTheGuard',
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
      'Should_NotIgnore_When_ThereAreNoAncestors',
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
