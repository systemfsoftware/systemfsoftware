import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { PluginKind } from '@systemfsoftware/stryker-js-plugin-api/plugin'
import { Effect } from 'effect'
import { expect } from 'vitest'

import { decideSchemaDeclarationIgnore, TAGGED_TAG_IGNORED } from '../../src/effect-schema-ignorer/index.js'
import { strykerPlugins as composedPlugins } from '../../src/mod.js'
import {
  decideWorkflowMakeBoundaryIgnore,
  NOT_INSIDE_WORKFLOW_MAKE,
  strykerPlugins,
} from '../../src/workflow-make-ignorer/index.js'

import { taggedCall } from '../helpers/effect-schema-ast.fixtures.js'
import {
  callOf,
  identifier,
  makeBodyOf,
  memberOf,
  programOf,
  stringLiteral,
  unrelatedImport,
  workflowAliasedImport,
  workflowMakeCallOf,
  workflowNamedImport,
  workflowNamespaceImport,
} from '../helpers/workflow-make-ast.fixtures.js'

const Feature = makeFeature({ it, layer })

const makeFixture = (mutant: unknown, ancestors: readonly unknown[]) => ({ mutant, ancestors })

Feature('Workflow.make boundary — the inverted mutation-population selector')
  .body(({ scenario }) => {
    scenario(
      'Should_NotIgnore_When_Mutant_IsInside_MakeBody',
      Gherkin.Do.pipe(
        Given('a file whose `Workflow.make(...)` argument body holds the mutant')('fixture', () =>
          Effect.sync(() => {
            const mutant = stringLiteral('decide')
            const body = makeBodyOf(mutant)
            const call = workflowMakeCallOf(body)
            const program = programOf([workflowNamedImport(), call])
            return makeFixture(mutant, [body, call, program])
          })),
        When('the boundary decision runs on the mutant and its ancestor chain')(
          'reason',
          (s) => Effect.sync(() => decideWorkflowMakeBoundaryIgnore(s.fixture.mutant, s.fixture.ancestors)),
        ),
        Then('it returns undefined — the mutant stays live')((s) =>
          Effect.sync(() => {
            expect(s.reason).toBeUndefined()
          })
        ),
      ),
    )

    scenario(
      'Should_NotIgnore_When_Mutant_IsDeeperThanOneLevelInside_MakeBody',
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
        When('the boundary decision runs on that mutant')(
          'reason',
          (s) => Effect.sync(() => decideWorkflowMakeBoundaryIgnore(s.fixture.mutant, s.fixture.ancestors)),
        ),
        Then('it returns undefined')((s) =>
          Effect.sync(() => {
            expect(s.reason).toBeUndefined()
          })
        ),
      ),
    )

    scenario(
      'Should_Ignore_When_Mutant_IsOutsideEveryMakeBody',
      Gherkin.Do.pipe(
        Given('a file importing Workflow whose module-level body holds the mutant')('fixture', () =>
          Effect.sync(() => {
            const mutant = stringLiteral('admit')
            const program = programOf([workflowNamedImport(), mutant])
            return makeFixture(mutant, [program])
          })),
        When('the boundary decision runs on that mutant')(
          'reason',
          (s) => Effect.sync(() => decideWorkflowMakeBoundaryIgnore(s.fixture.mutant, s.fixture.ancestors)),
        ),
        Then('it returns NOT_INSIDE_WORKFLOW_MAKE')((s) =>
          Effect.sync(() => {
            expect(s.reason).toBe(NOT_INSIDE_WORKFLOW_MAKE)
          })
        ),
      ),
    )

    scenario(
      'Should_Ignore_When_File_ImportsNoWorkflow',
      Gherkin.Do.pipe(
        Given('a file with no effect-cell-types import at all')('fixture', () =>
          Effect.sync(() => {
            const mutant = stringLiteral('plug')
            const program = programOf([unrelatedImport('../local.js', 'Workflow'), mutant])
            return makeFixture(mutant, [program])
          })),
        When('the boundary decision runs on that mutant')(
          'reason',
          (s) => Effect.sync(() => decideWorkflowMakeBoundaryIgnore(s.fixture.mutant, s.fixture.ancestors)),
        ),
        Then('it returns NOT_INSIDE_WORKFLOW_MAKE')((s) =>
          Effect.sync(() => {
            expect(s.reason).toBe(NOT_INSIDE_WORKFLOW_MAKE)
          })
        ),
      ),
    )

    scenario(
      'Should_Ignore_When_WorkflowBound_FromAnotherModule',
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
        When('the boundary decision runs on that mutant')(
          'reason',
          (s) => Effect.sync(() => decideWorkflowMakeBoundaryIgnore(s.fixture.mutant, s.fixture.ancestors)),
        ),
        Then('it returns NOT_INSIDE_WORKFLOW_MAKE — only the cell-types value opens a boundary')((s) =>
          Effect.sync(() => {
            expect(s.reason).toBe(NOT_INSIDE_WORKFLOW_MAKE)
          })
        ),
      ),
    )

    scenario(
      'Should_NotIgnore_When_TwoMakeCallsInOneFile',
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
        When('the boundary decision runs on that mutant')(
          'reason',
          (s) => Effect.sync(() => decideWorkflowMakeBoundaryIgnore(s.fixture.mutant, s.fixture.ancestors)),
        ),
        Then('it returns undefined — every make boundary holds mutation live')((s) =>
          Effect.sync(() => {
            expect(s.reason).toBeUndefined()
          })
        ),
      ),
    )

    scenario(
      'Should_NotIgnore_When_MakeNested_InsideAnotherMakeBody',
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
        When('the boundary decision runs on that mutant')(
          'reason',
          (s) => Effect.sync(() => decideWorkflowMakeBoundaryIgnore(s.fixture.mutant, s.fixture.ancestors)),
        ),
        Then('it returns undefined — the inner make argument is inside a boundary too')((s) =>
          Effect.sync(() => {
            expect(s.reason).toBeUndefined()
          })
        ),
      ),
    )

    scenario(
      'Should_NotIgnore_When_MakeCalledThroughNamespaceImport',
      Gherkin.Do.pipe(
        Given('`import * as Workflow` with the mutant inside the make argument')('fixture', () =>
          Effect.sync(() => {
            const mutant = stringLiteral('namespace')
            const body = makeBodyOf(mutant)
            const call = workflowMakeCallOf(body)
            const program = programOf([workflowNamespaceImport('Workflow'), call])
            return makeFixture(mutant, [body, call, program])
          })),
        When('the boundary decision runs on that mutant')(
          'reason',
          (s) => Effect.sync(() => decideWorkflowMakeBoundaryIgnore(s.fixture.mutant, s.fixture.ancestors)),
        ),
        Then('it returns undefined')((s) =>
          Effect.sync(() => {
            expect(s.reason).toBeUndefined()
          })
        ),
      ),
    )

    scenario(
      'Should_NotIgnore_When_MakeCalledThrough_AliasedImport',
      Gherkin.Do.pipe(
        Given('`import { Workflow as W }` with the mutant inside `W.make(...)`')('fixture', () =>
          Effect.sync(() => {
            const mutant = stringLiteral('aliased')
            const body = makeBodyOf(mutant)
            const call = workflowMakeCallOf(body, 'W')
            const program = programOf([workflowAliasedImport('W'), call])
            return makeFixture(mutant, [body, call, program])
          })),
        When('the boundary decision runs on that mutant')(
          'reason',
          (s) => Effect.sync(() => decideWorkflowMakeBoundaryIgnore(s.fixture.mutant, s.fixture.ancestors)),
        ),
        Then('it returns undefined')((s) =>
          Effect.sync(() => {
            expect(s.reason).toBeUndefined()
          })
        ),
      ),
    )

    scenario(
      'Composition_TagMutant_OutsideMakeBody_IsIgnoredByOneNamedReason',
      Gherkin.Do.pipe(
        Given('a `_tag` inside a TaggedClass declaration sitting outside any make body')(
          'fixture',
          () =>
            Effect.sync(() => {
              const tag = stringLiteral('Placed')
              const fields = { type: 'ObjectExpression' as const }
              const call = taggedCall('TaggedClass', tag, fields)
              const program = programOf([workflowNamedImport(), call])
              return makeFixture(tag, [call, program])
            }),
        ),
        When('both the schema-declaration ignorer and the make-boundary ignorer decide it')(
          'tagverdict',
          (s) =>
            Effect.sync(() => {
              const schemaReason = decideSchemaDeclarationIgnore(s.fixture.mutant, s.fixture.ancestors[0])
              const makeReason = decideWorkflowMakeBoundaryIgnore(s.fixture.mutant, s.fixture.ancestors)
              return { schemaReason, makeReason }
            }),
        ),
        Then('each reports its own named reason, distinct from the other')((s) =>
          Effect.sync(() => {
            expect(s.tagverdict.schemaReason).toBe(TAGGED_TAG_IGNORED)
            expect(s.tagverdict.makeReason).toBe(NOT_INSIDE_WORKFLOW_MAKE)
            expect(s.tagverdict.schemaReason).not.toBe(s.tagverdict.makeReason)
          })
        ),
      ),
    )

    scenario(
      'Should_Register_AnIgnorePlugin_NamedWorkflowMakeBoundary',
      Gherkin.Do.pipe(
        Given('the entrypoint plugin array')('plugins', () => Effect.sync(() => strykerPlugins)),
        When('the declared plugin is inspected')('plugin', (s) => Effect.sync(() => s.plugins[0])),
        Then('it is an Ignore-kind plugin named workflow-make-boundary with a shouldIgnore surface')((s) =>
          Effect.sync(() => {
            expect(s.plugin).toMatchObject({ kind: PluginKind.Ignore, name: 'workflow-make-boundary' })
            expect(typeof s.plugin?.value.shouldIgnore).toBe('function')
          })
        ),
      ),
    )

    scenario(
      'Should_Compose_IntoThePackageBarrel',
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
