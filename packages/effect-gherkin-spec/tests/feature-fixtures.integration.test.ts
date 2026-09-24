import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { expect } from '@systemfsoftware/vitest'
import { Context, Effect, Layer } from 'effect'

const Feature = makeFeature({ it })

class WorkspaceDirectory extends Context.Service<
  WorkspaceDirectory,
  {
    readonly path: string
    readonly write: (name: string, data: string) => Effect.Effect<void>
    readonly files: Effect.Effect<readonly string[]>
  }
>()('@systemfsoftware/effect-gherkin-spec/tests/feature-fixtures/WorkspaceDirectory') {}

const makeInMemoryWorkspace = (initialPath: string) =>
  Effect.sync(() => {
    const storage: Record<string, string> = {}
    return {
      path: initialPath,
      write: (name: string, data: string) =>
        Effect.sync(() => {
          storage[name] = data
        }),
      files: Effect.sync(() => Object.keys(storage)),
    }
  })

const scenarioWorkspaceLayer = Layer.effect(
  WorkspaceDirectory,
  Effect.acquireRelease(
    makeInMemoryWorkspace('/tmp/scenario-workspace'),
    () => Effect.void,
  ),
)

Feature('Scenario workspace fixture isolation')
  .withScenarioLayer(scenarioWorkspaceLayer)
  .body(({ scenario }) => {
    scenario(
      'Writing a file in one scenario records the file in the isolated workspace',
      Gherkin.Do.pipe(
        Given('an active scenario session')('ready', () => Effect.succeed(true)),
        When('a document is saved to the workspace')(
          'write',
          () =>
            WorkspaceDirectory.pipe(
              Effect.flatMap((ws) => ws.write('spec.txt', 'BDD feature')),
            ),
        ),
        Then('the workspace contains the saved file')(() =>
          WorkspaceDirectory.pipe(
            Effect.flatMap((ws) => ws.files),
            Effect.map((files) => {
              expect(files).toContain('spec.txt')
            }),
          )
        ),
      ),
    )

    scenario(
      'A fresh scenario receives an empty workspace isolated from prior scenarios',
      Gherkin.Do.pipe(
        Given('an active scenario session')('ready', () => Effect.succeed(true)),
        When('inspecting the workspace at the start of a scenario')(
          'files',
          () => WorkspaceDirectory.pipe(Effect.flatMap((ws) => ws.files)),
        ),
        Then('no files from previous scenarios are present')((s) => {
          expect(s.files).toEqual([])
        }),
      ),
    )
  })
