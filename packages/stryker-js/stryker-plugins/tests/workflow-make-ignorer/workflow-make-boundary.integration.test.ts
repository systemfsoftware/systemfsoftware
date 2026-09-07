import * as NodeFileSystem from '@effect/platform-node-shared/NodeFileSystem'
import * as NodePath from '@effect/platform-node-shared/NodePath'
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Ignorer, type NodePath as StrykerNodePath } from '@systemfsoftware/stryker-js/Ignorer'
import { RunConfiguration, SandboxDirectory } from '@systemfsoftware/stryker-js/Plugin'
import { StrykerOptionsSchema } from '@systemfsoftware/stryker-js/Schema'
import { strykerPlugins as composedPlugins } from '@systemfsoftware/stryker-plugins'
import { strykerPlugins as schemaPlugins } from '@systemfsoftware/stryker-plugins/effect-schema-ignorer'
import { strykerPlugins } from '@systemfsoftware/stryker-plugins/workflow-make-ignorer'
import { Effect } from 'effect'
import * as Context from 'effect/Context'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import { expect } from 'vitest'

import { objectExpression, taggedCall } from '../__fixtures__/EffectSchemaAst.fixtures.js'
import { nodeModuleTestLayer } from '../__fixtures__/NodePlatform.fixtures.js'
import {
  callOf,
  classDeclarationOf,
  constBindingOf,
  identifier,
  makeBodyOf,
  memberOf,
  programOf,
  stringLiteral,
  unrelatedImport,
  workflowAliasedImport,
  workflowMakeCallOf,
  workflowMakeCallOfTwo,
  workflowNamedImport,
  workflowNamespaceImport,
} from '../__fixtures__/WorkflowMakeAst.fixtures.js'

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

const optionsLive = Schema.decodeUnknownSync(StrykerOptionsSchema)({})
const hostEnv = Layer.mergeAll(
  Layer.succeed(RunConfiguration, optionsLive),
  Layer.succeed(SandboxDirectory, '/tmp'),
  NodeFileSystem.layer,
  NodePath.layer,
  nodeModuleTestLayer,
)

const ignorerFrom = (
  plugins: typeof strykerPlugins,
  name: string,
) =>
  Effect.gen(function*() {
    const plugin = plugins.find((entry) => entry.name === name)
    if (plugin === undefined) {
      return yield* Effect.die(new Error(`${name} plugin missing`))
    }
    const context = yield* Layer.build(plugin.layer.pipe(Layer.provide(hostEnv)))
    return Context.get(context, Ignorer)
  })

const makeIgnorerLive = ignorerFrom(strykerPlugins, 'workflow-make-boundary')
const schemaIgnorerLive = ignorerFrom(schemaPlugins, 'effect-schema-declarations')

const decidedByMake = (node: unknown, ancestors: readonly unknown[]) =>
  Effect.gen(function*() {
    const ignorer = yield* makeIgnorerLive
    return ignorer.shouldIgnore(pathOf(node, ancestors))
  })

const expectIgnored = (result: Option.Option<string>): void => {
  expect(Option.isSome(result)).toBe(true)
}

const expectLive = (result: Option.Option<string>): void => {
  expect(Option.isNone(result)).toBe(true)
}

const makeFixture = (mutant: unknown, ancestors: readonly unknown[]) => ({ mutant, ancestors })

