import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Context, Effect, Layer, Ref } from 'effect'
import { expect } from 'vitest'

interface LifecycleCounters {
  readonly opened: number
  readonly closed: number
}

interface ScenarioWorkspace {
  readonly marker: string
}

class Lifecycle extends Context.Service<Lifecycle, Ref.Ref<LifecycleCounters>>()(
  '@systemfsoftware/effect-gherkin-spec/tests/fixtures/ScenarioLifecycle',
) {}

class Workspace extends Context.Service<Workspace, ScenarioWorkspace>()(
  '@systemfsoftware/effect-gherkin-spec/tests/fixtures/ScenarioWorkspace',
) {}

const lifecycleLayer = Layer.effect(Lifecycle, Ref.make<LifecycleCounters>({ opened: 0, closed: 0 }))

const scenarioWorkspaceLayer = Layer.effect(
  Workspace,
  Effect.gen(function*() {
    const counters = yield* Lifecycle
    return yield* Effect.acquireRelease(
      Effect.gen(function*() {
        const opened = yield* Ref.updateAndGet(counters, (current) => ({
          opened: current.opened + 1,
          closed: current.closed,
        }))
        return { marker: `workspace-${opened.opened}` }
      }),
      () => Ref.update(counters, (current) => ({ opened: current.opened, closed: current.closed + 1 })),
    )
  }),
)

const Feature = makeFeature({ it, layer })

Feature('A scenario fixture is opened and closed for each scenario')
  .withLayer(lifecycleLayer)
  .withScenarioLayer(scenarioWorkspaceLayer)
  .body(({ scenario }) => {
    scenario(
      'The first scenario opens its own workspace and nothing has closed yet',
      Gherkin.Do.pipe(
        Given('a fresh workspace for the first scenario')('workspace', () => Workspace),
        When('the first scenario reads its workspace marker')((s) =>
          Effect.sync(() => {
            expect(s.workspace.marker).toBe('workspace-1')
          })
        ),
        Then('the workspace count shows a single open and no release yet')(() =>
          Effect.gen(function*() {
            const counters = yield* Lifecycle
            expect(yield* Ref.get(counters)).toEqual({ opened: 1, closed: 0 })
          })
        ),
      ),
    )

    scenario(
      'A later scenario receives the next workspace after the previous one was released',
      Gherkin.Do.pipe(
        Given('a fresh workspace for the later scenario')('workspace', () => Workspace),
        When('the later scenario reads its workspace marker')((s) =>
          Effect.sync(() => {
            expect(s.workspace.marker).toBe('workspace-2')
          })
        ),
        Then('the previous workspace was released before this one opened')(() =>
          Effect.gen(function*() {
            const counters = yield* Lifecycle
            expect(yield* Ref.get(counters)).toEqual({ opened: 2, closed: 1 })
          })
        ),
      ),
    )
  })
