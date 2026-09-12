import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'
import { expect } from 'vitest'

import { strykerPlugins as composedPlugins } from '@systemfsoftware/stryker-plugins'
import {
  decideSchemaDeclarationIgnore,
  TAGGED_TAG_IGNORED,
} from '@systemfsoftware/stryker-plugins/effect-schema-ignorer'
import {
  decideWorkflowMakeBoundaryIgnore,
  NOT_INSIDE_WORKFLOW_MAKE,
  strykerPlugins,
} from '@systemfsoftware/stryker-plugins/workflow-make-ignorer'

import { taggedCall } from '../__fixtures__/EffectSchemaAst.fixtures.js'
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
      'A mutant at module level outside any make body is ignored',
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
      'A mutant in a file that imports no workflow is ignored',
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
              // The make call is a sibling statement, not an ancestor: the mutant's
              // chain runs mutant -> body -> binding -> program, and the resolution
              // must keep the body inside the population anyway.
              return makeFixture(mutant, [mutant, body, decision, program])
            }),
        ),
        When('the boundary decision runs on that mutant')(
          'reason',
          (s) => Effect.sync(() => decideWorkflowMakeBoundaryIgnore(s.fixture.mutant, s.fixture.ancestors)),
        ),
        Then('it returns undefined — the referenced function body stays inside the mutation population')((s) =>
          Effect.sync(() => {
            expect(s.reason).toBeUndefined()
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
              // Slot 0 resolves to a class, never a function. A resolver pinned
              // to that slot drops this body from the population and every
              // mutant in the decision silently stops being tested.
              return makeFixture(mutant, [mutant, body, decision, program])
            }),
        ),
        When('the boundary decision runs on that mutant')(
          'reason',
          (s) => Effect.sync(() => decideWorkflowMakeBoundaryIgnore(s.fixture.mutant, s.fixture.ancestors)),
        ),
        Then('it returns undefined — the referenced decider stays inside the mutation population')((s) =>
          Effect.sync(() => {
            expect(s.reason).toBeUndefined()
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
        When('the boundary decision runs on that mutant')(
          'reason',
          (s) => Effect.sync(() => decideWorkflowMakeBoundaryIgnore(s.fixture.mutant, s.fixture.ancestors)),
        ),
        Then('it returns undefined — an argument-slot ancestor is slot-agnostic')((s) =>
          Effect.sync(() => {
            expect(s.reason).toBeUndefined()
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
      'A schema tag outside every make body earns its own distinct reason from each ignorer',
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
      'The entrypoint registers an ignore plugin named workflow-make-boundary',
      Gherkin.Do.pipe(
        Given('the entrypoint plugin array')('plugins', () => Effect.sync(() => strykerPlugins)),
        When('the declared plugin is inspected')('plugin', (s) => Effect.sync(() => s.plugins[0])),
        Then('it is an Ignore-kind plugin named workflow-make-boundary carrying a layer')((s) =>
          Effect.sync(() => {
            expect(s.plugin).toMatchObject({ kind: 'Ignore', name: 'workflow-make-boundary' })
            // The contribution now carries a `Layer` rather than a bare value.
            // That the layer actually provides `Ignorer` is proven where the
            // engine composes it, since building it here would need fabricated
            // `RunConfiguration` and `SandboxDirectory` services.
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