Feature('Workflow.make boundary — the inverted mutation-population selector')
  .body(({ scenario }) => {
    scenario(
      'A mutant inside a Workflow.make body stays live',
      Gherkin.Do.pipe(
        Given('a file whose `Workflow.make(...)` argument body holds the mutant')('fixture', () =>
          Effect.sync(() => {
            const mutant = stringLiteral('decide')
            const body = makeBodyOf(mutant)
            const call = workflowMakeCallOf(body)
            const program = programOf([workflowNamedImport(), call])
            return makeFixture(mutant, [body, call, program])
          })),
        When('the boundary ignorer runs on the mutant and its ancestor chain through the public layer')(
          'reason',
          (s) => decidedByMake(s.fixture.mutant, s.fixture.ancestors),
        ),
        Then('the mutant stays live')((s) =>
          Effect.sync(() => {
            expectLive(s.reason)
          })
        ),
      ),
    )

    scenario(
      'A mutant nested several levels inside a make body stays live',
      Gherkin.Do.pipe(
        Given('a mutant several expression levels below a `Workflow.make(...)` argument')(
          'fixture',
          () =>
            Effect.sync(() => {
              const mutant = identifier('command')
              const callInside = callOf(memberOf('Result', 'succeed'), [mutant])
              const body = makeBodyOf(callInside)
              const call = workflowMakeCallOf(body)
              const program = programOf([workflowNamedImport(), call])
              return makeFixture(mutant, [callInside, body, call, program])
            }),
        ),
        When('the boundary ignorer runs on that mutant through the public layer')(
          'reason',
          (s) => decidedByMake(s.fixture.mutant, s.fixture.ancestors),
        ),
        Then('the mutant stays live')((s) =>
          Effect.sync(() => {
            expectLive(s.reason)
          })
        ),
      ),
    )

    scenario(
      'A mutant at module level outside any make body is ignored',
      Gherkin.Do.pipe(
        Given('a file importing Workflow whose module-level body holds the mutant')('fixture', () =>
          Effect.sync(() => {
            const mutant = stringLiteral('admit')
            const program = programOf([workflowNamedImport(), mutant])
            return makeFixture(mutant, [program])
          })),
        When('the boundary ignorer runs on that mutant through the public layer')(
          'reason',
          (s) => decidedByMake(s.fixture.mutant, s.fixture.ancestors),
        ),
        Then('the mutant is ignored as outside every make body')((s) =>
          Effect.sync(() => {
            expectIgnored(s.reason)
          })
        ),
      ),
    )

    scenario(
      'A mutant in a file that imports no workflow is ignored',
      Gherkin.Do.pipe(
        Given('a file with no effect-cell-types import at all')('fixture', () =>
          Effect.sync(() => {
            const mutant = stringLiteral('plug')
            const program = programOf([unrelatedImport('../local.js', 'Workflow'), mutant])
            return makeFixture(mutant, [program])
          })),
        When('the boundary ignorer runs on that mutant through the public layer')(
          'reason',
          (s) => decidedByMake(s.fixture.mutant, s.fixture.ancestors),
        ),
        Then('the mutant is ignored as outside every make body')((s) =>
          Effect.sync(() => {
            expectIgnored(s.reason)
          })
        ),
      ),
    )

    scenario(
      'A mutant in a make call bound to a local workflow is ignored',
      Gherkin.Do.pipe(
        Given('a `Workflow.make(...)` call whose `Workflow` binding comes from a local module')(
          'fixture',
          () =>
            Effect.sync(() => {
              const mutant = stringLiteral('local')
              const body = makeBodyOf(mutant)
              const call = workflowMakeCallOf(body)
              const program = programOf([unrelatedImport('./local-workflow.js', 'Workflow'), call])
              return makeFixture(mutant, [body, call, program])
            }),
        ),
        When('the boundary ignorer runs on that mutant through the public layer')(
          'reason',
          (s) => decidedByMake(s.fixture.mutant, s.fixture.ancestors),
        ),
        Then('the mutant is ignored — only the cell-types value opens a boundary')((s) =>
          Effect.sync(() => {
            expectIgnored(s.reason)
          })
        ),
      ),
    )

    scenario(
      'A mutant in a function referenced by a make call stays live',
      Gherkin.Do.pipe(
        Given('a `Workflow.make(...)` call whose argument names a same-file function holding the mutant')(
          'fixture',
          () =>
            Effect.sync(() => {
              const mutant = stringLiteral('decide')
              const body = makeBodyOf(mutant)
              const decision = constBindingOf('decision', body)
              const call = workflowMakeCallOf(identifier('decision'))
              const program = programOf([workflowNamedImport(), decision, call])
              return makeFixture(mutant, [mutant, body, decision, program])
            }),
        ),
        When('the boundary ignorer runs on that mutant through the public layer')(
          'reason',
          (s) => decidedByMake(s.fixture.mutant, s.fixture.ancestors),
        ),
        Then('the referenced function body stays inside the mutation population')((s) =>
          Effect.sync(() => {
            expectLive(s.reason)
          })
        ),
      ),
    )

    scenario(
      'A mutant in the decider function of a two-argument make stays live',
      Gherkin.Do.pipe(
        Given(
          'a two-argument `Workflow.make(Command, decide)` whose second argument names the mutant-bearing function',
        )(
          'fixture',
          () =>
            Effect.sync(() => {
              const mutant = stringLiteral('decide')
              const body = makeBodyOf(mutant)
              const decision = constBindingOf('decision', body)
              const command = classDeclarationOf('Cmd')
              const call = workflowMakeCallOfTwo(identifier('Cmd'), identifier('decision'))
              const program = programOf([workflowNamedImport(), command, decision, call])
              return makeFixture(mutant, [mutant, body, decision, program])
            }),
        ),
        When('the boundary ignorer runs on that mutant through the public layer')(
          'reason',
          (s) => decidedByMake(s.fixture.mutant, s.fixture.ancestors),
        ),
        Then('the referenced decider stays inside the mutation population')((s) =>
          Effect.sync(() => {
            expectLive(s.reason)
          })
        ),
      ),
    )

    scenario(
      'A mutant inline in the second argument of a two-argument make stays live',
      Gherkin.Do.pipe(
        Given('a two-argument `Workflow.make(Command, (c) => ...)` holding the mutant inline')(
          'fixture',
          () =>
            Effect.sync(() => {
              const mutant = stringLiteral('inline')
              const body = makeBodyOf(mutant)
              const call = workflowMakeCallOfTwo(identifier('Cmd'), body)
              const program = programOf([workflowNamedImport(), classDeclarationOf('Cmd'), call])
              return makeFixture(mutant, [body, call, program])
            }),
        ),
        When('the boundary ignorer runs on that mutant through the public layer')(
          'reason',
          (s) => decidedByMake(s.fixture.mutant, s.fixture.ancestors),
        ),
        Then('the mutant stays live — an argument-slot ancestor is slot-agnostic')((s) =>
          Effect.sync(() => {
            expectLive(s.reason)
          })
        ),
      ),
    )

    scenario(
      'A mutant naming a missing function is ignored',
      Gherkin.Do.pipe(
        Given('a make call naming an identifier that resolves to no function in the file')(
          'fixture',
          () =>
            Effect.sync(() => {
              const mutant = stringLiteral('admit')
              const call = workflowMakeCallOf(identifier('decideElsewhere'))
              const program = programOf([workflowNamedImport(), call])
              return makeFixture(mutant, [mutant, program])
            }),
        ),
        When('the boundary ignorer runs on that mutant through the public layer')(
          'reason',
          (s) => decidedByMake(s.fixture.mutant, s.fixture.ancestors),
        ),
        Then('the mutant is ignored as outside every make body')((s) =>
          Effect.sync(() => {
            expectIgnored(s.reason)
          })
        ),
      ),
    )

    scenario(
      'A mutant in the second of two make calls stays live',
      Gherkin.Do.pipe(
        Given('a file with two `Workflow.make` calls and a mutant inside the second body')(
          'fixture',
          () =>
            Effect.sync(() => {
              const firstBody = makeBodyOf(identifier('first'))
              const mutant = stringLiteral('second')
              const secondBody = makeBodyOf(mutant)
              const secondCall = workflowMakeCallOf(secondBody)
              const program = programOf([workflowNamedImport(), workflowMakeCallOf(firstBody), secondCall])
              return makeFixture(mutant, [secondBody, secondCall, program])
            }),
        ),
        When('the boundary ignorer runs on that mutant through the public layer')(
          'reason',
          (s) => decidedByMake(s.fixture.mutant, s.fixture.ancestors),
        ),
        Then('every make boundary holds mutation live')((s) =>
          Effect.sync(() => {
            expectLive(s.reason)
          })
        ),
      ),
    )

    scenario(
      'A mutant inside a nested make stays live',
      Gherkin.Do.pipe(
        Given('a `Workflow.make` call inside another make body, with the mutant in the inner body')(
          'fixture',
          () =>
            Effect.sync(() => {
              const mutant = stringLiteral('inner')
              const innerBody = makeBodyOf(mutant)
              const innerCall = workflowMakeCallOf(innerBody)
              const outerBody = makeBodyOf(innerCall)
              const outerCall = workflowMakeCallOf(outerBody)
              const program = programOf([workflowNamedImport(), outerCall])
              return makeFixture(mutant, [innerBody, innerCall, outerBody, outerCall, program])
            }),
        ),
        When('the boundary ignorer runs on that mutant through the public layer')(
          'reason',
          (s) => decidedByMake(s.fixture.mutant, s.fixture.ancestors),
        ),
        Then('the inner make argument is inside a boundary too')((s) =>
          Effect.sync(() => {
            expectLive(s.reason)
          })
        ),
      ),
    )
    scenario(
      'A mutant inside a make called through a namespace import stays live',
      Gherkin.Do.pipe(
        Given('`import * as Workflow` with the mutant inside the make argument')('fixture', () =>
          Effect.sync(() => {
            const mutant = stringLiteral('namespace')
            const body = makeBodyOf(mutant)
            const call = workflowMakeCallOf(body)
            const program = programOf([workflowNamespaceImport('Workflow'), call])
            return makeFixture(mutant, [body, call, program])
          })),
        When('the boundary ignorer runs on that mutant through the public layer')(
          'reason',
          (s) => decidedByMake(s.fixture.mutant, s.fixture.ancestors),
        ),
        Then('the mutant stays live')((s) =>
          Effect.sync(() => {
            expectLive(s.reason)
          })
        ),
      ),
    )

    scenario(
      'A mutant inside a make called through an aliased import stays live',
      Gherkin.Do.pipe(
        Given('`import { Workflow as W }` with the mutant inside `W.make(...)`')('fixture', () =>
          Effect.sync(() => {
            const mutant = stringLiteral('aliased')
            const body = makeBodyOf(mutant)
            const call = workflowMakeCallOf(body, 'W')
            const program = programOf([workflowAliasedImport('W'), call])
            return makeFixture(mutant, [body, call, program])
          })),
        When('the boundary ignorer runs on that mutant through the public layer')(
          'reason',
          (s) => decidedByMake(s.fixture.mutant, s.fixture.ancestors),
        ),
        Then('the mutant stays live')((s) =>
          Effect.sync(() => {
            expectLive(s.reason)
          })
        ),
      ),
    )

    scenario(
      'A schema tag outside every make body earns its own distinct reason from each ignorer',
      Gherkin.Do.pipe(
        Given('a `_tag` inside a TaggedClass declaration sitting outside any make body')(
          'fixture',
          () =>
            Effect.sync(() => {
              const tag = stringLiteral('Placed')
              const fields = objectExpression()
              const call = taggedCall('TaggedClass', tag, fields)
              const program = programOf([workflowNamedImport(), call])
              return makeFixture(tag, [call, program])
            }),
        ),
        When('both public ignorer layers decide it')(
          'tagverdict',
          (s) =>
            Effect.gen(function*() {
              const schemaIgnorer = yield* schemaIgnorerLive
              const makeIgnorer = yield* makeIgnorerLive
              const ancestorCall = s.fixture.ancestors[0]
              const schemaReason = schemaIgnorer.shouldIgnore(
                pathOf(s.fixture.mutant, ancestorCall === undefined ? [] : [ancestorCall]),
              )
              const makeReason = makeIgnorer.shouldIgnore(pathOf(s.fixture.mutant, s.fixture.ancestors))
              return { schemaReason, makeReason }
            }),
        ),
        Then('each reports its own ignored reason, distinct from the other')((s) =>
          Effect.sync(() => {
            expect(Option.isSome(s.tagverdict.schemaReason)).toBe(true)
            expect(Option.isSome(s.tagverdict.makeReason)).toBe(true)
            expect(s.tagverdict.schemaReason).not.toBe(s.tagverdict.makeReason)
          })
        ),
      ),
    )

    scenario(
      'The entrypoint registers an ignore plugin named workflow-make-boundary',
      Gherkin.Do.pipe(
        Given('the entrypoint plugin array')('plugins', () => Effect.sync(() => strykerPlugins)),
        When('the declared plugin is inspected')('plugin', (s) => Effect.sync(() => s.plugins[0])),
        Then('it is an Ignore-kind plugin named workflow-make-boundary carrying a layer')((s) =>
          Effect.sync(() => {
            expect(s.plugin).toMatchObject({ kind: 'Ignore', name: 'workflow-make-boundary' })
            expect(s.plugin?.layer).toBeDefined()
          })
        ),
      ),
    )

    scenario(
      'The package barrel carries all three ignore plugins',
      Gherkin.Do.pipe(
        Given('the package barrel plugin array')('plugins', () => Effect.sync(() => composedPlugins)),
        Then('it carries all three declarable ignorer names')((s) =>
          Effect.sync(() => {
            const names = s.plugins.map((plugin) => plugin.name)
            expect(names).toEqual(
              expect.arrayContaining([
                'effect-schema-declarations',
                'in-source-vitest-block',
                'workflow-make-boundary',
              ]),
            )
          })
        ),
      ),
    )
  })
