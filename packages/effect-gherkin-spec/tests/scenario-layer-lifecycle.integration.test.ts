import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Context, Effect, Layer } from 'effect'
import { expect } from 'vitest'

interface ScenarioWorkspace {
  readonly marker: string
}

class Workspace extends Context.Service<Workspace, ScenarioWorkspace>()(
  '@systemfsoftware/effect-gherkin-spec/tests/fixtures/ScenarioWorkspace',
) {}

const lifecycle = { opened: 0, closed: 0 }

const scenarioWorkspaceLayer = Layer.effect(
  Workspace,
  Effect.acquireRelease(
    Effect.sync(() => {
      lifecycle.opened += 1
      return { marker: `workspace-${lifecycle.opened}` }
    }),
    () =>
      Effect.sync(() => {
        lifecycle.closed += 1
      }),
  ),
)

const Feature = makeFeature({ it, layer })

Feature('A scenario fixture is opened and closed for each scenario')
  .withScenarioLayer(scenarioWorkspaceLayer)
  .body(({ scenario }) => {
    scenario(
      'The first scenario opens its own workspace and closes nothing yet',
      Gherkin.Do.pipe(
        Given('a fresh workspace for the first scenario')('workspace', () => Workspace),
        When('the first scenario reads its workspace marker')((s) =>
          Effect.sync(() => {
            expect(s.workspace.marker).toBe('workspace-1')
          })
        ),
        Then('nothing has been closed while the first scenario is running')(() =>
          Effect.sync(() => {
            expect(lifecycle.closed).toBe(0)
          })
        ),
      ),
    )

    scenario(
      'A later scenario receives the next workspace after the previous one closed',
      Gherkin.Do.pipe(
        Given('a fresh workspace for the later scenario')('workspace', () => Workspace),
        When('the later scenario reads its workspace marker')((s) =>
          Effect.sync(() => {
            expect(s.workspace.marker).toBe('workspace-2')
          })
        ),
        Then('the previous scenario workspace was closed before this one opened')(() =>
          Effect.sync(() => {
            expect(lifecycle.closed).toBe(1)
          })
        ),
      ),
    )
  })
