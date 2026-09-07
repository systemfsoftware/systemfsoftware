import * as NodeFileSystem from '@effect/platform-node-shared/NodeFileSystem'
import * as NodePath from '@effect/platform-node-shared/NodePath'
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Ignorer, type NodePath as StrykerNodePath } from '@systemfsoftware/stryker-js/Ignorer'
import { RunConfiguration, SandboxDirectory } from '@systemfsoftware/stryker-js/Plugin'
import { StrykerOptionsSchema } from '@systemfsoftware/stryker-js/Schema'
import { strykerPlugins } from '@systemfsoftware/stryker-plugins/in-source-test-ignorer'
import { Effect } from 'effect'
import * as Context from 'effect/Context'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import { expect } from 'vitest'

import { binaryOf, guardOf, identifier, importMetaMember, metaOf } from '../__fixtures__/InSourceTestAst.fixtures.js'
import { nodeModuleTestLayer } from '../__fixtures__/NodePlatform.fixtures.js'

const Feature = makeFeature({ it, layer })

const stubPath = (node: unknown, parent?: StrykerNodePath | null): StrykerNodePath => {
  const base = {
    node,
    isObjectExpression: () => false,
    isCallExpression: () => false,
    isClassProperty: () => false,
    isClassPrivateProperty: () => false,
    isClassAccessorProperty: () => false,
  }
  if (parent === undefined) {
    return base
  }
  return { ...base, parentPath: parent }
}

const pathOf = (node: unknown, ancestors: readonly unknown[]): StrykerNodePath => {
  let parent: StrykerNodePath | null | undefined = undefined
  for (let index = ancestors.length - 1; index >= 0; index--) {
    parent = stubPath(ancestors[index], parent ?? undefined)
  }
  return stubPath(node, parent ?? undefined)
}

const ignorerLive = Effect.gen(function*() {
  const plugin = strykerPlugins[0]
  if (plugin === undefined) {
    return yield* Effect.die(new Error('in-source-vitest-block plugin missing'))
  }
  const options = Schema.decodeUnknownSync(StrykerOptionsSchema)({})
  const env = Layer.mergeAll(
    Layer.succeed(RunConfiguration, options),
    Layer.succeed(SandboxDirectory, '/tmp'),
    NodeFileSystem.layer,
    NodePath.layer,
    nodeModuleTestLayer,
  )
  const context = yield* Layer.build(plugin.layer.pipe(Layer.provide(env)))
  return Context.get(context, Ignorer)
})

const ignoredBy = (node: unknown, ancestors: readonly unknown[]) =>
  Effect.gen(function*() {
    const ignorer = yield* ignorerLive
    return ignorer.shouldIgnore(pathOf(node, ancestors))
  })

const mutant = identifier('mutant')

const expectIgnored = (result: Option.Option<string>): void => {
  expect(Option.isSome(result)).toBe(true)
}

const expectLive = (result: Option.Option<string>): void => {
  expect(Option.isNone(result)).toBe(true)
}

Feature('In-source Vitest test guard — the if-statement shape and the ancestor walk')
  .body(({ scenario }) => {
    scenario(
      'A bare vitest flag as the guard condition matches',
      Gherkin.Do.pipe(
        Given('a mutant beneath an if-statement whose test is bare `import.meta.vitest`')(
          'guard',
          () => Effect.sync(() => guardOf(importMetaMember('vitest'))),
        ),
        When('the in-source ignorer walks the ancestor chain through the public layer')(
          'result',
          (s) => ignoredBy(mutant, [s.guard]),
        ),
        Then('the mutant is ignored')((s) =>
          Effect.sync(() => {
            expectIgnored(s.result)
          })
        ),
      ),
    )

    scenario(
      'A vitest flag on the left side of a comparison matches',
      Gherkin.Do.pipe(
        Given('a mutant beneath an if-statement whose test is `import.meta.vitest === undefined`')(
          'guard',
          () => Effect.sync(() => guardOf(binaryOf(importMetaMember('vitest'), identifier('undefined')))),
        ),
        When('the in-source ignorer walks the ancestor chain through the public layer')(
          'result',
          (s) => ignoredBy(mutant, [s.guard]),
        ),
        Then('the mutant is ignored')((s) =>
          Effect.sync(() => {
            expectIgnored(s.result)
          })
        ),
      ),
    )

    scenario(
      'A vitest flag on the right side of a comparison matches',
      Gherkin.Do.pipe(
        Given('a mutant beneath an if-statement whose test is `undefined === import.meta.vitest`')(
          'guard',
          () => Effect.sync(() => guardOf(binaryOf(identifier('undefined'), importMetaMember('vitest')))),
        ),
        When('the in-source ignorer walks the ancestor chain through the public layer')(
          'result',
          (s) => ignoredBy(mutant, [s.guard]),
        ),
        Then('the mutant is ignored')((s) =>
          Effect.sync(() => {
            expectIgnored(s.result)
          })
        ),
      ),
    )

    scenario(
      'A flag for a different meta property does not match',
      Gherkin.Do.pipe(
        Given('a mutant beneath an if-statement whose test is `import.meta.env`')(
          'guard',
          () => Effect.sync(() => guardOf(importMetaMember('env'))),
        ),
        When('the in-source ignorer walks the ancestor chain through the public layer')(
          'result',
          (s) => ignoredBy(mutant, [s.guard]),
        ),
        Then('the mutant stays live')((s) =>
          Effect.sync(() => {
            expectLive(s.result)
          })
        ),
      ),
    )

    scenario(
      'A vitest flag on a non-import meta does not match',
      Gherkin.Do.pipe(
        Given('a mutant beneath an if-statement whose test is `require.meta.vitest`')(
          'guard',
          () =>
            Effect.sync(() =>
              guardOf({
                type: 'MemberExpression',
                object: metaOf('require', 'meta'),
                property: identifier('vitest'),
              })
            ),
        ),
        When('the in-source ignorer walks the ancestor chain through the public layer')(
          'result',
          (s) => ignoredBy(mutant, [s.guard]),
        ),
        Then('the mutant stays live')((s) =>
          Effect.sync(() => {
            expectLive(s.result)
          })
        ),
      ),
    )

    scenario(
      'A vitest property on a non-meta object does not match',
      Gherkin.Do.pipe(
        Given('a mutant beneath an if-statement whose test is `import.cache.vitest`')(
          'guard',
          () =>
            Effect.sync(() =>
              guardOf({
                type: 'MemberExpression',
                object: metaOf('import', 'cache'),
                property: identifier('vitest'),
              })
            ),
        ),
        When('the in-source ignorer walks the ancestor chain through the public layer')(
          'result',
          (s) => ignoredBy(mutant, [s.guard]),
        ),
        Then('the mutant stays live')((s) =>
          Effect.sync(() => {
            expectLive(s.result)
          })
        ),
      ),
    )

    scenario(
      'A bare vitest expression without an if statement does not match',
      Gherkin.Do.pipe(
        Given('a mutant beneath a bare `import.meta.vitest` member expression (no if statement)')(
          'ancestor',
          () => Effect.sync(() => importMetaMember('vitest')),
        ),
        When('the in-source ignorer walks the ancestor chain through the public layer')(
          'result',
          (s) => ignoredBy(mutant, [s.ancestor]),
        ),
        Then('the mutant stays live')((s) =>
          Effect.sync(() => {
            expectLive(s.result)
          })
        ),
      ),
    )

    scenario(
      'A plain comparison without a vitest flag does not match',
      Gherkin.Do.pipe(
        Given('a mutant beneath an if-statement whose test is a plain binary `a === b`')(
          'guard',
          () => Effect.sync(() => guardOf(binaryOf(identifier('a'), identifier('b')))),
        ),
        When('the in-source ignorer walks the ancestor chain through the public layer')(
          'result',
          (s) => ignoredBy(mutant, [s.guard]),
        ),
        Then('the mutant stays live')((s) =>
          Effect.sync(() => {
            expectLive(s.result)
          })
        ),
      ),
    )

    scenario(
      'A mutant guarded by an ancestor vitest check is ignored',
      Gherkin.Do.pipe(
        Given('a mutant with ancestors including an `if (import.meta.vitest)` guard deeper in the chain')(
          'ancestors',
          () =>
            Effect.sync(() => [
              identifier('x'),
              binaryOf(identifier('a'), identifier('b')),
              guardOf(importMetaMember('vitest')),
            ]),
        ),
        When('the in-source ignorer walks the chain through the public layer')(
          'reason',
          (s) => ignoredBy(mutant, s.ancestors),
        ),
        Then('the mutant is ignored')((s) =>
          Effect.sync(() => {
            expectIgnored(s.reason)
          })
        ),
      ),
    )

    scenario(
      'A mutant with no guard in its ancestors stays live',
      Gherkin.Do.pipe(
        Given('a mutant with ancestors none of which is a vitest guard')(
          'ancestors',
          () => Effect.sync(() => [identifier('x'), guardOf(importMetaMember('env'))]),
        ),
        When('the in-source ignorer walks the chain through the public layer')(
          'reason',
          (s) => ignoredBy(mutant, s.ancestors),
        ),
        Then('the mutant stays live')((s) =>
          Effect.sync(() => {
            expectLive(s.reason)
          })
        ),
      ),
    )

    scenario(
      'A mutant with no ancestors at all stays live',
      Gherkin.Do.pipe(
        Given('a mutant with an empty ancestor chain')('ancestors', () => Effect.sync((): readonly unknown[] => [])),
        When('the in-source ignorer walks the chain through the public layer')(
          'reason',
          (s) => ignoredBy(mutant, s.ancestors),
        ),
        Then('the mutant stays live')((s) =>
          Effect.sync(() => {
            expectLive(s.reason)
          })
        ),
      ),
    )
  })
